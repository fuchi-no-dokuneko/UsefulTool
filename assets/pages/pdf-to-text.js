const MAX_PDF_BYTES = 150 * 1024 * 1024;
const pdfFileInput = document.getElementById("pdfFile");
const pageRangeInput = document.getElementById("pageRange");
const textOrderInput = document.getElementById("textOrder");
const passwordInput = document.getElementById("password");
const pageHeadersInput = document.getElementById("pageHeaders");
const extractButton = document.getElementById("extractButton");
const copyButton = document.getElementById("copyButton");
const downloadButton = document.getElementById("downloadButton");
const progress = document.getElementById("progress");
const status = document.getElementById("status");
const textOutput = document.getElementById("textOutput");
const fileFact = document.getElementById("fileFact");
const pagesFact = document.getElementById("pagesFact");
const charactersFact = document.getElementById("charactersFact");

let selectedFile = null;
let extractedPageCount = 0;
let workerObjectUrl = null;
let extraction = null;

function cancelExtraction() {
  extraction?.abort();
  extraction = null;
}

function configureWorker() {
  const workerSource = document.getElementById("pdfWorkerSource");
  const inlineSource = workerSource.textContent.trim();
  if (inlineSource) {
    workerObjectUrl = URL.createObjectURL(new Blob([inlineSource], { type: "text/javascript" }));
    globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = workerObjectUrl;
  } else {
    globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSource.dataset.inlineWorkerSrc;
  }
}

function parsePageRange(value, pageCount) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "all") return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = [];
  const seen = new Set();
  for (const rawToken of trimmed.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(rawToken);
    if (!match) throw new Error("Invalid page range: " + rawToken.trim());
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    const step = start <= end ? 1 : -1;
    for (let page = start; page !== end + step; page += step) {
      if (page < 1 || page > pageCount) throw new Error("Page " + page + " is outside 1-" + pageCount);
      if (!seen.has(page)) {
        pages.push(page);
        seen.add(page);
      }
    }
  }
  return pages;
}

function needsSpace(previous, current) {
  if (!previous || !current || /\s$/.test(previous) || /^\s/.test(current)) return false;
  if (/^[,.;:!?%)\]}]/.test(current) || /[(\[{/]$/.test(previous)) return false;
  return true;
}

function contentOrderText(items) {
  let output = "";
  let previous = "";
  for (const item of items) {
    if (typeof item.str !== "string" || !item.str) continue;
    if (needsSpace(previous, item.str)) output += " ";
    output += item.str;
    previous = item.str;
    if (item.hasEOL) {
      output = output.trimEnd() + "\n";
      previous = "";
    }
  }
  return output.trim();
}

function visualOrderText(items) {
  const rows = [];
  for (const item of items) {
    if (typeof item.str !== "string" || !item.str) continue;
    const x = Number(item.transform?.[4] || 0);
    const y = Number(item.transform?.[5] || 0);
    const tolerance = Math.max(2, Number(item.height || 0) * 0.45);
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= Math.max(candidate.tolerance, tolerance));
    if (!row) {
      row = { y, tolerance, items: [] };
      rows.push(row);
    }
    row.items.push({ x, text: item.str });
  }
  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) => row.items
      .sort((left, right) => left.x - right.x)
      .reduce((line, item) => line + (needsSpace(line, item.text) ? " " : "") + item.text, "")
      .trim())
    .filter(Boolean)
    .join("\n");
}

function textFromItems(items, order) {
  return order === "layout" ? visualOrderText(items) : contentOrderText(items);
}

function txtName(filename) {
  const base = filename.replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "usefultool-pdf";
  return base + ".txt";
}

function friendlyError(error) {
  if (error?.name === "PasswordException") return "This PDF needs a valid password.";
  if (error?.name === "InvalidPDFException") return "The selected file is not a valid PDF.";
  return error?.message || String(error);
}

async function extractBytes(bytes, options = {}) {
  options.signal?.throwIfAborted();
  if (!ArrayBuffer.isView(bytes) || !bytes.byteLength) throw new Error("The PDF file is empty.");
  const loadingTask = globalThis.pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    password: options.password || undefined,
    isEvalSupported: false,
    useWorkerFetch: false,
    stopAtErrors: false
  });
  let documentObject;
  const abort = () => { loadingTask.destroy().catch(() => {}); };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    documentObject = await loadingTask.promise;
    options.signal?.throwIfAborted();
    const pages = parsePageRange(options.range || "", documentObject.numPages);
    const sections = [];
    let pagesWithText = 0;
    for (let index = 0; index < pages.length; index += 1) {
      const pageNumber = pages[index];
      options.onProgress?.(index, pages.length, pageNumber);
      const page = await documentObject.getPage(pageNumber);
      options.signal?.throwIfAborted();
      const content = await page.getTextContent({ disableNormalization: false, includeMarkedContent: false });
      options.signal?.throwIfAborted();
      const pageText = textFromItems(content.items, options.order || "flow");
      if (pageText) pagesWithText += 1;
      sections.push(options.pageHeaders === false ? pageText : "--- Page " + pageNumber + " ---\n" + pageText);
      page.cleanup();
    }
    options.onProgress?.(pages.length, pages.length, null);
    return { text: sections.join("\n\n").trim(), pages, pagesWithText, totalPages: documentObject.numPages };
  } finally {
    options.signal?.removeEventListener("abort", abort);
    await loadingTask.destroy();
  }
}

