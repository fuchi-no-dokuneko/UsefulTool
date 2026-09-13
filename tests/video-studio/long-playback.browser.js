(async () => {
  const checks = [],
    runs = [],
    events = [],
    renders = [],
    tasks = [];
  const check = (name, passed, detail) =>
    checks.push({ name, passed: Boolean(passed), detail });
  const wait = async (predicate, timeout = 30000) => {
    const start = performance.now();
    while (!predicate()) {
      if (performance.now() - start > timeout)
        throw new Error("Long playback setup timed out");
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const frame = document.getElementById("studio");
  let w, d, api, M, activeRun;
  window.TEST_PROGRESS = { checks, runs };
  try {
    await wait(() => frame.contentWindow.UsefulToolVideoEditor?.ready);
    w = frame.contentWindow;
    d = frame.contentDocument;
    api = w.UsefulToolVideoEditor;
    M = api.Model;
    const [source, mp3] = await Promise.all([
      fetch(
        "../../build/reports/video-studio/long-fixtures/timecode-90s.mp4",
      ).then((r) => r.blob()),
      fetch(
        "../../build/reports/video-studio/long-fixtures/repeat-7s.mp3",
      ).then((r) => r.blob()),
    ]);
    await api.importFiles(
      [new w.File([source], "timecode-90s.mp4", { type: "video/mp4" })],
      "video",
    );
    const video = api.project.assets[0];
    check(
      "fixture matches the reported long H.264/AAC input",
      video.width === 1280 &&
        video.height === 720 &&
        Math.abs(video.duration - 90) < 0.05 &&
        video.size > 25 * 1024 * 1024,
      { duration: video.duration, bytes: video.size },
    );
    await api.importFiles(
      [new w.File([mp3], "repeat-7s.mp3", { type: "audio/mpeg" })],
      "audio",
    );
    d.getElementById("studioDialog").close();
    const music = api.project.assets.find((a) => a.kind === "audio");
    const clean = M.copy(api.project);
    clean.items = clean.items.filter((i) => i.assetId === video.id);
    M.normalize(clean);
    api.setStep("arrange");
    function instrument() {
      const original = api.renderer.render.bind(api.renderer);
      api.renderer.render = (project, time, target) => {
        const start = performance.now(),
          plan = original(project, time, target);
        if (activeRun)
          renders.push({
            run: activeRun,
            at: start,
            time,
            ms: performance.now() - start,
            layers: plan.videoCount,
          });
        return plan;
      };
      const element = api.library.element.bind(api.library),
        observed = new WeakSet();
      api.library.element = (item) => {
        const value = element(item);
        if (value && !observed.has(value)) {
          observed.add(value);
          if (value.requestVideoFrameCallback) {
            const presented = (_, metadata) => {
              value.testFrameTime = metadata.mediaTime;
              if (!value.utvDisposed)
                value.requestVideoFrameCallback(presented);
            };
            value.requestVideoFrameCallback(presented);
          }
          for (const type of [
            "seeking",
            "seeked",
            "waiting",
            "stalled",
            "playing",
            "ended",
            "ratechange",
          ])
            value.addEventListener(type, () => {
              if (activeRun)
                events.push({
                  run: activeRun,
                  type,
                  item: item.id,
                  kind: item.kind,
                  source: value.currentTime,
                  time: api.project.playhead,
                  at: performance.now(),
                });
            });
        }
        return value;
      };
    }
    new w.PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (activeRun)
          tasks.push({ run: activeRun, start: e.startTime, ms: e.duration });
    }).observe({ type: "longtask", buffered: true });
    let musicMeter = null;
    const sample = () => {
      const p = api.project,
        time = p.playhead;
      const sounds = M.evaluateAudio(p, time),
        pictures = M.evaluateFrame(p, time).items.filter(
          (e) => e.item.kind === "video",
        );
      const mapping = (entry) => {
        const e = api.library.elements.get(entry.item.id);
        return {
          id: entry.item.id,
          source: e?.currentTime,
          expected: entry.sourceTime,
          rate: entry.item.playbackRate,
          loopLength: entry.item.audio?.loop ? M.sourceSpan(entry.item) : 0,
          paused: e?.paused,
          seeking: e?.seeking,
          ready: e?.readyState,
          frameSource: e?.testFrameTime,
        };
      };
      const music = sounds.find((e) => e.item.audio.category === "music");
      if (music && !musicMeter && api.mixer.chains.has(music.item.id)) {
        musicMeter = api.mixer.context.createAnalyser();
        musicMeter.fftSize = 2048;
        api.mixer.chains.get(music.item.id).merge.connect(musicMeter);
      }
      let musicPeak = null;
      if (musicMeter) {
        const data = new Float32Array(2048);
        musicMeter.getFloatTimeDomainData(data);
        musicPeak = Math.max(...data.map(Math.abs));
      }
      return {
        at: performance.now(),
        time,
        sounds: sounds.map(mapping),
        pictures: pictures.map(mapping),
        peak: api.mixer.peak(),
        musicPeak,
        label: d.getElementById("playButton")?.getAttribute("aria-label"),
      };
    };
    async function run(name, project, start, seconds) {
      await api.replaceProject(M.copy(project));
      musicMeter = null;
      api.setStep("arrange");
      await api.seekTo(start);
      await api.store.flush();
      instrument();
      activeRun = name;
      const began = performance.now();
      const firstSound = api.project.items.find((i) => i.kind === "audio");
      let firstFrame = null;
      const original = api.engine.onFrame;
      api.engine.onFrame = (...args) => {
        if (args[0] > start && firstFrame === null)
          firstFrame = performance.now();
        original(...args);
      };
      d.getElementById("playButton").click();
      await wait(() => api.engine.playing);
      const song = api.project.items.find((i) => i.audio?.category === "music");
      if (song) await wait(() => api.mixer.chains.has(song.id));
      const samples = [sample()];
      for (let second = 1; second <= seconds; second++) {
        // Measure a complete second after the preceding observation. An absolute
        // catch-up schedule compresses the next interval after a delayed timer,
        // incorrectly reporting e.g. 0.88s progress over 0.88s as a playback stall.
        const due = samples.at(-1).at + 1000;
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, due - performance.now()),
          ),
        );
        samples.push(sample());
        window.TEST_PROGRESS.current = {
          name,
          second,
          time: samples.at(-1).time,
        };
      }
      const pauseBegan = performance.now();
      d.getElementById("playButton").click();
      await wait(() => !api.engine.playing, 1000);
      const pauseMs = performance.now() - pauseBegan;
      const pausePosition = api.project.playhead;
      await new Promise((r) => setTimeout(r, 120));
      const deltas = samples.slice(1).map((s, i) => ({
        second: i + 1,
        media: s.time - samples[i].time,
        real: (s.at - samples[i].at) / 1000,
      }));
      const drift =
        samples.at(-1).time -
        samples[0].time -
        (samples.at(-1).at - samples[0].at) / 1000;
      const startMs = firstFrame === null ? null : firstFrame - began;
      const itemError = (s) =>
        [...s.pictures, ...s.sounds]
          .filter((e) => Number.isFinite(e.source))
          .map((e) => {
            const difference = Math.abs(e.source - e.expected);
            return (
              (e.loopLength
                ? Math.min(difference, Math.abs(difference - e.loopLength))
                : difference) / e.rate
            );
          });
      const maxSyncError = Math.max(0, ...samples.slice(1).flatMap(itemError));
      const frameErrors = samples
        .slice(1)
        .flatMap((s) =>
          s.pictures.map((p) =>
            Number.isFinite(p.frameSource)
              ? Math.abs(p.frameSource - p.expected) / p.rate
              : Infinity,
          ),
        );
      const result = {
        name,
        seconds,
        startMs,
        pauseMs,
        drift,
        maxSyncError,
        maxFrameError: Math.max(0, ...frameErrors),
        samples,
        deltas,
        firstSound: firstSound?.id,
      };
      runs.push(result);
      check(
        name + ": every one-second sample advances 0.9–1.1 seconds",
        deltas.every((s) => s.media >= 0.9 && s.media <= 1.1),
        deltas.filter((s) => s.media < 0.9 || s.media > 1.1),
      );
      check(
        name + ": total clock drift is below 100 ms",
        Math.abs(drift) < 0.1,
        drift,
      );
      check(
        name + ": playback starts below 300 ms",
        startMs !== null && startMs < 300,
        startMs,
      );
      check(
        name + ": Pause stops picture sound and time below 100 ms",
        pauseMs < 100 &&
          api.project.playhead === pausePosition &&
          [...api.library.elements.values()].every((e) => e.paused),
        pauseMs,
      );
      check(
        name + ": picture and sound stay within 100 ms of the playhead",
        maxSyncError < 0.1,
        maxSyncError,
      );
      check(
        name + ": presented video frame timestamps stay within 100 ms",
        frameErrors.length > 0 && frameErrors.every((e) => e < 0.1),
        Math.max(0, ...frameErrors),
      );
      if (project.items.some((i) => i.audio?.category === "music"))
        check(
          name + ": background music remains audible across every repeat",
          samples
            .slice(1)
            .every(
              (s) =>
                s.musicPeak > 0.02 &&
                s.sounds.filter((a) => a.loopLength).every((a) => !a.paused),
            ),
          samples.slice(1).filter((s) => !(s.musicPeak > 0.02)),
        );
      activeRun = null;
    }
    await run("main video from 12s", clean, 12, 60);
    const layered = M.copy(clean);
    const first = M.mainItems(layered)[0];
    M.setLink(layered, first.id, true);
    const right = M.splitItem(layered, first.id, 36);
    M.setTransition(layered, right.id, { type: "crossfade", duration: 0.5 });
    M.addMedia(layered, video.id, { duration: 11.8 });
    for (const [layerId, start, duration] of [
      ["overlay-1", 18, 32],
      ["overlay-2", 28, 17],
    ]) {
      M.addMedia(layered, video.id, { layerId, start, duration });
    }
    const text = M.addLayerItem(layered, "text", { start: 12, duration: 64 });
    text.text.content = "Long-video playback regression";
    const blur = M.addLayerItem(layered, "filter", { start: 16, duration: 56 });
    blur.filter.amount = 12;
    blur.transform = {
      ...blur.transform,
      x: 540,
      y: 250,
      width: 300,
      height: 180,
    };
    const credits = M.addLayerItem(layered, "credits", {
      start: 56,
      duration: 45.3,
    });
    credits.credits.background = "transparent";
    credits.transform = {
      ...credits.transform,
      x: 950,
      y: 200,
      width: 300,
      height: 420,
    };
    const song = M.addMedia(layered, music.id, { start: 0 });
    M.setRepeat(layered, song.id, true, true);
    M.normalize(layered);
    check(
      "layered project includes transition overlays blur text credits and repeating music",
      Math.abs(layered.duration - 101.3) < 0.05 && song.audio.loop,
      { duration: layered.duration },
    );
    await run("layered movie from 12s", layered, 12, 60);
    await run("layered movie from 45s", layered, 45, 45);
    window.TEST_RESULT = {
      passed: checks.every((c) => c.passed),
      checks,
      runs,
      events,
      renders,
      tasks,
    };
  } catch (error) {
    window.TEST_RESULT = {
      passed: false,
      checks,
      runs,
      events,
      renders,
      tasks,
      error: error.stack,
    };
  }
  document.getElementById("result").textContent = JSON.stringify(
    { ...window.TEST_RESULT, events: undefined, renders: undefined },
    null,
    2,
  );
})();
