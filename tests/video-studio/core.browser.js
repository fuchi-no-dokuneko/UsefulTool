(async () => {
  const { Model: M, Media, SessionStore } = UTStudio;
  const checks = [];
  function check(name, condition) { checks.push({ name, passed: Boolean(condition) }); if (!condition) throw new Error(name); }
  let library, store;
  try {
    const file = async (name, type) => new File([await (await fetch('../../build/reports/video-studio/fixtures/' + name)).blob()], name, {type});
    library = new Media.MediaLibrary(); store = new SessionStore();
    const project = M.createProject();
    const video = await library.read(await file('source.mp4', 'video/mp4'), 'video');
    const imported = M.addAsset(project, video); M.addMedia(project, imported.id);
    check('real video metadata and thumbnail decode', video.duration > .9 && video.width === 160 && video.thumbnail.startsWith('data:image/png'));
    check('real video audio has measured waveform', video.waveform.length === 512 && video.waveform.some(n => n > 0));
    const mp3 = await library.read(await file('music.mp3', 'audio/mpeg'), 'audio');
    M.addAsset(project, mp3); M.addMedia(project, mp3.id);
    check('independent MP3 decodes duration and waveform', mp3.duration > .9 && mp3.waveform.some(n => n > 0));
    const c = document.createElement('canvas'); c.width = 24; c.height = 16;
    c.getContext('2d').fillRect(0,0,12,16);
    const png = new File([await new Promise(resolve => c.toBlob(resolve))], 'overlay.png', {type:'image/png'});
    const image = await library.read(png, 'image'); M.addAsset(project, image); M.addLayerItem(project, 'image', {assetId: image.id});
    check('transparent image decodes and reports actual alpha', image.transparent && image.width === 24 && image.height === 16);
    for (const a of project.assets) await store.putFile(a, library.assets.get(a.id).file);
    store.schedule(project); await store.flush();
    const recovered = await store.load(), secondLibrary = new Media.MediaLibrary();
    const missing = await store.restore(recovered, secondLibrary);
    check('IndexedDB round trip restores every media blob', missing.length === 0 && secondLibrary.assets.size === 3);
    check('project object counts and exact edit settings survive recovery', M.serialize(recovered).replace(/"updatedAt": \d+/, '') === M.serialize(project).replace(/"updatedAt": \d+/, ''));
    const independentStore = new SessionStore();
    check('refresh session key is stable across controller recreation', independentStore.key === store.key);
    let rejected = false;
    try { await secondLibrary.relink(video, new File(['bad'], 'source.mp4', {type:'video/mp4'})); } catch { rejected = true; }
    check('relink rejects a different file despite matching name', rejected);
    const thirdLibrary = new Media.MediaLibrary();
    await thirdLibrary.relink(video, library.assets.get(video.id).file);
    check('relink accepts matching name size and full SHA-256', thirdLibrary.has(video.id));
    const scene = await library.analyze(video);
    check('AutoMovie measures actual scene differences and audio peaks', scene.cuts.length > 0 && scene.cuts.every(cut => Number.isFinite(cut.change)));
    secondLibrary.dispose(); thirdLibrary.dispose();
    await store.clear(); check('starting a new session clears the cached project', await store.load() === null);
    window.TEST_RESULT = {passed:true, checks};
  } catch (error) { window.TEST_RESULT = {passed:false, checks, error: error.stack}; }
  finally { library?.dispose(); if (store?.db) store.db.close(); }
  document.getElementById('result').textContent = JSON.stringify(window.TEST_RESULT, null, 2);
})();
