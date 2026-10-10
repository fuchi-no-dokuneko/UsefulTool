const $ = (id) => document.getElementById(id),
  C = UsefulToolCompression,
  P = UsefulToolPDF;
let loaded = null,
  result = null,
  revision = 0,
  loadRevision = 0,
  controller = null,
  outputPdf = null,
  stopOriginal = () => {},
  stopResult = () => {};
const status = (text, mode) => UsefulTool.status($("status"), text, mode);
function invalidate() {
  revision++;
  controller?.abort();
  controller = null;
  result = null;
  stopResult();
  outputPdf?.destroy();
  outputPdf = null;
  $("resultSection").hidden = true;
  $("downloadButton").disabled = true;
  $("compressButton").disabled = !loaded;
  $("cancelButton").hidden = true;
  $("progress").hidden = true;
}
function pages(container, pdf) {
  return P.pager(
    container,
    pdf.numPages,
    async (n, cell) => {
      const c = document.createElement("canvas"),
        label = document.createElement("span");
      label.textContent = "Page " + (n + 1);
      cell.append(c, label);
      await P.paint(pdf, n + 1, c);
    },
    { onError: (error) => status(error.message, "warn") },
  );
}
$("pdfFile").addEventListener("change", async (event) => {
  invalidate();
  const current = ++loadRevision,
    file = event.target.files[0];
  stopOriginal();
  loaded?.pdf.destroy();
  loaded = null;
  $("compressButton").disabled = true;
  $("fileFacts").textContent = "No PDF loaded.";
  $("originalPages").replaceChildren();
  if (!file) return;
  status("Reading PDF…");
  try {
    if (file.size > 100 * 1048576)
      throw new Error("Choose a PDF of at most 100 MiB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    await PDFLib.PDFDocument.load(bytes);
    const pdf = await P.open(bytes);
    if (current !== loadRevision) {
      pdf.destroy();
      return;
    }
    loaded = { file, bytes, pdf };
    $("fileFacts").textContent =
      `${file.name} · ${pdf.numPages} pages · ${UsefulTool.bytesLabel(file.size)}`;
    stopOriginal = pages($("originalPages"), pdf);
    $("compressButton").disabled = false;
    status("Ready. Set your size limit.");
  } catch (error) {
    if (current === loadRevision) status(error.message, "error");
  }
});
for (const id of ["targetSize", "targetUnit", "allowRaster"])
  $(id).addEventListener("input", () => {
    invalidate();
    if (loaded) status("Settings changed. Compress to update the result.");
  });
$("cancelButton").addEventListener("click", () => {
  invalidate();
  status("Cancelled. Your original PDF is unchanged.");
});
async function rasterize(pdf, limit, signal, onProgress) {
  let smallest = null;
  // Render pages sequentially: do not retain full-resolution copies of a book.
  for (const scale of [1.5, 1, 0.75, 0.5, 0.3]) {
    let low = 0.15,
      high = 0.95,
      best = null;
    async function attempt(quality) {
      const output = await PDFLib.PDFDocument.create();
      for (let n = 1; n <= pdf.numPages; n++) {
        signal.throwIfAborted();
        onProgress(
          (n - 1) / pdf.numPages,
          `Page-image fallback · page ${n}/${pdf.numPages} · ${Math.round(scale * 72)} dpi`,
        );
        const page = await pdf.getPage(n),
          base = page.getViewport({ scale: 1 }),
          viewport = page.getViewport({
            scale: Math.min(scale, 2400 / Math.max(base.width, base.height)),
          }),
          c = C.canvas(viewport.width, viewport.height);
        const task = page.render({
            canvasContext: c.getContext("2d"),
            viewport,
            background: "white",
            intent: "print",
          }),
          cancel = () => task.cancel();
        signal.addEventListener("abort", cancel, { once: true });
        try {
          await task.promise;
        } finally {
          signal.removeEventListener("abort", cancel);
        }
        signal.throwIfAborted();
        const blob = await C.encode(c, "image/jpeg", quality),
          image = await output.embedJpg(await blob.arrayBuffer());
        c.width = c.height = 1;
        output
          .addPage([base.width, base.height])
          .drawImage(image, {
            x: 0,
            y: 0,
            width: base.width,
            height: base.height,
          });
      }
      const bytes = await output.save();
      if (!smallest || bytes.length < smallest.bytes.length)
        smallest = { bytes, raster: true };
      if (bytes.length <= limit) {
        best = { bytes, raster: true, quality, scale };
        return true;
      }
      return false;
    }
    if (!(await attempt(high)) && (await attempt(low)))
      for (let n = 0; n < 6; n++) {
        const mid = (low + high) / 2;
        if (await attempt(mid)) low = mid;
        else high = mid;
      }
    if (best) return best;
  }
  return smallest;
}
$("compressButton").addEventListener("click", async () => {
  if (!loaded) return;
  invalidate();
  const current = revision,
    data = loaded,
    control = (controller = new AbortController());
  try {
    const limit = C.targetBytes($("targetSize").value, $("targetUnit").value);
    $("compressButton").disabled = true;
    $("cancelButton").hidden = false;
    $("progress").hidden = false;
    const onProgress = (value, text) => {
      if (current === revision) {
        $("progress").value = value;
        status(text);
      }
    };
    let found = await UsefulToolPdfCompression.compress(data.bytes, limit, {
      signal: control.signal,
      onProgress,
    });
    if (found.bytes.length > limit && $("allowRaster").checked) {
      const flat = await rasterize(data.pdf, limit, control.signal, onProgress);
      if (flat.bytes.length < found.bytes.length) found = flat;
    }
    control.signal.throwIfAborted();
    if (current !== revision) return;
    const pdf = await P.open(found.bytes);
    if (current !== revision) {
      pdf.destroy();
      return;
    }
    outputPdf = pdf;
    result = new Blob([found.bytes], { type: "application/pdf" });
    $("resultSection").hidden = false;
    stopResult = pages($("resultPages"), pdf);
    const fits = found.bytes.length <= limit;
    $("resultFacts").textContent =
      `${found.bytes.length.toLocaleString()} bytes / ${limit.toLocaleString()} byte limit · ${pdf.numPages} pages\n${found.unchanged ? "Original already fits; kept unchanged." : found.raster ? "Page-image copy: text and links have been flattened." : `${found.images} image(s) considered; ${found.skipped} unsupported image(s) kept intact. Text, vectors and links retained.`}`;
    $("downloadButton").disabled = false;
    $("downloadButton").textContent = fits
      ? "Download compressed PDF"
      : "Download smallest tested PDF (above limit)";
    status(
      fits
        ? "Ready. Result is within your size limit."
        : "This limit could not be reached. Increase it" +
            (!$("allowRaster").checked
              ? " or allow the page-image fallback."
              : "."),
      fits ? "" : "warn",
    );
  } catch (error) {
    if (current === revision && !control.signal.aborted)
      status(error.message, "error");
  } finally {
    if (current === revision) {
      controller = null;
      $("compressButton").disabled = !loaded;
      $("cancelButton").hidden = true;
      $("progress").hidden = true;
    }
  }
});
$("downloadButton").addEventListener("click", () => {
  if (result)
    UsefulTool.download(
      result,
      loaded.file.name.replace(/\.pdf$/i, "") + "-compressed.pdf",
    );
});
window.addEventListener("pagehide", () => controller?.abort());
