/* Shared PDF.js preview. The offline build embeds a compressed local worker. */
const pdfPreviewReady = (async () => {
  const block = document.getElementById("pdfWorkerSource");
  let source = block.textContent.trim();
  if (source) {
    if (block.dataset.inlineWorkerCompress === "gzip") {
      const bytes = Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
      const stream = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      source = await new Response(stream).text();
    }
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc = url;
    window.addEventListener("pagehide", () => URL.revokeObjectURL(url), {
      once: true,
    });
  } else pdfjsLib.GlobalWorkerOptions.workerSrc = block.dataset.inlineWorkerSrc;
})();
async function openPreview(bytes) {
  await pdfPreviewReady;
  // PDF.js transfers its input into a worker; never detach the merge source.
  const task = pdfjsLib.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  try {
    const doc = await task.promise;
    return {
      numPages: doc.numPages,
      getPage: (n) => doc.getPage(n),
      destroy: () => task.destroy(),
    };
  } catch (error) {
    await task.destroy();
    throw error;
  }
}
async function paintPage(pdf, pageNumber, canvas, maxWidth = 180) {
  const page = await pdf.getPage(pageNumber),
    natural = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({
    scale: Math.min(maxWidth / natural.width, 1800 / natural.height),
  });
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  await page.render({
    canvasContext: canvas.getContext("2d", { willReadFrequently: true }),
    viewport,
  }).promise;
}
function pager(
  container,
  count,
  draw,
  { pageSize = 8, onError = () => {} } = {},
) {
  let offset = 0,
    revision = 0,
    disposed = false;
  const nav = document.createElement("div"),
    grid = document.createElement("div");
  nav.className = "row";
  grid.className = "pdf-previews";
  const prev = document.createElement("button"),
    next = document.createElement("button"),
    label = document.createElement("span");
  prev.type = next.type = "button";
  prev.textContent = "Previous pages";
  next.textContent = "Next pages";
  nav.append(prev, label, next);
  container.replaceChildren(nav, grid);
  async function render() {
    const current = ++revision;
    grid.replaceChildren();
    prev.disabled = offset === 0;
    next.disabled = offset + pageSize >= count;
    label.textContent = count
      ? `${offset + 1}–${Math.min(count, offset + pageSize)} of ${count}`
      : "No pages selected";
    for (let n = offset; n < Math.min(count, offset + pageSize); n++) {
      if (disposed || revision !== current || !container.isConnected) return;
      const cell = document.createElement("div");
      cell.className = "pdf-page";
      grid.append(cell);
      try {
        await draw(n, cell);
      } catch (error) {
        if (!disposed && revision === current) {
          cell.textContent = "Preview unavailable";
          onError(error);
        }
      }
    }
  }
  prev.addEventListener("click", () => {
    offset -= pageSize;
    render();
  });
  next.addEventListener("click", () => {
    offset += pageSize;
    render();
  });
  render();
  return () => {
    disposed = true;
    revision++;
  };
}
window.UsefulToolPDF = {
  ready: pdfPreviewReady,
  open: openPreview,
  paint: paintPage,
  pager,
};
