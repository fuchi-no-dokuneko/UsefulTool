const { launch } = require("../video-studio/node_modules/puppeteer-core");
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const P = require("../../vendor/pdf-lib.min.js");
const root = path.resolve(__dirname, "../.."),
  reports = path.join(root, "build/reports/new-tools");
const downloads = path.join(reports, "downloads");
fs.mkdirSync(downloads, { recursive: true });
const checks = [],
  errors = [];
let browser, context, page;
const heartbeat = setInterval(async () => {
  if (page)
    console.log(
      "STATE",
      await page
        .evaluate(() => ({
          url: location.pathname,
          status: document.getElementById("status")?.textContent,
        }))
        .catch(() => ({ closed: true })),
    );
}, 20000);
heartbeat.unref();
const cases = (
  process.env.CASES || "image,merge,pdf,video,sticker,responsive,offline"
).split(",");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (name, ok, detail) => {
  checks.push({ name, passed: !!ok, detail });
  console.log((ok ? "PASS " : "FAIL ") + name);
  assert.ok(ok, JSON.stringify(detail));
};
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    "." + new URL(req.url, "http://local").pathname,
  );
  if (
    !file.startsWith(root + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  )
    return res.writeHead(404).end();
  res.writeHead(200, {
    "Content-Type":
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
      }[path.extname(file)] || "application/octet-stream",
  });
  res.end(fs.readFileSync(file));
});
async function open(name, offline = false) {
  if (context) await context.close();
  context = await browser.createBrowserContext({
    downloadBehavior: { policy: "allow", downloadPath: downloads },
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push({ page: name, error: String(e) }));
  await page.goto(
    offline
      ? require("node:url").pathToFileURL(
          path.join(root, "offline", name + ".html"),
        ).href
      : `http://127.0.0.1:${server.address().port}/${name}.html`,
  );
  await page.bringToFront();
}
async function upload(id, name) {
  await (await page.$("#" + id)).uploadFile(path.join(reports, name));
}
async function download(id, name) {
  const file = path.join(downloads, name);
  fs.rmSync(file, { force: true });
  await page.click("#" + id);
  for (let n = 0; n < 300; n++) {
    if (
      fs.existsSync(file) &&
      !fs.existsSync(file + ".part") &&
      fs.statSync(file).size > 0
    ) {
      await delay(100);
      await page.bringToFront();
      return fs.readFileSync(file);
    }
    await delay(100);
  }
  throw new Error("Download missing: " + name);
}
async function imageCase(offline = false) {
  await open("image-compress", offline);
  await upload("imageFile", "photo.png");
  await page.waitForFunction(
    () => !document.getElementById("compressButton").disabled,
  );
  await page.$eval("#targetSize", (e) => {
    e.value = "35";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#compressButton");
  await page.waitForFunction(
    () => !document.getElementById("downloadButton").disabled,
    { timeout: 120000 },
  );
  const facts = await page.$eval("#resultFacts", (e) => e.textContent);
  check(
    "image result is measured against target",
    facts.includes("35,840 byte limit"),
    facts,
  );
  const ext = facts.includes("WEBP") ? "webp" : "jpg";
  const bytes = await download("downloadButton", "photo-compressed." + ext);
  check(
    "downloaded compressed image is below target",
    bytes.length <= 35840,
    bytes.length,
  );
  const probe = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      path.join(downloads, "photo-compressed." + ext),
    ]),
  );
  check("compressed image independently decodes", probe.streams[0].width > 0);
  await page.screenshot({
    path: path.join(reports, offline ? "image-offline.png" : "image.png"),
    fullPage: true,
  });
  await page.$eval("#targetSize", (e) => {
    e.value = "2000";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  check(
    "changing image limit invalidates previous download",
    await page.$eval("#downloadButton", (e) => e.disabled),
  );
  await page.click("#compressButton");
  await page.waitForFunction(
    () => !document.getElementById("downloadButton").disabled,
  );
  const original = await download("downloadButton", "photo-compressed.png");
  check(
    "under-limit original is preserved byte for byte",
    original.equals(fs.readFileSync(path.join(reports, "photo.png"))),
  );
  await upload("imageFile", "alpha.png");
  await page.waitForFunction(
    () => !document.getElementById("compressButton").disabled,
  );
  await page.$eval("#targetSize", (e) => {
    e.value = "2";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#compressButton");
  await page.waitForFunction(
    () => !document.getElementById("downloadButton").disabled,
    { timeout: 120000 },
  );
  const alpha = await page.$eval("#resultPreview", async (img) => {
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
    return x.getImageData(0, 0, 1, 1).data[3];
  });
  check("image auto preserves transparency", alpha < 255, alpha);
}
async function mergeCase(offline = false) {
  await open("pdf-merge", offline);
  await upload("pdfInput", "first.pdf");
  await page.waitForFunction(
    () =>
      UsefulToolPdfMerge.records.length === 1 &&
      !document.getElementById("mergeButton").disabled,
  );
  await upload("pdfInput", "second.pdf");
  await page.waitForFunction(() => UsefulToolPdfMerge.records.length === 2);
  await page.$eval(".pdf-record input", (e) => {
    e.value = "2-14";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.$eval(".pdf-record:nth-child(2) input", (e) => {
    e.value = "3-2, 2";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#selectedPreview canvas").length === 8,
  );
  await page.click(".pdf-record summary");
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".pdf-record input[type=checkbox]").length ===
      8,
  );
  check(
    "per-file thumbnails reflect a typed range",
    await page.$eval(
      ".pdf-record",
      (e) =>
        !e.querySelector('[data-page="0"]').checked &&
        e.querySelector('[data-page="1"]').checked,
    ),
  );
  const bytes = await download("mergeButton", "usefultool-merged.pdf");
  const doc = await P.PDFDocument.load(bytes);
  check(
    "PDF merge respects per-file ranges, descending order and repeats",
    doc.getPageCount() === 16,
    doc.getPageCount(),
  );
  const words = await page.evaluate(async (bytes) => {
    const doc = await UsefulToolPDF.open(new Uint8Array(bytes));
    let text = [];
    for (let n = 1; n <= doc.numPages; n++)
      text.push(
        (await (await doc.getPage(n)).getTextContent()).items
          .map((x) => x.str)
          .join(""),
      );
    await doc.destroy();
    return text;
  }, Array.from(bytes));
  check(
    "merged PDF contains exact requested page order",
    JSON.stringify(words) ===
      JSON.stringify([
        ...Array.from({ length: 13 }, (_, n) => "FIRST " + (n + 2)),
        "SECOND 3",
        "SECOND 2",
        "SECOND 2",
      ]),
    words,
  );
  await page.waitForFunction(
    () => !document.getElementById("builtPreview").hidden,
  );
  await page.screenshot({
    path: path.join(reports, offline ? "merge-offline.png" : "merge.png"),
    fullPage: true,
  });
  await page.click('.pdf-record [data-page="1"]');
  check(
    "checkbox updates range and invalidates built PDF",
    await page.$eval("#builtPreview", (e) => e.hidden),
  );
  await page.$eval(".pdf-record input", (e) => {
    e.value = "99999999999999999999";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  check(
    "invalid page range disables merge",
    await page.$eval("#mergeButton", (e) => e.disabled),
  );
  await page.click("#clearButton");
  check(
    "clear removes PDF records and previews",
    await page.evaluate(
      () =>
        UsefulToolPdfMerge.records.length === 0 &&
        document.getElementById("mergePreview").hidden,
    ),
  );
}

async function pdfCase(offline = false) {
  await open("pdf-compress", offline);
  await upload("pdfFile", "pictures.pdf");
  await page.waitForFunction(
    () => !document.getElementById("compressButton").disabled,
  );
  await page.select("#targetUnit", "KiB");
  await page.$eval("#targetSize", (e) => {
    e.value = "180";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#compressButton");
  await page.waitForFunction(
    () => !document.getElementById("downloadButton").disabled,
    { timeout: 180000 },
  );
  const bytes = await download("downloadButton", "pictures-compressed.pdf");
  check(
    "compressed PDF download meets size limit",
    bytes.length <= 180 * 1024,
    bytes.length,
  );
  const pdf = await P.PDFDocument.load(bytes);
  check(
    "PDF compression retains page count and link annotations",
    pdf.getPageCount() === 2 &&
      pdf.getPages()[0].node.lookup(P.PDFName.of("Annots")).size() === 1,
  );
  const content = await page.evaluate(async (bytes) => {
    const doc = await UsefulToolPDF.open(new Uint8Array(bytes));
    let result = [];
    for (let n = 1; n <= doc.numPages; n++)
      result.push(
        (await (await doc.getPage(n)).getTextContent()).items
          .map((i) => i.str)
          .join(""),
      );
    await doc.destroy();
    return result;
  }, Array.from(bytes));
  check(
    "PDF image compression preserves searchable text",
    content[0].includes("SEARCHABLE TEXT") &&
      content[1].includes("ALPHA IMAGE"),
    content,
  );
  const pixels = await page.evaluate(async (bytes) => {
    const doc = await UsefulToolPDF.open(new Uint8Array(bytes)),
      c = document.createElement("canvas");
    await UsefulToolPDF.paint(doc, 2, c, 300);
    const x = c.getContext("2d"),
      corner = [...x.getImageData(35, 65, 1, 1).data],
      center = [...x.getImageData(150, 180, 1, 1).data];
    await doc.destroy();
    return { corner, center };
  }, Array.from(bytes));
  check(
    "PDF transparent image mask retains page background",
    pixels.corner[2] > 200 && pixels.corner[0] < 30,
    pixels,
  );
  await page.screenshot({
    path: path.join(reports, offline ? "pdf-offline.png" : "pdf.png"),
    fullPage: true,
  });
  await page.$eval("#targetSize", (e) => {
    e.value = ".001";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#compressButton");
  await page.click("#cancelButton");
  await delay(250);
  check(
    "PDF cancellation leaves no stale downloadable result",
    await page.$eval("#downloadButton", (e) => e.disabled),
  );
  await upload("pdfFile", "vectors.pdf");
  await page.waitForFunction(
    () => !document.getElementById("compressButton").disabled,
  );
  await page.$eval("#targetSize", (e) => {
    e.value = "8";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#allowRaster");
  await page.click("#compressButton");
  await page.waitForFunction(
    () => !document.getElementById("downloadButton").disabled,
    { timeout: 180000 },
  );
  const raster = await download("downloadButton", "vectors-compressed.pdf");
  check(
    "explicit page-image fallback meets target",
    raster.length <= 8192,
    raster.length,
  );
  check(
    "fallback clearly identifies lost text and links",
    await page.$eval("#resultFacts", (e) =>
      e.textContent.includes("flattened"),
    ),
  );
}
async function videoCase(offline = false) {
  await open("video-compress", offline);
  await upload("videoFile", "movie.mp4");
  await page.waitForFunction(
    () => !document.getElementById("compressButton").disabled,
    { timeout: 30000 },
  );
  await page.select("#resolution", "320");
  await page.select("#frameRate", "15");
  await page.select("#encoding", "vp9");
  await page.click("#compressButton");
  await page.waitForFunction(
    () =>
      !document.getElementById("downloadButton").disabled ||
      document.getElementById("status").classList.contains("error"),
    { timeout: 120000 },
  );
  check(
    "video compression completes",
    await page.$eval("#downloadButton", (e) => !e.disabled),
    await page.$eval("#status", (e) => e.textContent),
  );
  const bytes = await download("downloadButton", "movie-compressed.webm");
  const file = path.join(downloads, "movie-compressed.webm");
  const probe = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ]),
  );
  const video = probe.streams.find((s) => s.codec_type === "video"),
    audio = probe.streams.find((s) => s.codec_type === "audio");
  check(
    "downloaded video has chosen codec, dimensions and FPS",
    video.codec_name === "vp9" &&
      video.width === 320 &&
      video.height === 180 &&
      video.r_frame_rate === "15/1",
    video,
  );
  check(
    "video retains stereo sound and complete duration",
    audio?.channels === 2 && Math.abs(Number(probe.format.duration) - 4) < 0.2,
    probe.format,
  );
  check(
    "video is smaller for downscaled fixture",
    bytes.length < fs.statSync(path.join(reports, "movie.mp4")).size,
    {
      output: bytes.length,
      original: fs.statSync(path.join(reports, "movie.mp4")).size,
    },
  );
  execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"]);
  await page.screenshot({
    path: path.join(reports, offline ? "video-offline.png" : "video.png"),
    fullPage: true,
  });
  await page.select("#frameRate", "24");
  check(
    "changing video settings invalidates old result",
    await page.$eval("#downloadButton", (e) => e.disabled),
  );
  await page.click("#compressButton");
  await page.click("#cancelButton");
  await delay(500);
  check(
    "cancelled video does not offer partial output",
    await page.$eval("#downloadButton", (e) => e.disabled),
  );
  await page.select("#encoding", "vp8");
  await page.click("#compressButton");
  await page.waitForFunction(
    () => !document.getElementById("downloadButton").disabled,
    { timeout: 120000 },
  );
  await download("downloadButton", "movie-compressed.webm");
  const retry = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      file,
    ]),
  );
  check(
    "video cancellation can retry another codec and FPS",
    retry.streams[0].codec_name === "vp8" &&
      retry.streams[0].r_frame_rate === "24/1",
    retry.streams[0],
  );
}
async function stickerCase(offline = false) {
  if (!offline) {
    await open("sticker");
    await page.goto(
      `http://127.0.0.1:${server.address().port}/tests/new-tools/fixtures/sticker-original.html`,
    );
    const baseline = await page.$eval("#preview", (c) => c.toDataURL());
    await open("sticker");
    const migrated = await page.$eval("#preview", (c) => c.toDataURL());
    fs.writeFileSync(
      path.join(reports, "sticker-before.png"),
      Buffer.from(baseline.split(",")[1], "base64"),
    );
    fs.writeFileSync(
      path.join(reports, "sticker-after.png"),
      Buffer.from(migrated.split(",")[1], "base64"),
    );
    check(
      "sticker migration retains identical original artwork pixels",
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        path.join(reports, "sticker-before.png"),
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "pipe:1",
      ]).equals(
        execFileSync("ffmpeg", [
          "-v",
          "error",
          "-i",
          path.join(reports, "sticker-after.png"),
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgba",
          "pipe:1",
        ]),
      ),
    );
  } else await open("sticker", true);
  check(
    "all original sticker layers are retained",
    await page.$$eval(".layer-item", (e) => e.length === 11),
  );
  await page.click('[data-add-layer="text"]');
  await page.waitForSelector(".layer-edit input[type=text]");
  await page.$eval(".layer-edit input[type=text]", (e) => {
    e.value = "MY STICKER";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const controls = await page.$$eval(".layer-edit input", (e) =>
    e.map((x) => x.type),
  );
  check(
    "text, color, font size, spacing and glow controls remain",
    JSON.stringify(controls) ===
      JSON.stringify(["text", "color", "range", "range", "range"]),
    controls,
  );
  await page.select("#bg-select", "white");
  await page.$eval("#global-rot", (e) => {
    e.value = "123";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.$eval("#scale-slider", (e) => {
    e.value = "100";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const names = fs.readdirSync(downloads).filter((n) => n.startsWith("ring_"));
  for (const n of names) fs.rmSync(path.join(downloads, n));
  await page.click("#export-btn");
  let name;
  for (let n = 0; n < 100; n++) {
    name = fs.readdirSync(downloads).find((n) => /^ring_.*\.png$/.test(n));
    if (name) break;
    await delay(100);
  }
  check("sticker transparent PNG is downloaded", !!name);
  const alpha = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    path.join(downloads, name),
    "-vf",
    "crop=1:1:0:0,format=rgba",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  check(
    "sticker preview background does not enter exported PNG",
    alpha[3] === 0,
    Array.from(alpha),
  );
  await page.click(".layer-item:last-child .lbtn");
  check(
    "sticker reorder preserves all layers",
    await page.$$eval(".layer-item", (e) => e.length === 12),
  );
  await page.click(".layer-item:last-child .del");
  check(
    "sticker remove works",
    await page.$$eval(".layer-item", (e) => e.length === 11),
  );
  for (const type of ["space", "line"]) {
    await page.click(`[data-add-layer="${type}"]`);
    check(
      "add/edit " + type + " layer works",
      await page.$$eval(".layer-edit input", (e) => e.length > 0),
    );
  }
  await page.screenshot({
    path: path.join(reports, offline ? "sticker-offline.png" : "sticker.png"),
    fullPage: true,
  });
}
async function responsiveCase() {
  for (const name of [
    "image-compress",
    "pdf-merge",
    "pdf-compress",
    "video-compress",
    "sticker",
  ]) {
    await open(name);
    await page.setViewport({ width: 390, height: 844 });
    await delay(150);
    check(
      name + " fits mobile viewport",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: path.join(reports, name + "-mobile.png"),
      fullPage: true,
    });
  }
}
(async () => {
  try {
    if (!fs.existsSync(path.join(reports, "photo.png")))
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=1200x800,noise=alls=12:allf=t",
        "-frames:v",
        "1",
        path.join(reports, "photo.png"),
      ]);
    for (const [name, prefix, count] of [
      ["first.pdf", "FIRST", 20],
      ["second.pdf", "SECOND", 3],
    ]) {
      const pdf = await P.PDFDocument.create();
      for (let i = 1; i <= count; i++)
        pdf.addPage([300, 400]).drawText(prefix + " " + i, { x: 30, y: 200 });
      fs.writeFileSync(path.join(reports, name), await pdf.save());
    }
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    browser = await launch({
      browser: "firefox",
      executablePath:
        process.env.FIREFOX_BINARY || "/usr/bin/firefox",
      headless: process.env.FIREFOX_HEADED !== "1",
      defaultViewport: { width: 1440, height: 1000 },
      protocolTimeout: 180000,
    });
    // A real transparent fixture generated in the browser and saved locally.
    await open("image-compress");
    const png = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 500;
      const x = c.getContext("2d");
      x.fillStyle = "red";
      x.fillRect(100, 100, 300, 300);
      return c.toDataURL().split(",")[1];
    });
    fs.writeFileSync(
      path.join(reports, "alpha.png"),
      Buffer.from(png, "base64"),
    );

    const pdf = await P.PDFDocument.create(),
      picture = await pdf.embedPng(
        fs.readFileSync(path.join(reports, "photo.png")),
      ),
      alphaImage = await pdf.embedPng(
        fs.readFileSync(path.join(reports, "alpha.png")),
      );
    const p1 = pdf.addPage([600, 500]);
    p1.drawImage(picture, { x: 0, y: 30, width: 600, height: 400 });
    p1.drawText("SEARCHABLE TEXT", { x: 30, y: 460 });
    const ann = pdf.context.register(
      pdf.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [0, 0, 100, 30],
        A: {
          Type: "Action",
          S: "URI",
          URI: P.PDFString.of("https://example.com/"),
        },
      }),
    );
    p1.node.set(P.PDFName.of("Annots"), pdf.context.obj([ann]));
    const p2 = pdf.addPage([600, 500]);
    p2.drawRectangle({
      x: 0,
      y: 0,
      width: 600,
      height: 500,
      color: P.rgb(0, 0, 1),
    });
    p2.drawImage(alphaImage, { x: 50, y: 50, width: 400, height: 400 });
    p2.drawText("ALPHA IMAGE", { x: 30, y: 460 });
    fs.writeFileSync(path.join(reports, "pictures.pdf"), await pdf.save());
    const vectors = await P.PDFDocument.create(),
      vp = vectors.addPage([400, 400]);
    for (let n = 0; n < 3500; n++)
      vp.drawRectangle({
        x: (n * 37) % 400,
        y: (n * 53) % 400,
        width: 2 + (n % 17),
        height: 3 + (n % 23),
        color: P.rgb((n % 7) / 7, (n % 11) / 11, (n % 17) / 17),
      });
    vp.drawText("VECTOR TEXT");
    fs.writeFileSync(path.join(reports, "vectors.pdf"), await vectors.save());
    if (!fs.existsSync(path.join(reports, "movie.mp4")))
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=640x360:r=30:d=4",
        "-f",
        "lavfi",
        "-i",
        "aevalsrc=0.15*sin(2*PI*440*t)|0.15*sin(2*PI*880*t):s=48000:d=4",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-shortest",
        path.join(reports, "movie.mp4"),
      ]);
    if (cases.includes("image")) await imageCase();
    if (cases.includes("merge")) await mergeCase();
    if (cases.includes("pdf")) await pdfCase();
    if (cases.includes("video")) await videoCase();
    if (cases.includes("sticker")) await stickerCase();
    if (cases.includes("responsive")) await responsiveCase();
    if (cases.includes("offline")) {
      await imageCase(true);
      await mergeCase(true);
      await pdfCase(true);
      await videoCase(true);
      await stickerCase(true);
    }

    check("no unhandled browser errors", errors.length === 0, errors);
  } catch (error) {
    if (page) {
      console.error(
        "PAGE STATE",
        await page
          .evaluate(() => ({
            url: location.href,
            status: document.getElementById("status")?.textContent,
            errors: document.querySelectorAll(".error").length,
          }))
          .catch(() => ({})),
      );
      await page
        .screenshot({ path: path.join(reports, "failure.png"), fullPage: true })
        .catch(() => {});
    }
    throw error;
  } finally {
    clearInterval(heartbeat);
    if (browser) await browser.close();
    server.close();
    fs.writeFileSync(
      path.join(reports, "uat-" + cases.join("-") + ".json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