function updateFacts() {
  fileFact.textContent = selectedFile ? selectedFile.name + " (" + UsefulTool.bytesLabel(selectedFile.size) + ")" : "None";
  pagesFact.textContent = String(extractedPageCount);
  charactersFact.textContent = textOutput.value.length.toLocaleString();
}

function reset() {
  cancelExtraction();
  selectedFile = null;
  extractedPageCount = 0;
  pdfFileInput.value = "";
  pageRangeInput.value = "";
  passwordInput.value = "";
  textOutput.value = "";
  progress.value = 0;
  extractButton.disabled = true;
  copyButton.disabled = true;
  downloadButton.disabled = true;
  updateFacts();
  UsefulTool.status(status, "Choose one PDF file. Nothing is uploaded.");
}

async function extractSelected() {
  if (!selectedFile) throw new Error("Choose a PDF file first.");
  cancelExtraction();
  const operation = extraction = new AbortController();
  const file = selectedFile;
  const current = () => extraction === operation && !operation.signal.aborted;
  extractButton.disabled = true;
  copyButton.disabled = true;
  downloadButton.disabled = true;
  progress.value = 0;
  UsefulTool.status(status, "Reading embedded text...");
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!current()) return;
    const result = await extractBytes(bytes, {
      signal: operation.signal,
      range: pageRangeInput.value,
      order: textOrderInput.value,
      password: passwordInput.value,
      pageHeaders: pageHeadersInput.checked,
      onProgress(done, total, pageNumber) {
        if (!current()) return;
        progress.value = total ? done / total : 0;
        if (pageNumber) UsefulTool.status(status, "Extracting page " + pageNumber + " (" + (done + 1) + "/" + total + ")...");
      }
    });
    if (!current()) return;
    textOutput.value = result.text;
    extractedPageCount = result.pages.length;
    const noText = result.pagesWithText === 0;
    UsefulTool.status(status, noText
      ? "No embedded text was found. This no-OCR tool cannot read scanned page images."
      : "Extracted " + result.pagesWithText + " text page(s) from " + result.pages.length + " selected page(s).", noText ? "warn" : "");
    copyButton.disabled = noText;
    downloadButton.disabled = noText;
    progress.value = 1;
    updateFacts();
    return result;
  } catch (error) {
    if (!current()) return;
    textOutput.value = "";
    extractedPageCount = 0;
    progress.value = 0;
    updateFacts();
    UsefulTool.status(status, friendlyError(error), "error");
    throw error;
  } finally {
    if (current()) {
      extraction = null;
      extractButton.disabled = !selectedFile;
    }
  }
}

pdfFileInput.addEventListener("change", () => {
  cancelExtraction();
  const file = pdfFileInput.files[0] || null;
  selectedFile = null;
  extractedPageCount = 0;
  textOutput.value = "";
  copyButton.disabled = true;
  downloadButton.disabled = true;
  progress.value = 0;
  if (!file) {
    reset();
    return;
  }
  if (file.size > MAX_PDF_BYTES) {
    UsefulTool.status(status, "PDF exceeds the 150 MiB local safety limit.", "error");
    extractButton.disabled = true;
  } else {
    selectedFile = file;
    extractButton.disabled = false;
    UsefulTool.status(status, "Ready to extract embedded text from " + file.name + ".");
  }
  updateFacts();
});

extractButton.addEventListener("click", () => { extractSelected().catch(() => {}); });
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(textOutput.value);
    UsefulTool.status(status, "Text copied to the clipboard.");
  } catch {
    textOutput.focus();
    textOutput.select();
    UsefulTool.status(status, "Clipboard permission was unavailable. The text is selected for copying.", "warn");
  }
});
downloadButton.addEventListener("click", () => {
  if (!selectedFile || !textOutput.value) return;
  UsefulTool.download(new Blob([textOutput.value], { type: "text/plain;charset=utf-8" }), txtName(selectedFile.name));
  UsefulTool.status(status, "TXT download created locally.");
});
document.getElementById("clearButton").addEventListener("click", reset);
textOutput.addEventListener("input", updateFacts);

configureWorker();
updateFacts();
window.UsefulToolPdfToText = {
  contentOrderText,
  extractBytes,
  extractSelected,
  friendlyError,
  parsePageRange,
  reset,
  textFromItems,
  txtName,
  visualOrderText,
  get selectedFile() { return selectedFile; },
  get workerObjectUrl() { return workerObjectUrl; }
};
