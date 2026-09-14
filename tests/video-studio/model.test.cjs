const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const M = require('../../assets/pages/video-studio/model.js');
const { SHA256, hashFile, fileKind } = require('../../assets/pages/video-studio/media.js');
function media(p, kind = 'video', duration = 12, name = 'sample.mp4') {
  return M.addAsset(p, { kind, name, size: 100, contentHash: name, mimeType: kind + '/test', duration, width: 1280, height: 720 });
}
function movie(count = 3) {
  const p = M.createProject();
  for (let i = 0; i < count; i++) M.addMedia(p, media(p, 'video', 12, 'clip-' + i + '.mp4').id);
  return p;
}
test('import order and separate original sound form a playable 36-second movie', () => {
  const p = movie();
  assert.deepEqual(M.mainItems(p).map(i => [i.start, i.end]), [[0,12],[12,24],[24,36]]);
  const a = p.items.filter(i => i.kind === 'audio');
  assert.equal(a.length, 3);
  assert.equal(p.duration, 36);
  assert.equal(a[0].linkedGroupId, M.mainItems(p)[0].linkedGroupId);
  assert.equal(a[0].linkEnabled, true);
  assert.equal(a[0].linkId, M.mainItems(p)[0].linkId);
  assert.equal(M.evaluateFrame(p, 15).items[0].sourceTime, 3);
});
test('sound can run at 2x while picture stays at 1x, then leave silence or repeat', () => {
  const p = movie(1), v = M.mainItems(p)[0], a = p.items.find(i => i.kind === 'audio');
  M.setLink(p, a.id, false);
  M.setSpeed(p, a.id, 2);
  assert.equal(v.end, 12); assert.equal(a.end, 6);
  assert.equal(M.evaluateAudio(p, 7).length, 0);
  M.setRepeat(p, a.id, true);
  assert.equal(a.end, 12); assert.equal(M.evaluateAudio(p, 7)[0].sourceTime, 2);
  assert.equal(M.evaluateAudio(p, 7)[0].preservePitch, true);
  const dupe = M.duplicateItem(p, a.id);
  assert.equal(dupe.start, 12); assert.equal(v.end, 12);
});
test('linked editing starts enabled and keeps source cuts and speed together', () => {
  const p = movie(1), v = M.mainItems(p)[0], a = p.items.find(i => i.kind === 'audio');
  M.setLink(p, v.id, true); M.setSpeed(p, v.id, 2);
  assert.equal(a.end, 6); assert.equal(a.playbackRate, 2);
  const right = M.splitItem(p, v.id, 2);
  const soundRight = p.items.find(i => i.kind === 'audio' && i.linkedGroupId === right.linkedGroupId);
  assert.equal(right.sourceIn, 4); assert.equal(soundRight.sourceIn, 4);
  assert.equal(soundRight.end, 6); assert.equal(a.sourceOut, 4);
  M.setLink(p, right.id, false); M.setSpeed(p, soundRight.id, 4);
  assert.equal(right.playbackRate, 2);
});
test('loop split preserves the original loop region and phase after the cut', () => {
  const p = movie(1), a = p.items.find(i => i.kind === 'audio');
  M.setLink(p, a.id, false);
  M.setSpeed(p, a.id, 2); M.setRepeat(p, a.id, true);
  const before = M.sourceTimeAt(a, 7.5);
  const right = M.splitItem(p, a.id, 4);
  assert.equal(M.sourceTimeAt(right, 7.5), before);
  assert.equal(M.sourceSpan(right), 12);
  assert.equal(M.sourceTimeAt(right, 8), 4);
});
test('main trim ripples picture while independent music keeps absolute time', () => {
  const p = movie(), music = M.addMedia(p, media(p, 'audio', 6, 'music.mp3').id, {start: 10});
  const second = M.mainItems(p)[1]; M.trimItem(p, second.id, 'end', 19);
  assert.deepEqual(M.mainItems(p).map(i => i.start), [0,12,19]);
  assert.equal(music.start, 10);
  const cut = M.splitItem(p, second.id, 15);
  assert.equal(cut.sourceIn, 3); assert.equal(cut.end, 19);
  assert.equal(M.mainItems(p).length, 4);
});
test('images form a movie without videos and get different overlay durations', () => {
  const p = M.createProject(), image = media(p, 'image', 0, 'photo.webp');
  const main = M.addMedia(p, image.id), top = M.addLayerItem(p, 'image', {assetId: image.id});
  assert.equal(M.span(main), 5); assert.equal(M.span(top), 3); assert.equal(p.duration, 5);
  M.fitTransform(p, main, 'fill'); assert.equal(main.transform.width, 1280);
});
test('explicit main transitions permit four decoded videos with two occupied overlays', () => {
  const p = movie(2), a = p.assets[0];
  M.addMedia(p, a.id, {layerId: 'overlay-1', start: 0, duration: 12});
  M.addMedia(p, a.id, {layerId: 'overlay-2', start: 0, duration: 12});
  assert.equal(p.transitions.length, 0);
  M.setTransition(p, M.mainItems(p)[1].id, {type: 'crossfade', duration: 2});
  const frame = M.evaluateFrame(p, 11);
  assert.equal(frame.videoCount, 4); assert.equal(frame.transitions[0].progress, .5);
  assert.throws(() => M.addMedia(p, a.id, {layerId: 'overlay-1', start: 1}), /occupied/);
});
test('transitions clamp to usable adjacent frames and prevent triple main intersections', () => {
  const p = M.createProject();
  for (let i = 0; i < 3; i++) M.addMedia(p, media(p, 'video', 2, 'short-' + i).id);
  M.setTransition(p, M.mainItems(p)[1].id, {type:'wipe', duration:5});
  assert.ok(p.transitions[0].duration <= 2 - 1/30);
  assert.throws(() => M.setTransition(p, M.mainItems(p)[2].id, {type:'slide', duration:1}), /0.1 seconds/);
  M.removeTransition(p, M.mainItems(p)[1].id);
  assert.deepEqual(M.mainItems(p).map(i => i.start), [0,2,4]);
});
test('the shared audio limit detects overlap and caps the stereo plan at three sources', () => {
  const p = movie(1), source = media(p, 'audio', 12, 'music.mp3');
  for (let i = 0; i < 5; i++) M.addMedia(p, source.id, {start: 0});
  M.mainItems(p)[0].opacity = .1;
  assert.equal(M.audioConflicts(p)[0].items.length, 6);
  assert.equal(M.evaluateAudio(p, 2).length, 3);
  assert.ok(M.evaluateAudio(p, 2).every(a => a.left === 1));
  M.layer(p, 'music').solo = true;
  assert.equal(M.evaluateAudio(p, 2).length, 3);
  p.soundBalance.music = .5; assert.equal(M.evaluateAudio(p, 2)[0].right, .5);
});
test('audio limit uses half-open time ranges and respects muted hidden and solo tracks', () => {
  const p = movie(1), source = media(p, 'audio', 4, 'boundary.mp3');
  const a = M.addMedia(p, source.id, {start: 0});
  const b = M.addMedia(p, source.id, {start: 0});
  const c = M.addMedia(p, source.id, {start: 4});
  assert.equal(M.audioConflicts(p).length, 0);
  M.moveItem(p, c.id, 3);
  assert.deepEqual(M.audioConflicts(p).map(c => [c.start, c.end]), [[3, 4]]);
  c.audio.muted = true;
  assert.equal(M.audioConflicts(p).length, 0);
  c.audio.muted = false;
  M.layer(p, 'music').visible = false;
  assert.equal(M.audioConflicts(p).length, 0);
  M.layer(p, 'music').visible = true;
  M.layer(p, 'music').solo = true;
  assert.equal(M.evaluateAudio(p, 3.5).length, 3);
  assert.equal(M.audioConflicts(p).length, 0);
  assert.ok([a, b, c].every(i => M.evaluateAudio(p, 3.5).some(e => e.item.id === i.id)));
});
test('automatic audio correction preserves locked clips and never deletes source items', () => {
  const p = movie(1), source = media(p, 'audio', 12, 'locked.mp3');
  for (let i = 0; i < 3; i++) M.addMedia(p, source.id, {start: 0});
  const sounds = M.visibleItems(p, 1, true), last = sounds.at(-1), length = p.items.length;
  last.locked = true;
  const muted = M.fixAudioConflicts(p);
  assert.equal(muted.length, 1);
  assert.notEqual(muted[0], last.id);
  assert.equal(last.audio.muted, false);
  assert.equal(p.items.length, length);
  assert.equal(M.audioConflicts(p).length, 0);
  for (const sound of sounds) { sound.audio.muted = false; sound.locked = true; }
  const before = M.serialize(p);
  assert.throws(() => M.fixAudioConflicts(p), /Unlock or move/);
  assert.equal(M.serialize(p), before);
});
test('whole movie music repeats at its own rate and fades during the final second', () => {
  const p = movie(1), sound = M.addMedia(p, media(p, 'audio', 3, 'short.mp3').id);
  M.setRepeat(p, sound.id, true, true); M.setSpeed(p, sound.id, 1.5);
  assert.equal(sound.end, 12); assert.equal(sound.audio.fadeOut, 1);
  assert.equal(M.sourceTimeAt(sound, 5), 1.5);
  assert.equal(M.evaluateAudio(p, 11.5).find(e => e.item.id === sound.id).left, .5);
  M.trimItem(p, M.mainItems(p)[0].id, 'end', 8);
  assert.equal(sound.end, 8);
});
test('visibility interpolation, effects order, presets and split boundaries remain editable', () => {
  const p = movie(1), v = M.mainItems(p)[0];
  M.setKey(v, 0, 0, 'linear'); M.setKey(v, 10, 1);
  assert.equal(M.evaluateFrame(p, 5).items[0].opacity, .5);
  const right = M.splitItem(p, v.id, 5);
  assert.equal(M.curveAt(right.opacityKeys, 0), .5); assert.equal(M.curveAt(right.opacityKeys, 2.5), .75);
  M.addEffect(right, 'brightness'); M.addEffect(right, 'hue');
  assert.deepEqual(M.evaluateFrame(p, 6).items[0].effects.map(f => f.type), ['brightness','hue']);
  M.applyOverlayPreset(p, [v.id, right.id], 'groovy');
  assert.equal(right.opacity, .55); assert.equal(v.transform.x, -14);
});
test('locked item operations leave the timeline untouched', () => {
  const p = movie(1), v = M.mainItems(p)[0]; v.locked = true;
  const before = M.serialize(p);
  assert.equal(M.moveItem(p, v.id, 3), false); assert.equal(M.trimItem(p, v.id, 'end', 4), false);
  assert.equal(M.deleteItem(p, v.id), false); assert.equal(M.duplicateItem(p, v.id), null);
  assert.throws(() => M.applyOverlayPreset(p, [v.id], 'groovy'), /Unlock/);
  assert.equal(M.serialize(p), before);
});
test('project round trip retains all object kinds, effects, keys, transitions and audio settings', () => {
  const p = movie(2);
  const text = M.addLayerItem(p, 'text'); text.text.content = '<script>literal text</script>';
  M.addLayerItem(p, 'filter'); M.addLayerItem(p, 'credits');
  M.addLayerItem(p, 'image', {assetId: media(p, 'image', 0, 'overlay.png').id});
  M.setTransition(p, M.mainItems(p)[1].id, {type:'dissolve', duration:1});
  M.setKey(text, 2, .7, 'smooth'); M.addEffect(text, 'hue'); p.exportSettings.bitrate = 8;
  const roundtrip = M.parseProject(M.serialize(p)); p.updatedAt = roundtrip.updatedAt;
  assert.deepEqual(roundtrip, p);
  assert.throws(() => M.parseProject('{"schemaVersion":9}'), /version/);
  const invalid = M.copy(p); invalid.items[0].end = -1;
  assert.throws(() => M.parseProject(JSON.stringify(invalid)), /timeline/);
});
test('undo and redo preserve 80 edits and discard the redo branch after a new edit', () => {
  const p = movie(1), history = new M.History(p);
  for (let i = 0; i < 90; i++) { p.name = 'Edit ' + i; history.push(p); }
  let restored, count = 0; while (history.canUndo) { restored = history.undo(); count++; }
  assert.equal(count, 80); assert.equal(restored.name, 'Edit 9');
  assert.equal(history.redo().name, 'Edit 10');
  restored.name = 'New branch'; history.push(restored); assert.equal(history.canRedo, false);
});
test('credits speed and duration modes, frame times and segmented output boundaries', () => {
  const p = movie(1), credits = M.addLayerItem(p, 'credits');
  credits.credits.mode = 'speed'; credits.credits.speed = 100; M.updateCreditsDuration(p, credits);
  const duration = M.span(credits); credits.credits.groups.push({id:'extra',title:'Extra',content:'One\nTwo'});
  M.updateCreditsDuration(p, credits); assert.ok(M.span(credits) > duration);
  assert.equal(M.formatTime(3661.5), '01:01:01:15');
  assert.deepEqual(M.segmentRanges(4.05, 2), [{start:0,end:2},{start:2,end:4.05}]);
  assert.throws(() => M.segmentRanges(100, 1), /60 segments/);
  assert.throws(() => M.segmentRanges(1, .01), /0.1 seconds/);
  assert.deepEqual(M.exportDimensions(p, 'standard'), {width:1920,height:1080});
});
test('incremental SHA-256 matches independent Node crypto, including block and chunk boundaries', async () => {
  for (const length of [0,3,55,56,63,64,65,127,128,65537,1000000]) {
    const bytes = crypto.randomBytes(length), sha = new SHA256();
    for (let i=0; i<length; i+=37) sha.update(bytes.subarray(i,i+37));
    assert.equal(sha.digest(), crypto.createHash('sha256').update(bytes).digest('hex'), String(length));
  }
  assert.equal(await hashFile(new Blob(['abc'])), crypto.createHash('sha256').update('abc').digest('hex'));
  assert.equal(fileKind({name:'TRACK.MP3',type:''}), 'audio');
  assert.equal(fileKind({name:'photo.JPEG',type:''}), 'image');
  assert.throws(() => fileKind({name:'program.exe',type:''}), /Choose/);
});

