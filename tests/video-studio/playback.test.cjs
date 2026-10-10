const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const M = require("../../assets/pages/video-studio/model.js");
const Media = require("../../assets/pages/video-studio/media.js");

function harness(delayFor = () => 0) {
  let now = 0,
    nextId = 0;
  const frames = new Map(),
    deadlines = [],
    elements = new Map(),
    calls = [];
  const project = M.createProject();
  M.addAsset(project, {
    id: "source",
    kind: "video",
    hasAudio: true,
    name: "long.mp4",
    duration: 90,
    width: 1280,
    height: 720,
  });
  M.addMedia(project, "source");
  class Element {
    constructor(item) {
      this.item = item;
      this.position = 0;
      this.anchor = 0;
      this.rate = 1;
      this.duration = M.asset(project, item.assetId).duration;
      this.paused = true;
      this.loop = false;
    }
    get currentTime() {
      const value =
        this.position +
        (this.paused ? 0 : ((now - this.anchor) * this.rate) / 1000);
      if (this.loop) return value % this.duration;
      if (value >= this.duration - 1e-7) {
        this.paused = true;
        this.position = this.duration;
      }
      return Math.min(value, this.duration);
    }
    set currentTime(value) {
      this.position = value;
      this.anchor = now;
    }
    get playbackRate() {
      return this.rate;
    }
    set playbackRate(value) {
      this.position = this.currentTime;
      this.anchor = now;
      this.rate = value;
    }
    play() {
      this.position = this.currentTime;
      this.anchor = now;
      this.paused = false;
      calls.push({ kind: "play", item: this.item.id, at: now });
      return Promise.resolve();
    }
    pause() {
      this.position = this.currentTime;
      this.paused = true;
    }
  }
  const library = {
    elements,
    element(item) {
      if (!elements.has(item.id)) elements.set(item.id, new Element(item));
      return elements.get(item.id);
    },
    pause() {
      elements.forEach((e) => e.pause());
    },
  };
  const seek = (element, time, signal) =>
    new Promise((resolve, reject) => {
      calls.push({ kind: "seek", item: element.item.id, at: now });
      if (signal?.aborted) {
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      const abort = () => reject(new DOMException("Cancelled", "AbortError"));
      signal?.addEventListener("abort", abort, { once: true });
      const finish = () => {
        signal?.removeEventListener("abort", abort);
        if (signal?.aborted) return;
        element.currentTime = time;
        resolve();
      };
      const delay = delayFor(element.item, now);
      if (delay) deadlines.push({ at: now + delay, finish });
      else finish();
    });
  const context = {
    UTStudio: { Model: M, Media: { seek } },
    performance: { now: () => now },
    AbortController,
    requestAnimationFrame(fn) {
      const id = ++nextId;
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  };
  const source =
    process.env.PLAYBACK_ENGINE_SOURCE ||
    path.resolve(__dirname, "../../assets/pages/video-studio/engine.js");
  vm.runInNewContext(fs.readFileSync(source, "utf8"), context);
  const mixer = {
    ready: async () => {},
    chain() {},
    apply() {},
    peak: () => 0,
    silence() {},
  };
  const renderer = { render: (_, time) => ({ time, visibleVideoLayers: 1 }) };
  const engine = new context.UTStudio.Engine(
    () => project,
    library,
    renderer,
    mixer,
    {},
  );
  const drain = async () => {
    for (let i = 0; i < 15; i++) await Promise.resolve();
  };
  const advance = async (duration) => {
    const end = now + duration;
    while (now < end) {
      now = Math.min(end, now + 10);
      for (const d of deadlines.splice(0)) {
        if (d.at <= now) d.finish();
        else deadlines.push(d);
      }
      await drain();
      const scheduled = [...frames.values()];
      frames.clear();
      scheduled.forEach((f) => f(now));
      await drain();
    }
  };
  return {
    project,
    engine,
    renderer,
    elements,
    calls,
    advance,
    drain,
    now: () => now,
    burn: (ms) => {
      now += ms;
    },
  };
}

test("a slow incoming decoder cannot freeze the main playhead or existing sound", async () => {
  const h = harness((item) => (item.layerId === "overlay-1" ? 1200 : 0));
  M.addMedia(h.project, "source", {
    layerId: "overlay-1",
    start: 2,
    duration: 5,
  });
  const playing = h.engine.play();
  await h.drain();
  let previous = h.project.playhead;
  for (let second = 1; second <= 6; second++) {
    await h.advance(1000);
    const progress = h.project.playhead - previous;
    assert.ok(
      progress >= 0.9 && progress <= 1.1,
      `second ${second}: ${progress}`,
    );
    previous = h.project.playhead;
  }
  h.engine.stop();
  assert.equal(await playing, false);
});

test("unavailable audio keeps picture playback moving and retries on the next Play", async () => {
  const h = harness();
  h.engine.mixer.ready = async () => {
    throw Object.assign(new Error("No output"), { name: "AudioOutputError" });
  };
  const silent = h.engine.play();
  await h.advance(1000);
  assert.equal(h.engine.audioUnavailable, true);
  assert.ok(h.project.playhead >= 0.9);
  assert.ok([...h.elements.values()].every((e) => e.item.kind === "video"));
  h.engine.stop();
  assert.equal(await silent, false);
  h.engine.mixer.ready = async () => {};
  const restored = h.engine.play();
  await h.advance(500);
  assert.equal(h.engine.audioUnavailable, false);
  assert.ok(
    [...h.elements.values()].some((e) => e.item.kind === "audio" && !e.paused),
  );
  h.engine.stop();
  assert.equal(await restored, false);
});

test("recording never silently drops sound when audio startup fails", async () => {
  const h = harness();
  h.engine.mixer.ready = async () => {
    throw Object.assign(new Error("No output"), { name: "AudioOutputError" });
  };
  const recording = h.engine.play({ recording: true });
  await assert.rejects(recording, { name: "AudioOutputError" });
  assert.equal(h.engine.playing, false);
  assert.equal(h.calls.filter((c) => c.kind === "play").length, 0);
});

test("stopping during audio startup aborts it and a late resume cannot restart playback", async () => {
  const h = harness();
  let signal, resume;
  h.engine.mixer.ready = (value) => {
    signal = value;
    return new Promise((resolve) => {
      resume = resolve;
    });
  };
  const playing = h.engine.play();
  await h.drain();
  h.engine.stop();
  assert.equal(signal.aborted, true);
  resume();
  await h.advance(500);
  assert.equal(await playing, false);
  assert.equal(h.project.playhead, 0);
  assert.equal(h.calls.length, 0);
});

test("correcting an audio clock does not pause or restart the audible stream", async () => {
  const h = harness((item, now) =>
    item.kind === "audio" && now >= 3000 ? 120 : 0,
  );
  const playing = h.engine.play();
  await h.drain();
  await h.advance(3000);
  const item = h.project.items.find((item) => item.kind === "audio"),
    sound = h.elements.get(item.id),
    starts = () =>
      h.calls.filter((call) => call.kind === "play" && call.item === item.id)
        .length;
  sound.currentTime -= 0.6;
  const before = starts();
  await h.advance(220);
  assert.equal(
    sound.paused,
    false,
    "a pending correction must not silence playback",
  );
  await h.advance(1000);
  assert.equal(sound.paused, false);
  assert.equal(starts(), before, "correction uses the existing playing stream");
  assert.ok(Math.abs(sound.currentTime - h.engine.currentTime) < 0.1);
  h.engine.stop();
  await playing;
});

test("pause cancels pending preparation and cannot be undone by a late decoder", async () => {
  const h = harness((item) => (item.layerId === "overlay-1" ? 5000 : 0));
  M.addMedia(h.project, "source", {
    layerId: "overlay-1",
    start: 2,
    duration: 5,
  });
  const playing = h.engine.play();
  await h.drain();
  await h.advance(2100);
  h.engine.stop();
  const position = h.project.playhead,
    stoppedAt = h.now();
  assert.equal(h.engine.playing, false);
  await h.advance(6000);
  assert.equal(await playing, false);
  assert.equal(h.project.playhead, position);
  assert.ok([...h.elements.values()].every((e) => e.paused));
  assert.ok(
    h.calls.filter((c) => c.kind === "play").every((c) => c.at < stoppedAt),
  );
});

test("a late composed frame cannot leave the transport clock behind wall time", async () => {
  const h = harness();
  const render = h.renderer.render;
  let delayed = false;
  h.renderer.render = (project, time) => {
    if (time >= 2 && !delayed) {
      delayed = true;
      h.burn(1200);
    }
    return render(project, time);
  };
  const playing = h.engine.play();
  await h.drain();
  await h.advance(2100);
  assert.ok(delayed);
  assert.ok(Math.abs(h.project.playhead - h.now() / 1000) < 0.1);
  h.engine.stop();
  assert.equal(await playing, false);
});

test("full-source repeating sound keeps playing without per-frame seeks", async () => {
  const h = harness();
  M.addAsset(h.project, {
    id: "music",
    kind: "audio",
    name: "music.mp3",
    duration: 7,
  });
  const song = M.addMedia(h.project, "music", { start: 0 });
  M.setRepeat(h.project, song.id, true, true);
  const playing = h.engine.play();
  await h.drain();
  for (let i = 0; i < 60; i++) {
    await h.advance(1000);
    assert.equal(
      h.elements.get(song.id).paused,
      false,
      `sound stopped after ${i + 1} seconds`,
    );
  }
  assert.ok(
    h.calls.filter((c) => c.kind === "seek" && c.item === song.id).length <= 2,
  );
  h.engine.stop();
  assert.equal(await playing, false);
});

test("a trimmed repeat keeps its requested range instead of looping the whole file", async () => {
  const h = harness();
  M.addAsset(h.project, {
    id: "music",
    kind: "audio",
    name: "music.mp3",
    duration: 7,
  });
  const song = M.addMedia(h.project, "music", { start: 0, duration: 6.98 });
  M.setRepeat(h.project, song.id, true, true);
  const playing = h.engine.play();
  await h.drain();
  await h.advance(7050);
  const element = h.elements.get(song.id);
  assert.equal(element.loop, false);
  assert.equal(element.paused, false);
  assert.ok(
    Math.abs(element.currentTime - M.sourceTimeAt(song, h.project.playhead)) <
      0.1,
  );
  h.engine.stop();
  assert.equal(await playing, false);
});

test("a cancelled seek releases its successor without waiting for obsolete pixels", async () => {
  const element = new EventTarget();
  Object.assign(element, {
    readyState: 1,
    duration: 90,
    currentTime: 0,
    seeking: true,
  });
  const controller = new AbortController();
  const previous = Media.seek(element, 5, controller.signal);
  // There is metadata but deliberately no decoded frame/event for the old target.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(element.currentTime, 5);
  controller.abort();
  const latest = Media.seek(element, 42);
  await assert.rejects(previous, { name: "AbortError" });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(element.currentTime, 42);
  element.readyState = 2;
  element.seeking = false;
  element.dispatchEvent(new Event("seeked"));
  await latest;
});
