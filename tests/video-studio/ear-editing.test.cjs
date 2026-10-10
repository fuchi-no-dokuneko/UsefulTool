const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../../assets/pages/video-studio/model.js");

function fixture(kind = "video") {
  const p = M.createProject();
  const a = M.addAsset(p, {
    kind,
    name: "stereo." + (kind === "video" ? "mp4" : "mp3"),
    size: 100,
    contentHash: "stereo",
    mimeType: kind + "/test",
    duration: 40,
    width: 320,
    height: 180,
    hasAudio: true,
  });
  return [p, M.addMedia(p, a.id)];
}

test("video decoupling preserves source stereo and moves each ear independently by 15 seconds", () => {
  const [p, video] = fixture(),
    h = new M.History(p);
  const [left, right] = M.decoupleChannels(p, video.id);
  h.push(p);
  assert.equal(p.items.length, 3);
  assert.equal(video.linkEnabled, false);
  assert.deepEqual(M.audioRouting(left.audio), {
    left: 1,
    right: 0,
    mono: false,
    sourceChannel: "left",
  });
  assert.deepEqual(M.audioRouting(right.audio), {
    left: 0,
    right: 1,
    mono: false,
    sourceChannel: "right",
  });
  M.moveItem(p, right.id, 15);
  assert.deepEqual([left.start, right.start, video.start], [0, 15, 0]);
  assert.deepEqual(
    [M.sourceTimeAt(left, 20), M.sourceTimeAt(right, 20)],
    [20, 5],
  );
  M.moveItem(p, left.id, 5);
  assert.deepEqual([left.start, right.start, video.start], [5, 15, 0]);
  assert.equal(M.audioConflicts(p).length, 0);
  h.push(p);
  assert.deepEqual(
    h
      .undo()
      .items.filter((i) => i.audio)
      .map((i) => i.start),
    [0, 0],
  );
  assert.equal(h.undo().items.length, 2);
  assert.equal(h.redo().items.length, 3);
  const restored = M.parseProject(M.serialize(p));
  assert.deepEqual(restored.items, p.items);
});

test("MP3 ear tracks retain trim, speed, gains, fades and looping without whole-movie pinning", () => {
  const [p, sound] = fixture("audio");
  M.trimItem(p, sound.id, "start", 5);
  M.setSpeed(p, sound.id, 2);
  sound.audio.volume = 0.6;
  sound.audio.leftGain = 0.8;
  sound.audio.rightGain = 0.4;
  sound.audio.fadeIn = 0.5;
  sound.audio.fadeOut = 1;
  sound.audio.loop = true;
  sound.audio.wholeMovie = true;
  const [left, right] = M.decoupleChannels(p, sound.id);
  for (const ear of [left, right]) {
    assert.equal(ear.sourceIn, 5);
    assert.equal(ear.playbackRate, 2);
    assert.equal(ear.audio.volume, 0.6);
    assert.equal(ear.audio.fadeIn, 0.5);
    assert.equal(ear.audio.fadeOut, 1);
    assert.equal(ear.audio.loop, true);
    assert.equal(ear.audio.wholeMovie, false);
  }
  assert.equal(left.audio.leftGain, 0.8);
  assert.equal(right.audio.rightGain, 0.4);
  assert.throws(() => M.decoupleChannels(p, left.id), /Select a stereo/);
});

test("disabled picture and ear tracks restore without modifying or unlinking segments", () => {
  const [p, video] = fixture();
  const [left, right] = M.decoupleChannels(p, video.id);
  const before = M.copy(p.items);
  M.layer(p, "main").visible = false;
  assert.equal(M.evaluateFrame(p, 1).items.length, 0);
  assert.equal(M.evaluateAudio(p, 1).length, 2);
  M.layer(p, left.layerId).muted = true;
  assert.deepEqual(
    M.evaluateAudio(p, 1).map((e) => e.item.id),
    [right.id],
  );
  M.layer(p, left.layerId).muted = false;
  M.layer(p, "main").visible = true;
  assert.equal(M.evaluateAudio(p, 1).length, 2);
  assert.deepEqual(p.items, before);
});

