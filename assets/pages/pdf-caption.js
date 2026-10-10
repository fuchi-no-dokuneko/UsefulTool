/* Browser font fallback supports Unicode captions without a network font. */
async function drawPdfCaption(pdf, page, filename, font, margin) {
  const text = Array.from(filename).slice(0, 120).join("");
  const maxWidth = Math.max(1, page.getWidth() - margin * 2);
  try {
    const width = font.widthOfTextAtSize(text, 10);
    page.drawText(text, { x: margin, y: margin, size: 10 * Math.min(1, maxWidth / width), font, color: PDFLib.rgb(0.18, 0.22, 0.2) });
  } catch {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = "30px sans-serif";
    canvas.width = Math.ceil(context.measureText(text).width) + 4;
    canvas.height = 42;
    context.font = "30px sans-serif";
    context.fillStyle = "#2e3833";
    context.textBaseline = "middle";
    context.fillText(text, 2, 21);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not render the filename caption.");
    const caption = await pdf.embedPng(await blob.arrayBuffer());
    const scale = Math.min(1 / 3, maxWidth / canvas.width);
    page.drawImage(caption, { x: margin, y: margin, width: canvas.width * scale, height: canvas.height * scale });
  }
}
