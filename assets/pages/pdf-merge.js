const records = [],
  $ = (id) => document.getElementById(id),
  P = UsefulToolPDF;
const list = $("pdfList"),
  summary = $("summary"),
  status = $("status");
let revision = 0,
  uploadRevision = 0,
  busy = false,
  loading = false,
  merged = null,
  outputPdf = null;
let stopSelection = () => {},
  stopOutput = () => {},
  selectionTimer;
const message = (text, mode) => UsefulTool.status(status, text, mode);

function parseRange(value, pageCount) {
  if (!value.trim())
    return Array.from({ length: pageCount }, (_, index) => index);
  if (value.trim().toLowerCase() === "none") return [];
  const pages = [];
  for (const token of value.split(",")) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(token);
    if (!match) throw new Error("Invalid page range: " + token);
    const start = Number(match[1]),
      end = Number(match[2] || match[1]);
    for (const page of [start, end])
      if (!Number.isSafeInteger(page) || page < 1 || page > pageCount)
        throw new Error("Page " + page + " is outside 1–" + pageCount);
    if (pages.length + Math.abs(end - start) + 1 > 20000)
      throw new Error("Select at most 20,000 pages per file.");
    const step = start <= end ? 1 : -1;
    for (let page = start; page !== end + step; page += step)
      pages.push(page - 1);
  }
  return pages;
}
async function previewPDF(record) {
  if (!record.pdfPromise)
    record.pdfPromise = P.open(record.bytes).then((pdf) => {
      if (record.disposed) {
        pdf.destroy();
        throw new Error("File was removed.");
      }
      record.pdf = pdf;
      return pdf;
    });
  return record.pdfPromise;
}
function invalidate() {
  revision++;
  merged = null;
  stopOutput();
  outputPdf?.destroy();
  outputPdf = null;
  $("builtPreview").hidden = true;
}
function selection() {
  return records.flatMap((record) =>
    parseRange(record.range, record.pageCount).map((page) => ({
      record,
      page,
    })),
  );
}
function update() {
  invalidate();
  clearTimeout(selectionTimer);
  stopSelection();
  let pages = [],
    valid = true;
  for (const record of records) {
    try {
      const chosen = parseRange(record.range, record.pageCount);
      record.rangeInput?.setAttribute("aria-invalid", "false");
      if (record.error) record.error.textContent = "";
      record.card
        ?.querySelectorAll("input[type=checkbox]")
        .forEach(
          (box) => (box.checked = chosen.includes(Number(box.dataset.page))),
        );
    } catch (error) {
      valid = false;
      record.rangeInput?.setAttribute("aria-invalid", "true");
      if (record.error) record.error.textContent = error.message;
    }
  }
  if (valid) pages = selection();
  $("mergeButton").disabled = busy || loading || !pages.length || !valid;
  summary.textContent = records.length
    ? records
        .map(
          (r, i) =>
            `${i + 1}. ${r.file.name} | ${r.pageCount} pages | selection: ${r.range || "all"}`,
        )
        .join("\n") +
      `\n${valid ? pages.length + " selected pages" : "Correct the page ranges above."}`
    : "No PDF files loaded.";
  $("mergePreview").hidden = !valid || !pages.length;
  if (valid && pages.length)
    selectionTimer = setTimeout(() => {
      stopSelection = P.pager(
        $("selectedPreview"),
        pages.length,
        async (index, cell) => {
          const { record, page } = pages[index],
            canvas = document.createElement("canvas"),
            label = document.createElement("span");
          label.textContent = `${index + 1}. ${record.file.name} · page ${page + 1}`;
          cell.append(canvas, label);
          await P.paint(await previewPDF(record), page + 1, canvas);
        },
        { onError: (error) => message(error.message, "warn") },
      );
    }, 250);
}
function dispose(record) {
  record.disposed = true;
  record.stop?.();
  record.pdf?.destroy();
}
function render() {
  records.forEach((r) => r.stop?.());
  list.replaceChildren();
  records.forEach((record, index) => {
    const card = (record.card = document.createElement("section"));
    card.className = "pdf-record";
    const row = document.createElement("div");
    row.className = "pdf-row";
    const info = document.createElement("div"),
      title = document.createElement("strong"),
      facts = document.createElement("div");
    title.textContent = record.file.name;
    facts.className = "small muted";
    facts.textContent = `${record.pageCount} pages · ${UsefulTool.bytesLabel(record.file.size)}`;
    info.append(title, facts);
    const label = document.createElement("label");
    label.textContent = "Pages";
    const range = (record.rangeInput = document.createElement("input"));
    range.placeholder = "all pages";
    range.value = record.range;
    range.addEventListener("input", () => {
      record.range = range.value;
      update();
    });
    label.append(range);
    const actions = document.createElement("div");
    actions.className = "row";
    for (const [text, delta] of [
      ["Up", -1],
      ["Down", 1],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.disabled = index + delta < 0 || index + delta >= records.length;
      button.addEventListener("click", () => {
        [records[index], records[index + delta]] = [
          records[index + delta],
          records[index],
        ];
        render();
      });
      actions.append(button);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      dispose(record);
      records.splice(records.indexOf(record), 1);
      render();
    });
    actions.append(remove);
    row.append(info, label, actions);
    card.append(row);
    record.error = document.createElement("p");
    record.error.className = "range-error small";
    card.append(record.error);
    const details = document.createElement("details"),
      heading = document.createElement("summary"),
      previews = document.createElement("div"),
      choices = document.createElement("div");
    heading.textContent = "Preview and select pages";
    choices.className = "row";
    for (const [text, value] of [
      ["Select all", ""],
      ["Select none", "none"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.addEventListener("click", () => {
        record.range = range.value = value;
        update();
      });
      choices.append(button);
    }
    details.append(heading, choices, previews);
    card.append(details);
    list.append(card);
    let started = false;
    details.addEventListener("toggle", () => {
      if (!details.open || started) return;
      started = true;
      record.stop = P.pager(
        previews,
        record.pageCount,
        async (page, cell) => {
          const canvas = document.createElement("canvas"),
            choice = document.createElement("label"),
            box = document.createElement("input");
          box.type = "checkbox";
          box.dataset.page = page;
          box.setAttribute(
            "aria-label",
            `Include page ${page + 1} of ${record.file.name}`,
          );
          try {
            box.checked = parseRange(record.range, record.pageCount).includes(
              page,
            );
          } catch {}
          box.addEventListener("change", () => {
            let chosen;
            try {
              chosen = parseRange(record.range, record.pageCount);
            } catch {
              chosen = [];
            }
            if (box.checked) {
              if (!chosen.includes(page)) chosen.push(page);
            } else chosen = chosen.filter((n) => n !== page);
            record.range = range.value = chosen.length
              ? chosen.map((n) => n + 1).join(", ")
              : "none";
            update();
          });
          choice.append(box, `Page ${page + 1}`);
          cell.append(canvas, choice);
          await P.paint(await previewPDF(record), page + 1, canvas);
        },
        { onError: (error) => message(error.message, "warn") },
      );
    });
  });
  update();
}
$("pdfInput").addEventListener("change", async (event) => {
  const current = ++uploadRevision,
    files = [...event.target.files];
  event.target.value = "";
  loading = true;
  update();
  const failures = [];
  for (const file of files) {
    try {
      if (file.size > 100 * 1048576) throw new Error("exceeds 100 MiB");
      const bytes = new Uint8Array(await file.arrayBuffer()),
        doc = await PDFLib.PDFDocument.load(bytes);
      if (current !== uploadRevision) return;
      records.push({ file, bytes, pageCount: doc.getPageCount(), range: "" });
    } catch (error) {
      failures.push(file.name + ": " + error.message);
    }
  }
  if (current !== uploadRevision) return;
  loading = false;
  render();
  message(
    failures.length
      ? failures.join("\n")
      : records.length + " PDF file(s) ready.",
    failures.length ? "error" : "",
  );
});
$("mergeButton").addEventListener("click", async () => {
  if (busy) return;
  const current = revision;
  try {
    const pages = selection();
    if (!pages.length) throw new Error("Select at least one page.");
    busy = true;
    $("mergeButton").disabled = true;
    message("Merging pages…");
    const output = await PDFLib.PDFDocument.create(),
      sources = new Map();
    for (const { record, page } of pages) {
      if (current !== revision) return;
      if (!sources.has(record))
        sources.set(record, await PDFLib.PDFDocument.load(record.bytes));
      const [copy] = await output.copyPages(sources.get(record), [page]);
      output.addPage(copy);
    }
    output.setCreator("UsefulTool PDF Merge");
    output.setProducer("pdf-lib");
    const bytes = await output.save();
    if (current !== revision) return;
    merged = new Blob([bytes], { type: "application/pdf" });
    UsefulTool.download(merged, "usefultool-merged.pdf");
    message(
      `Merged ${pages.length} page(s) into ${UsefulTool.bytesLabel(bytes.length)}.`,
    );
    const pdf = await P.open(bytes);
    if (current !== revision) {
      pdf.destroy();
      return;
    }
    outputPdf = pdf;
    $("builtPreview").hidden = false;
    stopOutput = P.pager($("outputPreview"), pdf.numPages, async (n, cell) => {
      const canvas = document.createElement("canvas"),
        label = document.createElement("span");
      label.textContent = `Output page ${n + 1}`;
      cell.append(canvas, label);
      await P.paint(pdf, n + 1, canvas);
    });
  } catch (error) {
    if (current === revision) message(error.message, "error");
  } finally {
    busy = false;
    try {
      $("mergeButton").disabled = loading || !selection().length;
    } catch {
      $("mergeButton").disabled = true;
    }
  }
});
$("downloadMerged").addEventListener("click", () => {
  if (merged) UsefulTool.download(merged, "usefultool-merged.pdf");
});
$("clearButton").addEventListener("click", () => {
  uploadRevision++;
  loading = false;
  records.forEach(dispose);
  records.length = 0;
  render();
  message("Cleared.");
});
render();
window.UsefulToolPdfMerge = { parseRange, records, render };
