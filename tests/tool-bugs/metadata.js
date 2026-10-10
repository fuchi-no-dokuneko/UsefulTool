T.tests.push(async () => {
  const { w, d, frame } = await T.frame('metadata-lab');
  for (const [name, path] of [['source','/tests/video-studio/fixtures/source.mp4'],['video-editor','/tests/fixtures/video-editor.mp4']]) {
    const bytes = new Uint8Array(await (await fetch(path)).arrayBuffer());
    T.input(w, d.getElementById('fileInput'), [new w.File([bytes], name+'.mp4', {type:'video/mp4'})]);
    await T.wait(() => !d.getElementById('runButton').disabled);
    const api = w.UsefulToolMetadata;
    const erased = api.stripMp4Ranges(bytes, 0, bytes.length, '');
    const injected = api.injectMp4Free(bytes, 'Private note to erase');
    T.check(name+' metadata erase preserves file length', erased.length === bytes.length);
    T.check(name+' metadata inject preserves original media positions', bytes.every((v,i) => injected[i] === v));
    const cleaned = api.stripMp4Ranges(injected, 0, injected.length, '');
    T.check(name+' erasing injected metadata removes the private note', !new TextDecoder().decode(cleaned).includes('Private note to erase'));
    await T.upload('metadata-'+name+'-erase.mp4', new Blob([erased]));
    await T.upload('metadata-'+name+'-inject.mp4', new Blob([injected]));
  }
  frame.remove();
});
