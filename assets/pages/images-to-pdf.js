const records = [];
const list = document.getElementById("imageList");
const status = document.getElementById("status");

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Cannot decode " + file.name)); };
    image.src = url;
  });
}

function render() {
  list.replaceChildren();
  records.forEach((record, index) => {
    const row = document.createElement("div"); row.className = "image-row";
    const image = document.createElement("img"); image.src = record.preview; image.alt = "Preview of " + record.file.name;
    const info = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = record.file.name;
    const detail = document.createElement("div"); detail.className = "muted small"; detail.textContent = record.width + " x " + record.height + " | " + UsefulTool.bytesLabel(record.file.size);
    info.append(name, detail);
    const actions = document.createElement("div"); actions.className = "row";
    for (const [label, delta] of [["Up", -1], ["Down", 1]]) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.disabled = index + delta < 0 || index + delta >= records.length;
      button.addEventListener("click", () => { const target = index + delta; [records[index], records[target]] = [records[target], records[index]]; render(); }); actions.appendChild(button);
    }
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Remove"; remove.addEventListener("click", () => { URL.revokeObjectURL(record.preview); records.splice(index, 1); render(); }); actions.appendChild(remove);
    row.append(image, info, actions); list.appendChild(row);
  });
}

async function jpegBytes(record, quality) {
  const image = await loadBitmap(record.file);
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d"); context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("JPEG conversion failed for " + record.file.name);
  return new Uint8Array(await blob.arrayBuffer());
}

function fixedPage(size, orientation, image) {
  let dimensions = size === "letter" ? [612, 792] : [595.28, 841.89];
  const landscape = orientation === "landscape" || (orientation === "auto" && image.width > image.height);
  if (landscape) dimensions = [dimensions[1], dimensions[0]];
  return dimensions;
}

document.getElementById("imageInput").addEventListener("change", async (event) => {
  for (const file of event.target.files) {
    try {
      if (!file.type.startsWith("image/") || file.size > 40 * 1024 * 1024) throw new Error("Unsupported or oversized image: " + file.name);
      const image = await loadBitmap(file);
      records.push({ file, width: image.naturalWidth, height: image.naturalHeight, preview: URL.createObjectURL(file) });
    } catch (error) { UsefulTool.status(status, error.message, "error"); }
  }
  event.target.value = ""; render(); if (records.length) UsefulTool.status(status, records.length + " image(s) ready.");
});
document.getElementById("quality").addEventListener("input", (event) => document.getElementById("qualityLabel").textContent = Number(event.target.value).toFixed(2));
document.getElementById("buildButton").addEventListener("click", async () => {
  try {
    if (!records.length) throw new Error("Add at least one image");
    UsefulTool.status(status, "Building PDF...");
    const pdf = await PDFLib.PDFDocument.create();
    const sizeMode = document.getElementById("pageSize").value;
    const orientation = document.getElementById("orientation").value;
    const margin = Math.max(0, Math.min(144, Number(document.getElementById("margin").value) || 0));
    const dpi = Math.max(36, Math.min(600, Number(document.getElementById("dpi").value) || 144));
    const quality = Number(document.getElementById("quality").value);
    const caption = document.getElementById("caption").checked;
    const font = caption ? await pdf.embedFont(PDFLib.StandardFonts.Helvetica) : null;
    for (const record of records) {
      const bytes = await jpegBytes(record, quality);
      const embedded = await pdf.embedJpg(bytes);
      let pageWidth; let pageHeight;
      if (sizeMode === "image") { pageWidth = record.width * 72 / dpi + margin * 2; pageHeight = record.height * 72 / dpi + margin * 2 + (caption ? 20 : 0); }
      else [pageWidth, pageHeight] = fixedPage(sizeMode, orientation, record);
      const page = pdf.addPage([pageWidth, pageHeight]);
      const captionSpace = caption ? 20 : 0;
      const scale = Math.min((pageWidth - margin * 2) / record.width, (pageHeight - margin * 2 - captionSpace) / record.height);
      const width = record.width * scale; const height = record.height * scale;
      page.drawImage(embedded, { x: (pageWidth - width) / 2, y: margin + captionSpace + (pageHeight - margin * 2 - captionSpace - height) / 2, width, height });
      if (caption) await drawPdfCaption(pdf, page, record.file.name, font, margin);
    }
    pdf.setCreator("UsefulTool Images to PDF"); pdf.setProducer("pdf-lib");
    const bytes = await pdf.save(); UsefulTool.download(new Blob([bytes], { type: "application/pdf" }), "usefultool-images.pdf");
    UsefulTool.status(status, "Created " + records.length + " page(s), " + UsefulTool.bytesLabel(bytes.length) + ".");
  } catch (error) { UsefulTool.status(status, error.message, "error"); }
});
document.getElementById("clearButton").addEventListener("click", () => { records.forEach((record) => URL.revokeObjectURL(record.preview)); records.length = 0; render(); UsefulTool.status(status, "Cleared."); });
window.UsefulToolImagesToPdf = { fixedPage, jpegBytes, loadBitmap, records, render };
