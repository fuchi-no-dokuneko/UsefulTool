T.tests.push(async () => {
  const { w, d, frame } = await T.frame('image-converter');
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 3;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,0,0,0.5)'; ctx.fillRect(1, 0, 1, 3);
  ctx.fillStyle = 'red'; ctx.fillRect(2, 0, 1, 3);
  const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  await w.UsefulToolImageConverter.loadImage(new w.File([png], 'transparent.png', { type: 'image/png' }));
  await T.wait(() => d.getElementById('canvas').width === 3 && /loaded/.test(d.getElementById('statusText').textContent));
  const output = d.getElementById('canvas').getContext('2d');
  const alpha = () => [0,1,2].map(x => output.getImageData(x,1,1,1).data[3]);
  T.check('PNG initial alpha is preserved', alpha().join() === '0,128,255');
  w.UsefulToolImageConverter.setMode('erase');
  w.UsefulToolImageConverter.brushLine({x:1,y:1},{x:1,y:1});
  T.check('masking multiplies source alpha', alpha()[0] === 0 && alpha()[1] < 128);
  w.UsefulToolImageConverter.resetMask();
  T.check('reset restores original transparent and translucent pixels', alpha().join() === '0,128,255');
  frame.remove();
  const pdf = await T.frame('images-to-pdf');
  let downloaded;
  pdf.w.UsefulTool.download = blob => { downloaded = blob; };
  T.input(pdf.w, pdf.d.getElementById('imageInput'),
    [new pdf.w.File([png], '旅行-旅遊-😀.png', {type:'image/png'})]);
  await T.wait(() => pdf.w.UsefulToolImagesToPdf.records.length === 1);
  pdf.d.getElementById('caption').checked = true;
  pdf.d.getElementById('buildButton').click();
  await T.wait(() => downloaded || /encode|failed/i.test(pdf.d.getElementById('status').textContent));
  T.check('Unicode filename captions create a downloadable PDF', downloaded?.size > 300);
  T.check('Unicode caption PDF has its image page', (await PDFLib.PDFDocument.load(new Uint8Array(await downloaded.arrayBuffer()))).getPageCount() === 1);
  await T.upload('unicode-captions.pdf', downloaded);
  pdf.frame.remove();
  const calc = await T.frame('calculator');
  for (const [expr, expected] of [['-2^2',-4],['(-2)^2',4],['2^-2',.25],['-2^-2',-.25],['2^3^2',512]]) {
    T.check('calculator precedence ' + expr, calc.w.calculate(expr) === expected);
  }
  calc.frame.remove();
});
