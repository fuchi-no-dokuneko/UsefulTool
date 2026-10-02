const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../../assets/pages/video-studio/model.js");

function movie() {
  const project = M.createProject();
  const asset = M.addAsset(project, {
    kind: "video",
    name: "fixture.mp4",
    size: 100,
    contentHash: "fixture",
    duration: 6,
    width: 640,
    height: 360,
    hasAudio: true,
  });
  const video = M.addMedia(project, asset.id);
  return { project, video, sound: project.items.find((i) => i.audio) };
}

test("VE01 effect timing resolves current bounds and never stores an inverted interval", () => {
  const { project, video } = movie(),
    fx = M.addEffect(video, "brightness");
  M.setEffectRange(project, video.id, fx.id, { end: 2 });
  for (const range of [
    { start: 4 },
    { start: -1 },
    { end: 7 },
    { end: NaN },
    { start: Infinity },
    { start: null },
    { end: "2" },
  ]) {
    const before = M.serialize(project);
    assert.throws(
      () => M.setEffectRange(project, video.id, fx.id, range),
      /effect|range|finite/i,
    );
    assert.equal(M.serialize(project), before);
  }
  M.setEffectRange(project, video.id, fx.id, { start: 1, end: 2 });
  assert.deepEqual([fx.start, fx.end], [1, 2]);
  assert.equal(M.evaluateFrame(project, 1.5).items[0].effects.length, 1);
  assert.equal(M.evaluateFrame(project, 2.5).items[0].effects.length, 0);
  assert.doesNotThrow(() => M.parseProject(M.serialize(project)));
  fx.start = 4;
  assert.throws(() => M.serialize(project), /effect/i);
  assert.throws(() => M.parseProject(JSON.stringify(project)), /effect/i);
});

test("VE01 recovery repairs only finite inverted effect ranges and retains strict parsing", () => {
  const { project, video } = movie(),
    fx = M.addEffect(video, "brightness");
  fx.start = 4;
  fx.end = 2;
  const repaired = M.recoverEffectRanges(JSON.stringify(project));
  assert.deepEqual(
    repaired.items[0].effects.map((f) => [f.start, f.end]),
    [[2, 4]],
  );
  assert.equal(repaired.items.length, project.items.length);
  assert.doesNotThrow(() => M.parseProject(M.serialize(repaired)));
  fx.amount = null;
  assert.throws(
    () => M.recoverEffectRanges(JSON.stringify(project)),
    /effect/i,
  );
});

test("VE02 source changes reject item and layer locks without partial writes", () => {
  for (const target of ["video", "sound"])
    for (const lock of ["item", "layer"]) {
      const { project, video, sound } = movie();
      const locked = target === "sound" ? sound : video;
      (lock === "item" ? locked : M.layer(project, locked.layerId)).locked =
        true;
      for (const bounds of [
        [1, 6],
        [0, 5],
      ]) {
        const before = M.serialize(project);
        assert.throws(
          () => M.setSourceBounds(project, video.id, ...bounds),
          /Unlock/,
        );
        assert.equal(M.serialize(project), before);
        assert.throws(
          () => M.setSourceBounds(project, sound.id, ...bounds),
          /Unlock/,
        );
        assert.equal(M.serialize(project), before);
      }
    }
});

test("VE02 source changes validate ripple locks and bounds, preserve identities and round trip", () => {
  const { project, video, sound } = movie();
  const later = M.addMedia(project, video.assetId);
  later.locked = true;
  let before = M.serialize(project);
  assert.throws(() => M.setSourceBounds(project, video.id, 1, 6), /Unlock/);
  assert.equal(M.serialize(project), before);
  later.locked = false;
  for (const bounds of [
    [-1, 6],
    [0, 7],
    [5, 4],
    [1, 1],
    [NaN, 5],
    [0, Infinity],
  ]) {
    before = M.serialize(project);
    assert.throws(() => M.setSourceBounds(project, video.id, ...bounds));
    assert.equal(M.serialize(project), before);
  }
  const history = new M.History(project),
    transform = video.transform;
  M.setSourceBounds(project, video.id, 1, 6);
  assert.equal(M.item(project, video.id), video);
  assert.equal(video.transform, transform);
  for (const v of [video, sound])
    assert.deepEqual([v.sourceIn, v.sourceOut, v.start, v.end], [1, 6, 0, 5]);
  assert.equal(later.start, 5);
  history.push(project);
  assert.equal(history.undo().items[0].sourceIn, 0);
  assert.equal(history.redo().items[0].sourceIn, 1);
  assert.deepEqual(M.parseProject(M.serialize(project)).items, project.items);
});
