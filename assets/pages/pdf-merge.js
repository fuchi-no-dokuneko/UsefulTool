const records = [];
const list = document.getElementById("pdfList");
const summary = document.getElementById("summary");
const status = document.getElementById("status");

function parseRange(value, pageCount) {
  if (!value.trim()) return Array.from({ length: pageCount }, (_, index) => index);
  const pages = [];
  for (const token of value.split(",")) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(token);
    if (!match) throw new Error("Invalid page range: " + token);
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    const step = start <= end ? 1 : -1;
    for (let page = start; page !== end + step; page += step) {
      if (page < 1 || page > pageCount) throw new Error("Page " + page + " is outside 1-" + pageCount);
      pages.push(page - 1);
    }
  }
  return pages;
}

function render() {
  list.replaceChildren();
  records.forEach((record, index) => {
    const row = document.createElement("div"); row.className = "pdf-row";
    const info = document.createElement("div"); info.innerHTML = "<strong></strong><div class='muted small'></div>";
    info.querySelector("strong").textContent = record.file.name;
    info.querySelector("div").textContent = record.pageCount + " pages | " + UsefulTool.bytesLabel(record.file.size);
    const label = document.createElement("label"); label.textContent = "Pages";
    const range = document.createElement("input"); range.placeholder = "all pages"; range.value = record.range; range.addEventListener("input", () => record.range = range.value); label.appendChild(range);
    const actions = document.createElement("div"); actions.className = "row";
    for (const [text, delta] of [["Up", -1], ["Down", 1]]) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = text;
      button.disabled = index + delta < 0 || index + delta >= records.length;
      button.addEventListener("click", () => { const target = index + delta; [records[index], records[target]] = [records[target], records[index]]; render(); }); actions.appendChild(button);
    }
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Remove"; remove.addEventListener("click", () => { records.splice(index, 1); render(); }); actions.appendChild(remove);
    row.append(info, label, actions); list.appendChild(row);
  });
  summary.textContent = records.length ? records.map((record, index) => (index + 1) + ". " + record.file.name + " | " + record.pageCount + " pages | selection: " + (record.range || "all")).join("\n") : "No PDF files loaded.";
}

document.getElementById("pdfInput").addEventListener("change", async (event) => {
  for (const file of event.target.files) {
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error(file.name + " exceeds 100 MiB");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const documentObject = await PDFLib.PDFDocument.load(bytes);
      records.push({ file, bytes, pageCount: documentObject.getPageCount(), range: "" });
    } catch (error) { UsefulTool.status(status, "Cannot load " + file.name + ": " + error.message, "error"); }
  }
  event.target.value = ""; render();
  if (records.length) UsefulTool.status(status, records.length + " PDF file(s) ready.");
});

document.getElementById("mergeButton").addEventListener("click", async () => {
  try {
    if (!records.length) throw new Error("Add at least one PDF");
    UsefulTool.status(status, "Merging pages...");
    const output = await PDFLib.PDFDocument.create();
    let total = 0;
    for (const record of records) {
      const source = await PDFLib.PDFDocument.load(record.bytes);
      const indices = parseRange(record.range, source.getPageCount());
      const pages = await output.copyPages(source, indices);
      pages.forEach((page) => output.addPage(page)); total += pages.length;
    }
    output.setCreator("UsefulTool PDF Merge"); output.setProducer("pdf-lib");
    const bytes = await output.save();
    UsefulTool.download(new Blob([bytes], { type: "application/pdf" }), "usefultool-merged.pdf");
    UsefulTool.status(status, "Merged " + total + " page(s) into " + UsefulTool.bytesLabel(bytes.length) + ".");
  } catch (error) { UsefulTool.status(status, error.message, "error"); }
});
document.getElementById("clearButton").addEventListener("click", () => { records.length = 0; render(); UsefulTool.status(status, "Cleared."); });
render();
