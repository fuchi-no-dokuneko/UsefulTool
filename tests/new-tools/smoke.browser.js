/* Integration checks included in the maintained-source browser coverage gate. */
window.runNewToolsSmoke = async function (check) {
  const wait = async (fn, label) => {
    for (let n = 0; n < 1500; n++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("New tools: " + label);
  };
  const frame = document.createElement("iframe");
  frame.width = 1200;
  frame.height = 900;
  document.body.append(frame);
  let w, d;
  const open = async (name) => {
    await new Promise((resolve) => {
      frame.onload = resolve;
      frame.src = "/" + name + ".html";
    });
    w = frame.contentWindow;
    d = w.document;
  };
  const input = (id, value) => {
    const e = d.getElementById(id);
    e.value = value;
    e.dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  const upload = (id, file) => {
    const t = new w.DataTransfer();
    t.items.add(file);
    d.getElementById(id).files = t.files;
    d.getElementById(id).dispatchEvent(
      new w.Event("change", { bubbles: true }),
    );
  };
  const click = (id) => d.getElementById(id).click();
  let saved;
  const downloads = () => {
    saved = null;
    w.UsefulTool.download = (blob) => {
      saved = blob;
    };
  };
  const png = document.createElement("canvas");
  png.width = 300;
  png.height = 200;
  const ctx = png.getContext("2d");
  const pixels = ctx.createImageData(300, 200);
  for (let n = 0; n < pixels.data.length; n += 4) {
    pixels.data[n] = (n * 31) % 251;
    pixels.data[n + 1] = (n * 23) % 255;
    pixels.data[n + 2] = (n * 11) % 253;
    pixels.data[n + 3] = n % 28 === 0 ? 120 : 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const blob = await new Promise((r) => png.toBlob(r));
  try {
    await open("image-compress");
    downloads();
    upload(
      "imageFile",
      new w.File([blob], "pattern.png", { type: "image/png" }),
    );
    await wait(
      () => !d.getElementById("compressButton").disabled,
      "image loading",
    );
    input("targetSize", "5");
    click("compressButton");
    await wait(
      () => !d.getElementById("downloadButton").disabled,
      "image compression",
    );
    click("downloadButton");
    check(
      "image compressor downloads below its chosen byte limit",
      saved?.size <= 5120,
    );
    input("imageFormat", "image/png");
    input("targetSize", "2000");
    click("compressButton");
    await wait(
      () => !d.getElementById("downloadButton").disabled,
      "original preservation",
    );
    click("downloadButton");
    check(
      "image compressor keeps an already fitting original",
      saved.size === blob.size,
    );
    input("targetSize", "3");
    click("compressButton");
    await wait(
      () => !d.getElementById("downloadButton").disabled,
      "lossless PNG dimension search",
    );
    click("downloadButton");
    const smallPng = await w.UsefulToolCompression.decode(saved);
    check(
      "PNG compression refines dimensions and retains the selected format",
      saved.type === "image/png" &&
        saved.size <= 3072 &&
        smallPng.naturalWidth < 300 &&
        smallPng.naturalWidth > 1,
    );
    input("targetSize", "0");
    click("compressButton");
    await wait(
      () => d.getElementById("status").classList.contains("error"),
      "invalid size",
    );
    check(
      "invalid image size cannot download stale output",
      d.getElementById("downloadButton").disabled,
    );
    input("targetSize", "1");
    input("imageFormat", "image/jpeg");
    click("compressButton");
    click("cancelButton");
    check(
      "image cancellation disables stale downloads",
      d.getElementById("downloadButton").disabled,
    );
    upload("imageFile", new w.File(["bad"], "bad.png"));
    await wait(
      () => d.getElementById("status").classList.contains("error"),
      "invalid image",
    );
    check(
      "invalid image is rejected",
      d.getElementById("compressButton").disabled,
    );
    const jpeg = await new Promise((r) => png.toBlob(r, "image/jpeg", 0.9));
    await w.UsefulToolCompression.readImage(new w.File([jpeg], "a.jpg"));
    const webp = await new Promise((r) => png.toBlob(r, "image/webp", 0.8));
    await w.UsefulToolCompression.readImage(new w.File([webp], "a.webp"));
    check("image input decodes JPEG and WebP", true);
    upload(
      "imageFile",
      new w.File([jpeg], "opaque.jpg", { type: "image/jpeg" }),
    );
    await wait(
      () => !d.getElementById("compressButton").disabled,
      "JPEG upload",
    );
    input("imageFormat", "auto");
    input("targetSize", "2");
    click("compressButton");
    await wait(
      () => !d.getElementById("downloadButton").disabled,
      "opaque image comparison",
    );
    click("downloadButton");
    check(
      "opaque image Auto compares encodings within the byte budget",
      saved.size <= 2048,
    );
    input("targetSize", "0.001");
    click("compressButton");
    await wait(
      () => d.getElementById("status").classList.contains("error"),
      "impossible image size",
    );
    check(
      "an impossible image limit reports the smallest trial without a misleading download",
      d
        .getElementById("status")
        .textContent.includes("Smallest tested image") &&
        d.getElementById("downloadButton").disabled,
    );
    let sizeError = false;
    try {
      w.UsefulToolCompression.targetBytes("Infinity", "MiB");
    } catch {
      sizeError = true;
    }
    check("nonfinite compression targets are rejected", sizeError);
    await open("pdf-compress");
    downloads();
    const P = w.PDFLib,
      pdf = await P.PDFDocument.create(),
      image = await pdf.embedPng(new w.Uint8Array(await blob.arrayBuffer()));
    pdf
      .addPage(w.Array.of(300, 250))
      .drawImage(image, { x: 0, y: 0, width: 300, height: 200 });
    pdf.getPages()[0].drawText("Keep this text", { x: 10, y: 220 });
    const bytes = await pdf.save();
    upload(
      "pdfFile",
      new w.File([bytes], "images.pdf", { type: "application/pdf" }),
    );
    await wait(() => !d.getElementById("compressButton").disabled, "PDF load");
    input("targetUnit", "KiB");
    input("targetSize", "4");
    click("compressButton");
    await wait(
      () => !d.getElementById("downloadButton").disabled,
      "PDF compression",
    );
    click("downloadButton");
    const compressed = await P.PDFDocument.load(await saved.arrayBuffer());
    check("PDF image optimizer retains pages", compressed.getPageCount() === 1);
    const rendered = await w.UsefulToolPDF.open(
        new w.Uint8Array(await saved.arrayBuffer()),
      ),
      text = await (await rendered.getPage(1)).getTextContent();
    check(
      "PDF image optimizer retains embedded text",
      text.items.some((i) => i.str === "Keep this text"),
    );
    await rendered.destroy();
    input("targetSize", "2000");
    click("compressButton");
    await wait(
      () => !d.getElementById("downloadButton").disabled,
      "PDF unchanged",
    );
    check(
      "under-limit PDF is kept unchanged",
      d.getElementById("resultFacts").textContent.includes("unchanged"),
    );
    input("targetSize", "0");
    click("compressButton");
    await wait(
      () => d.getElementById("status").classList.contains("error"),
      "invalid PDF size",
    );
    check(
      "invalid PDF target has no stale output",
      d.getElementById("downloadButton").disabled,
    );
    input("targetSize", "1");
    click("compressButton");
    click("cancelButton");
    check(
      "PDF cancellation returns to input",
      d.getElementById("cancelButton").hidden,
    );
    const jpegPdf = await P.PDFDocument.create();
    const jpegImage = await jpegPdf.embedJpg(
      new w.Uint8Array(await jpeg.arrayBuffer()),
    );
    jpegPdf
      .addPage(w.Array.of(300, 200))
      .drawImage(jpegImage, { x: 0, y: 0, width: 300, height: 200 });
    const jpegBytes = await jpegPdf.save();
    const jpegResult = await w.UsefulToolPdfCompression.compress(
      jpegBytes,
      4096,
    );
    const jpegOutput = await P.PDFDocument.load(jpegResult.bytes);
    check(
      "PDF optimizer decodes and recompresses embedded JPEGs",
      jpegResult.images === 1 &&
        jpegResult.bytes.length <= 4096 &&
        jpegOutput.getPageCount() === 1,
    );
    // A custom Decode array changes image colour interpretation; preserve it.
    jpegPdf.context
      .lookup(jpegImage.ref)
      .dict.set(
        P.PDFName.of("Decode"),
        jpegPdf.context.obj(w.Array.of(1, 0, 1, 0, 1, 0)),
      );
    const custom = await w.UsefulToolPdfCompression.compress(
      await jpegPdf.save(),
      1000,
    );
    const customOutput = await P.PDFDocument.load(custom.bytes);
    const preservedImage = customOutput.context.lookup(jpegImage.ref);
    check(
      "unsupported PDF image colour mappings remain intact",
      custom.skipped === 1 &&
        custom.images === 0 &&
        preservedImage.dict.has(P.PDFName.of("Decode")) &&
        preservedImage.contents.length === jpeg.size,
    );
    const vectors = await P.PDFDocument.create();
    for (let pageNumber = 0; pageNumber < 2; pageNumber++) {
      const page = vectors.addPage(w.Array.of(300, 300));
      for (let n = 0; n < 1000; n++)
        page.drawRectangle({
          x: (n * 37) % 300,
          y: (n * 53) % 300,
          width: 2 + (n % 17),
          height: 3 + (n % 23),
          color: P.rgb((n % 7) / 7, (n % 11) / 11, (n % 17) / 17),
        });
      page.drawText("Selectable vector text", { x: 10, y: 270 });
    }
    upload("pdfFile", new w.File([await vectors.save()], "vectors.pdf"));
    await wait(
      () => !d.getElementById("compressButton").disabled,
      "vector PDF load",
    );
    input("targetSize", "8");
    click("compressButton");
    await wait(
      () => !d.getElementById("downloadButton").disabled,
      "unreachable PDF size",
    );
    check(
      "image-only PDF optimization reports an unreachable limit without flattening",
      d.getElementById("downloadButton").textContent.includes("above limit") &&
        !d.getElementById("resultFacts").textContent.includes("flattened"),
    );
    d.getElementById("allowRaster").checked = true;
    d.getElementById("allowRaster").dispatchEvent(new w.Event("input"));
    click("compressButton");
    await wait(
      () => !d.getElementById("downloadButton").disabled,
      "opt-in raster PDF",
    );
    click("downloadButton");
    const raster = await P.PDFDocument.load(await saved.arrayBuffer());
    check(
      "explicit PDF page-image fallback meets the budget and keeps both page sizes",
      saved.size <= 8192 &&
        raster.getPageCount() === 2 &&
        raster
          .getPages()
          .every((p) => p.getWidth() === 300 && p.getHeight() === 300) &&
        d.getElementById("resultFacts").textContent.includes("flattened"),
    );
    upload("pdfFile", new w.File(["invalid"], "broken.pdf"));
    await wait(
      () => d.getElementById("status").classList.contains("error"),
      "corrupt PDF rejection",
    );
    check(
      "corrupt PDF cannot download an earlier result",
      d.getElementById("downloadButton").disabled,
    );
    let previewError = false;
    try {
      await w.UsefulToolPDF.open(new w.Uint8Array([1, 2, 3]));
    } catch {
      previewError = true;
    }
    check(
      "invalid PDF preview rejects cleanly and releases its worker",
      previewError,
    );
    for (const mode of [1, 2, 10, 11, 12, 13, 14, 15]) {
      const context = P.PDFContext.create(),
        original =
          mode < 10
            ? new w.Uint8Array([7, 8, 9])
            : new w.Uint8Array([0, 7, 8, 9]);
      const stream = context.flateStream(original, {
        BitsPerComponent: 8,
        DecodeParms: { Predictor: mode, Colors: 3, Columns: 1 },
      });
      const out = w.UsefulToolPdfCompression.rawPixels(stream, 1, 1, 3);
      check(
        "PDF image predictor " + mode + " produces RGB pixels",
        out[0] === 7 && out[1] === 8 && out[2] === 9,
      );
    }
    await open("pdf-merge");
    downloads();
    const mergeLib = w.PDFLib;
    for (const [name, count] of [
      ["FIRST", 20],
      ["SECOND", 3],
    ]) {
      const source = await mergeLib.PDFDocument.create();
      for (let n = 1; n <= count; n++)
        source.addPage(w.Array.of(300, 400)).drawText(name + " " + n);
      upload("pdfInput", new w.File([await source.save()], name + ".pdf"));
      await wait(
        () => !d.getElementById("mergeButton").disabled,
        "merge source load",
      );
    }
    const range = (index, value) => {
      const e = d.querySelectorAll(".pdf-record .pdf-row input")[index];
      e.value = value;
      e.dispatchEvent(new w.Event("input"));
    };
    const cardButton = (index, text) =>
      [
        ...d.querySelectorAll(".pdf-record")[index].querySelectorAll("button"),
      ].find((button) => button.textContent === text);
    range(0, "2-14");
    range(1, "3-2,2");
    d.querySelector(".pdf-record summary").click();
    await wait(
      () => d.querySelectorAll(".pdf-record input[type=checkbox]").length === 8,
      "merge thumbnails",
    );
    cardButton(0, "Next pages").click();
    await wait(
      () => d.querySelector('.pdf-record input[data-page="15"]'),
      "second page of thumbnails",
    );
    check(
      "page preview navigation retains the requested selections",
      d.querySelector('.pdf-record input[data-page="13"]').checked &&
        !d.querySelector('.pdf-record input[data-page="14"]').checked,
    );
    cardButton(0, "Previous pages").click();
    await wait(
      () => d.querySelector('.pdf-record input[data-page="7"]'),
      "previous thumbnails",
    );
    click("mergeButton");
    await wait(
      () => !d.getElementById("builtPreview").hidden,
      "built PDF preview",
    );
    const output = await w.UsefulToolPDF.open(
      new w.Uint8Array(await saved.arrayBuffer()),
    );
    const labels = [];
    for (let n = 1; n <= output.numPages; n++)
      labels.push(
        (await (await output.getPage(n)).getTextContent()).items
          .map((item) => item.str)
          .join(""),
      );
    check(
      "merge download exactly follows ranges, descending order and duplicates",
      labels.join(",") ===
        [
          ...Array.from({ length: 13 }, (_, n) => "FIRST " + (n + 2)),
          "SECOND 3",
          "SECOND 2",
          "SECOND 2",
        ].join(","),
    );
    await output.destroy();
    const firstDownload = saved;
    saved = null;
    click("downloadMerged");
    check("built preview offers the same PDF again", saved === firstDownload);
    cardButton(0, "Select none").click();
    check(
      "Select none clears the first file without removing the second",
      d.querySelector(".pdf-record .pdf-row input").value === "none" &&
        !d.getElementById("mergeButton").disabled,
    );
    d.querySelector('.pdf-record input[data-page="0"]').click();
    check(
      "thumbnail selection updates the typed range",
      d.querySelector(".pdf-record .pdf-row input").value === "1",
    );
    d.querySelector('.pdf-record input[data-page="0"]').click();
    cardButton(0, "Select all").click();
    range(0, "999999999999999999999");
    check(
      "out-of-range page input is rejected before merging",
      d.getElementById("mergeButton").disabled &&
        d.querySelector(".range-error").textContent.includes("outside"),
    );
    d.querySelector('.pdf-record input[data-page="0"]').click();
    range(0, "2-14");
    cardButton(0, "Down").click();
    check(
      "file reordering keeps its selection attached",
      d.querySelector(".pdf-record strong").textContent === "SECOND.pdf" &&
        d.querySelectorAll(".pdf-record .pdf-row input")[1].value === "2-14",
    );
    cardButton(1, "Up").click();
    cardButton(1, "Remove").click();
    check(
      "removing a source keeps the other source usable",
      d.querySelectorAll(".pdf-record").length === 1 &&
        !d.getElementById("mergeButton").disabled,
    );
    click("clearButton");
    check(
      "clear removes previews and disables merge",
      d.querySelectorAll(".pdf-record").length === 0 &&
        d.getElementById("mergeButton").disabled &&
        d.getElementById("mergePreview").hidden,
    );
    upload("pdfInput", new w.File(["invalid"], "broken.pdf"));
    await wait(
      () => d.getElementById("status").classList.contains("error"),
      "corrupt merge input",
    );
    check(
      "merge rejects corrupt source PDFs",
      d.querySelectorAll(".pdf-record").length === 0,
    );
    await open("sticker");
    downloads();
    check(
      "sticker migration contains original eleven layers",
      d.querySelectorAll(".layer-item").length === 11,
    );
    const keyboardLayer = d.querySelector(".layer-row");
    keyboardLayer.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    check(
      "sticker layer can open from the keyboard",
      !!d.querySelector(".layer-edit"),
    );
    d.querySelector(".layer-row").dispatchEvent(
      new w.KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    check(
      "sticker layer can close from the keyboard",
      !d.querySelector(".layer-edit"),
    );
    for (const type of ["space", "line", "text"]) {
      d.querySelector('[data-add-layer="' + type + '"]').click();
      for (const field of d.querySelectorAll(".layer-edit input")) {
        field.value =
          field.type === "color"
            ? "#123456"
            : field.type === "text"
              ? "Example"
              : String(Number(field.value) + 1);
        field.dispatchEvent(new w.Event("input", { bubbles: true }));
      }
      if (type === "text") {
        const textField = d.querySelector('.layer-edit input[type="text"]');
        textField.value = "";
        textField.dispatchEvent(new w.Event("input", { bubbles: true }));
        check(
          "an empty sticker text layer still renders a usable canvas",
          d.getElementById("preview").width > 0,
        );
        textField.value = "Example";
        textField.dispatchEvent(new w.Event("input", { bubbles: true }));
      }
    }
    input("global-rot", "45");
    input("scale-slider", "50");
    for (const bg of ["black", "dark", "white", "transparent"]) {
      d.getElementById("bg-select").value = bg;
      d.getElementById("bg-select").dispatchEvent(new w.Event("change"));
    }
    d.querySelector(".layer-item:last-child .lbtn").click();
    d.querySelector(".layer-item .del").click();
    click("export-btn");
    await wait(() => saved, "sticker export");
    check(
      "sticker exports a PNG after all layer edits",
      saved.type === "image/png" && saved.size > 100,
    );
    await open("video-compress");
    downloads();
    const movie = await (
      await fetch("/tests/fixtures/video-editor.mp4")
    ).blob();
    upload(
      "videoFile",
      new w.File([movie], "video.mp4", { type: "video/mp4" }),
    );
    await wait(
      () =>
        !d.getElementById("compressButton").disabled ||
        d.getElementById("status").classList.contains("error"),
      "video input",
    );
    check(
      "light video tool detects input metadata",
      d.getElementById("originalFacts").textContent.includes("video.mp4"),
    );
    if (!d.getElementById("compressButton").disabled) {
      input("resolution", "320");
      input("frameRate", "15");
      input("encoding", "vp9");
      click("compressButton");
      await wait(
        () =>
          !d.getElementById("downloadButton").disabled ||
          d.getElementById("status").classList.contains("error"),
        "video conversion",
      );
      check(
        "light video encodes with available VP9",
        !d.getElementById("downloadButton").disabled,
        d.getElementById("status").textContent,
      );
      click("downloadButton");
      check("light video downloads WebM", saved?.type === "video/webm");
      input("frameRate", "24");
      check(
        "light video invalidates result after settings change",
        d.getElementById("downloadButton").disabled,
      );
      click("compressButton");
      click("cancelButton");
      check(
        "light video can cancel without stale output",
        d.getElementById("downloadButton").disabled,
      );
      // Model a decoder failure after real conversion initialization. The app
      // must refuse the export rather than accept a silently discarded track.
      const realInit = w.UTVideoCompress.Conversion.init;
      w.UTVideoCompress.Conversion.init = async function (...args) {
        const conversion = await realInit.apply(this, args);
        conversion.discardedTracks.push({
          reason: "Unavailable audio decoder (injected)",
        });
        return conversion;
      };
      try {
        click("compressButton");
        await wait(
          () => d.getElementById("status").classList.contains("error"),
          "discarded audio rejection",
        );
        check(
          "video export refuses an injected lost-audio conversion",
          d
            .getElementById("status")
            .textContent.includes("Cannot preserve every media track") &&
            d.getElementById("downloadButton").disabled,
        );
      } finally {
        w.UTVideoCompress.Conversion.init = realInit;
      }
    }
    upload("videoFile", new w.File([], "empty.mp4"));
    await wait(
      () => d.getElementById("status").classList.contains("error"),
      "empty video rejection",
    );
    check(
      "empty video clears the previous result and disables compression",
      d.getElementById("compressButton").disabled &&
        d.getElementById("downloadButton").disabled,
    );
    upload("videoFile", new w.File(["invalid"], "broken.mp4"));
    await wait(
      () => d.getElementById("status").classList.contains("error"),
      "corrupt video rejection",
    );
    check(
      "corrupt video reports an error and leaves download disabled",
      d.getElementById("downloadButton").disabled,
    );
  } finally {
    frame.remove();
  }
};
