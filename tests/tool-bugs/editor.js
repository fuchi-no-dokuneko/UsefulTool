T.tests.push(async () => {
  const a = await T.frame('word-count');
  const b = window.open('/word-count.html', 'second-editor');
  await T.wait(() => b?.UsefulToolTextEditor);
  a.d.getElementById('newDraft').click();
  a.d.getElementById('text').value = 'Draft A must survive';
  a.w.UsefulToolWordCount.saveText();
  b.document.getElementById('text').value = 'Draft B must survive';
  b.UsefulToolWordCount.saveText();
  const key = a.w.UsefulToolTextEditor.storageKeys.drafts;
  const saved = JSON.parse(a.w.localStorage.getItem(key));
  T.check('a stale second editor tab preserves both independently saved drafts',
    saved.some(d => d.text === 'Draft A must survive') && saved.some(d => d.text === 'Draft B must survive'));
  const id = saved.find(d => d.text === 'Draft A must survive').id;
  a.w.confirm = () => true;
  a.d.getElementById('deleteDraft').click();
  b.document.getElementById('text').value = 'Draft B edited again';
  b.UsefulToolWordCount.saveText();
  T.check('autosave from another tab cannot resurrect an explicitly deleted draft',
    !b.UsefulToolDraftStore.read().some(d => d.id === id));
  b.close();
  a.d.getElementById('mode').value = 'javascript';
  for (const source of [
    'const re=/a{2}/;return re.test("aa");',
    'const re=/[{};\\/]+/;return re.test("{/;");',
    'const n=8/2/2;return n===2;',
    '/* braces { ; } */const t=`hello ${2+3}`;return t==="hello 5";'
  ]) {
    // Wrap return statements in an ordinary valid JavaScript function.
    a.d.getElementById('text').value = 'function example(){' + source + '}';
    const formatted = await a.w.UsefulToolTextEditor.formatCurrent();
    T.check('JavaScript formatting preserves executable syntax: ' + source.slice(0, 28),
      Function(formatted + ';return example();')() === true);
  }
  const before = 'const re=/a{2}/;';
  a.d.getElementById('text').value = 'const unfinished =';
  await a.w.UsefulToolTextEditor.formatCurrent();
  T.check('incomplete JavaScript remains untouched when parsing fails',
    a.d.getElementById('text').value === 'const unfinished =' && /could not be formatted/.test(a.d.getElementById('status').textContent));
  a.d.getElementById('text').value = before;
  const pending = a.w.UsefulToolTextEditor.formatCurrent();
  a.d.getElementById('text').value = 'newer input';
  await pending;
  T.check('asynchronous formatting preserves newer typing', a.d.getElementById('text').value === 'newer input');
  a.frame.remove();
});