test("copy sound snapshots only that segment, preserves edits after source deletion and supports repeat paste", () => {
  const [p, video] = fixture(),
    sound = p.items.find((i) => i.audio);
  const clipboard = M.copySegment(p, sound.id);
  assert.equal(clipboard.items.length, 1);
  sound.audio.volume = 0.2;
  M.deleteItem(p, video.id);
  const first = M.pasteSegment(p, clipboard, 17),
    second = M.pasteSegment(p, clipboard, 60);
  assert.equal(first.start, 17);
  assert.equal(first.end, 57);
  assert.equal(first.audio.volume, 1);
  assert.equal(first.linkEnabled, false);
  assert.equal(second.start, 60);
  assert.notEqual(first.id, second.id);
  assert.equal(p.items.length, 2);
});

test("copy a decoupled ear preserves source selection through paste, split, trim and round trip", () => {
  const [p, video] = fixture();
  const [left] = M.decoupleChannels(p, video.id);
  M.trimItem(p, left.id, "start", 3);
  const dupe = M.pasteSegment(p, M.copySegment(p, left.id), 50);
  assert.equal(dupe.sourceIn, 3);
  assert.equal(dupe.audio.sourceChannel, "left");
  const cut = M.splitItem(p, dupe.id, 55);
  assert.equal(cut.audio.sourceChannel, "left");
  assert.equal(cut.sourceIn, 8);
  assert.deepEqual(M.parseProject(M.serialize(p)).items, p.items);
});

test("main paste at an interior playhead splits and ripples picture plus linked sound", () => {
  const [p, video] = fixture(),
    clip = M.copySegment(p, video.id);
  const dupe = M.pasteSegment(p, clip, 10);
  assert.deepEqual(
    M.mainItems(p).map((i) => [i.start, i.end]),
    [
      [0, 10],
      [10, 50],
      [50, 80],
    ],
  );
  assert.equal(dupe.sourceIn, 0);
  assert.equal(M.mainItems(p)[2].sourceIn, 10);
  assert.equal(M.related(p, dupe).length, 2);
  assert.ok(M.related(p, dupe).every((i) => i.start === 10 && i.end === 50));
  assert.deepEqual(M.parseProject(M.serialize(p)).items, p.items);
});

test("main paste can leave a gap at the chosen time and future edits retain it", () => {
  const [p, video] = fixture();
  const dupe = M.pasteSegment(p, M.copySegment(p, video.id), 55);
  assert.equal(dupe.start, 55);
  assert.equal(dupe.gapBefore, 15);
  M.reflow(p);
  assert.equal(M.item(p, dupe.id).start, 55);
  const right = M.splitItem(p, dupe.id, 60);
  M.reflow(p);
  assert.equal(right.start, 60);
  assert.equal(right.gapBefore, 0);
});

test("locked destinations and ripple clips reject paste atomically", () => {
  const [p, video] = fixture(),
    clip = M.copySegment(p, video.id);
  M.layer(p, "video-sound").locked = true;
  const before = M.serialize(p);
  assert.throws(() => M.pasteSegment(p, clip, 10), /Unlock/);
  assert.equal(M.serialize(p), before);
  assert.throws(() => M.decoupleChannels(p, video.id), /Unlock/);
  assert.equal(M.serialize(p), before);
});

test("overlay copy pastes at exact free position and rejects overlap without partial changes", () => {
  const [p, video] = fixture();
  M.moveItem(p, video.id, 0, "overlay-1");
  const clip = M.copySegment(p, video.id),
    before = M.serialize(p);
  assert.throws(() => M.pasteSegment(p, clip, 5), /occupied/);
  assert.equal(M.serialize(p), before);
  const pasted = M.pasteSegment(p, clip, 52);
  assert.equal(pasted.start, 52);
  assert.equal(pasted.layerId, "overlay-1");
});
