(async () => {
  const { Model: M, Media, SessionStore } = UTStudio;
  const checks = [];
  function check(name, condition) { checks.push({ name, passed: Boolean(condition) }); if (!condition) throw new Error(name); }
  let library, store;
  try {
    const file = async (name, type) => new File([await (await fetch('fixtures/' + name)).blob()], name, {type});
    library = new Media.MediaLibrary(); store = new SessionStore();
    const project = M.createProject();
    const video = await library.read(await file('source.mp4', 'video/mp4'), 'video');
    const imported = M.addAsset(project, video); M.addMedia(project, imported.id);
    check('real video metadata and thumbnail decode', video.duration > .9 && video.width === 160 && video.thumbnail.startsWith('data:image/png'));
    check('real video audio has measured waveform', video.waveform.length === 512 && video.waveform.some(n => n > 0));
    const decoder=library.assets.get(video.id).probe;
    await Promise.all([Media.seek(decoder,.7),Media.seek(decoder,.2),Media.seek(decoder,.8)]);
    check('concurrent preview and playback seeks finish at the latest requested frame',Math.abs(decoder.currentTime-.8)<.01&&decoder.readyState>=2);
    const mp3 = await library.read(await file('music.mp3', 'audio/mpeg'), 'audio');
    M.addAsset(project, mp3); M.addMedia(project, mp3.id);
    check('independent MP3 decodes duration and waveform', mp3.duration > .9 && mp3.waveform.some(n => n > 0));
    const c = document.createElement('canvas'); c.width = 24; c.height = 16;
    c.getContext('2d').fillRect(0,0,12,16);
    const png = new File([await new Promise(resolve => c.toBlob(resolve))], 'overlay.png', {type:'image/png'});
    const image = await library.read(png, 'image'); M.addAsset(project, image); M.addLayerItem(project, 'image', {assetId: image.id});
    check('transparent image decodes and reports actual alpha', image.transparent && image.width === 24 && image.height === 16);
    for (const [mime,name] of [['image/jpeg','photo.jpg'],['image/jpeg','photo.jpeg'],['image/webp','photo.webp']]) {
      const picture=await library.read(new File([await new Promise(resolve=>c.toBlob(resolve,mime))],name,{type:mime}),'image');
      check(name+' imports as a decoded still image',picture.width===24&&picture.height===16&&picture.thumbnail.startsWith('data:image/'));
    }
    const gif=Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),char=>char.charCodeAt(0));
    const gifImage=await library.read(new File([gif],'photo.gif',{type:'image/gif'}),'image');
    check('GIF imports as a stable still image',gifImage.width===1&&gifImage.animated&&library.assets.get(gifImage.id).image instanceof HTMLCanvasElement);
    const bmp=new Uint8Array(70), bmpView=new DataView(bmp.buffer);bmp[0]=66;bmp[1]=77;
    for(const [offset,value] of [[2,70],[10,54],[14,40],[18,2],[22,2],[34,16]])bmpView.setUint32(offset,value,true);
    bmpView.setUint16(26,1,true);bmpView.setUint16(28,24,true);bmp.fill(255,54);
    const bmpImage=await library.read(new File([bmp],'photo.bmp',{type:'image/bmp'}),'image');
    check('BMP imports with its pixel dimensions',bmpImage.width===2&&bmpImage.height===2);
    for(const [label,bad,kind] of [
      ['empty file',new File([],'empty.mp4',{type:'video/mp4'}),'video'],
      ['unsupported format',new File(['x'],'program.exe'),'video'],
      ['corrupt codec',new File(['not video'],'broken.mp4',{type:'video/mp4'}),'video'],
      ['oversized image',{name:'huge.png',type:'image/png',size:25*1024*1024+1},'image'],
      ['oversized audio',{name:'huge.mp3',type:'audio/mpeg',size:1024*1024*1024+1},'audio']]) {
      let rejected=false;try{await library.read(bad,kind);}catch(error){rejected=!!error.message;}
      check(label+' returns an actionable import error',rejected);
    }
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