test('malformed nested project data is rejected before it reaches the renderer or player', () => {
  const p = movie(2);
  M.addLayerItem(p, 'text'); M.addLayerItem(p, 'credits'); M.addLayerItem(p, 'filter');
  M.addEffect(M.mainItems(p)[0], 'brightness');
  const corruptions = [
    q => q.layers.splice(0, 1),
    q => q.layers[1].order = -1,
    q => q.mainOrder.push(q.mainOrder[0]),
    q => q.assets[0].thumbnail = 'https://example.invalid/track.png',
    q => q.assets[0].waveform = [-1],
    q => q.items[0].sourceOut = 500,
    q => q.items[0].transform.width = -1,
    q => q.items[0].effects[0].amount = null,
    q => q.items[0].opacityKeys.push({time:0,value:5,easing:'linear'}),
    q => q.items.find(i=>i.kind==='audio').audio.leftGain = 3,
    q => q.items.find(i=>i.kind==='text').text = null,
    q => q.items.find(i=>i.kind==='filter').filter.amount = 51,
    q => q.items.find(i=>i.kind==='credits').credits.groups = [null],
    q => q.exportSettings.fps = 1.5,
    q => q.soundBalance.video = -1,
    q => q.transitions.push({id:'bad',toId:q.mainOrder[0],fromId:'missing',duration:1,type:'wipe'})
  ];
  for (const corrupt of corruptions) { const invalid=M.copy(p); corrupt(invalid); assert.throws(()=>M.parseProject(JSON.stringify(invalid))); }
  assert.doesNotThrow(()=>M.parseProject(M.serialize(p)));
});

test('copied visual layers can change their front/back order independently', () => {
  const p = movie(1), text = M.addLayerItem(p, 'text'), duplicate = M.duplicateItem(p, text.id);
  assert.notEqual(duplicate.layerId, text.layerId);
  M.layer(p, duplicate.layerId).order = 8;
  assert.ok(M.layer(p,text.layerId).order > 8);
});

test('credits Fit duration updates speed when trimmed and uses the actual credits box', () => {
  const p = movie(1), c = M.addLayerItem(p, 'credits');
  c.transform.height = 360;
  M.updateCreditsDuration(p,c);
  const speed = c.credits.speed;
  M.trimItem(p,c.id,'end',c.start+5);
  assert.equal(c.credits.speed, speed*2);
  c.credits.mode='speed'; M.updateCreditsDuration(p,c);
  assert.equal(M.span(c),5);
});
