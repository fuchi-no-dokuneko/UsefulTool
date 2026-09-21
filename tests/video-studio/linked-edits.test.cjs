const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../assets/pages/video-studio/model.js');
function movie() {
  const p = M.createProject();
  for (let i = 0; i < 3; i++) {
    const a = M.addAsset(p, { name: i+'.mp4', kind: 'video', size: 10,
      duration: 10, width: 160, height: 90, hasAudio: true });
    M.addMedia(p, a.id);
  }
  return p;
}
test('trimming linked sound ripples all following pictures and sounds', () => {
  const p = movie(), sound = p.items.find(i => i.kind === 'audio');
  M.trimItem(p, sound.id, 'end', 5);
  assert.deepEqual(M.mainItems(p).map(i => [i.start, i.end]), [[0,5],[5,15],[15,25]]);
  assert.deepEqual(p.items.filter(i => i.audio).map(i => [i.start, i.end]), [[0,5],[5,15],[15,25]]);
  assert.equal(sound.sourceOut, 5);
  assert.equal(M.evaluateFrame(p, 7).items.length, 1);
});
test('duplicating through linked sound inserts a main clip and ripples later pairs', () => {
  const p = movie(), sound = p.items.find(i => i.kind === 'audio');
  M.setChannelMode(sound, 'rightOnly');
  const dupe = M.duplicateItem(p, sound.id);
  assert.deepEqual(M.mainItems(p).map(i => [i.start, i.end]), [[0,10],[10,20],[20,30],[30,40]]);
  assert.equal(dupe.audio.channelMode, 'rightOnly');
  assert.notEqual(dupe.linkId, sound.linkId);
  for (const v of M.mainItems(p)) {
    const a = p.items.find(i => i.audio && i.linkId === v.linkId);
    assert.deepEqual([a.start,a.end,a.sourceIn,a.sourceOut], [v.start,v.end,v.sourceIn,v.sourceOut]);
  }
});
test('deleting a transitioned middle clip removes obsolete overlaps before reflow', () => {
  const p = movie(), [a,b,c] = M.mainItems(p);
  M.setTransition(p, b.id, { type: 'crossfade', duration: 2 });
  M.setTransition(p, c.id, { type: 'crossfade', duration: 2 });
  const history = new M.History(p);
  M.deleteItem(p, b.id);
  history.push(p);
  assert.equal(p.transitions.length, 0);
  assert.equal(c.start, a.end);
  assert.equal(c.end, 20);
  const old = history.undo();
  assert.equal(old.transitions.length, 2);
  assert.equal(history.redo().duration, 20);
});
