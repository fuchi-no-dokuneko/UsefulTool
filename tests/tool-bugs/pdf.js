T.tests.push(async () => {
  const { w, d, frame } = await T.frame('pdf-to-text');
  async function file(name, text) {
    const pdf = await PDFLib.PDFDocument.create();
    pdf.addPage().drawText(text);
    return new w.File([await pdf.save()], name, {type:'application/pdf'});
  }
  const a = await file('A.pdf', 'Content from A');
  const b = await file('B.pdf', 'Content from B');
  const api = w.UsefulToolPdfToText;
  T.input(w, d.getElementById('pdfFile'), [a]);
  const original = api.selectedFile.arrayBuffer.bind(api.selectedFile);
  let release;
  api.selectedFile.arrayBuffer = () => new Promise(resolve => { release = async () => resolve(await original()); });
  const pending = api.extractSelected();
  await T.wait(() => release);
  T.input(w, d.getElementById('pdfFile'), [b]);
  await release(); await pending;
  a.arrayBuffer = original;
  T.check('selecting B during A extraction discards A output and download',
    d.getElementById('textOutput').value === '' && d.getElementById('downloadButton').disabled);
  await api.extractSelected();
  T.check('B extraction uses B content and filename',
    d.getElementById('textOutput').value.includes('Content from B') && api.selectedFile.name === 'B.pdf');
  const controller = new w.AbortController();
  let cancelled = false;
  try {
    await api.extractBytes(new w.Uint8Array(await b.arrayBuffer()), {
      signal: controller.signal, onProgress: () => controller.abort()
    });
  } catch { cancelled = controller.signal.aborted; }
  T.check('PDF cancellation also releases an active document worker', cancelled);
  T.input(w, d.getElementById('pdfFile'), [new w.File(['%PDF-1.7\ntruncated'], 'damaged.pdf', {type:'application/pdf'})]);
  let failed = false;
  try { await api.extractSelected(); } catch { failed = true; }
  T.check('a damaged PDF clears earlier output and keeps download disabled', failed &&
    !d.getElementById('textOutput').value && d.getElementById('downloadButton').disabled);
  T.input(w, d.getElementById('pdfFile'), [a]);
  const loading = api.extractSelected(); api.reset(); await loading;
  T.check('Clear discards pending PDF work without changing the reset UI',
    !api.selectedFile && d.getElementById('textOutput').value === '' && d.getElementById('extractButton').disabled);
  frame.remove();
});
