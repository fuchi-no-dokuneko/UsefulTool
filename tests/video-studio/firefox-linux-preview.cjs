// Real Linux Firefox decoding, with separate, explicit bitmap fault injection.
const { launch } = require("puppeteer-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const reports = path.join(
  root,
  "build/reports/video-studio/linux-preview-regression",
);
fs.mkdirSync(reports, { recursive: true });
const fixture = path.join(reports, "hd.mp4");
if (!fs.existsSync(fixture))
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=1920x1080:rate=30:duration=4",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=4",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    fixture,
  ]);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const file = path.resolve(root, "." + url.pathname);
  if (
    !file.startsWith(root + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  )
    return res.writeHead(404).end();
  let data = fs.readFileSync(file);
  if (url.searchParams.has("legacy") && url.pathname === "/video-editor.html") {
    // The previous release nested its timeline inside the preview workspace.
    data = data
      .toString()
      .replace(
        '      </section>\n      <section class="timeline-card"',
        '      <section class="timeline-card"',
      )
      .replace(
        '      <aside\n        class="context-panel"',
        '      </section>\n      <aside\n        class="context-panel"',
      )
      .replace(/\?v=studio-[^"\s]+/g, "?v=studio-3");
  }
  res.writeHead(200, {
    "Content-Type":
      { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
        path.extname(file)
      ] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(data);
});
const checks = [],
  errors = [],
  processes = new Set();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser, version;
function check(name, passed, detail) {
  checks.push({ name, passed: Boolean(passed), detail });
  console.log((passed ? "PASS " : "FAIL ") + name);
  assert.ok(passed, name + ": " + JSON.stringify(detail));
}
async function snapshot(page) {
  return page.evaluate(() => {
    const api = UsefulToolVideoEditor,
      canvas = document.getElementById("previewCanvas");
    const video = api.project.items.find((i) => i.kind === "video"),
      decoder = api.library.element(video);
    const pixels = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    const native = document.createElement("canvas");
    native.width = canvas.width;
    native.height = canvas.height;
    new UTStudio.Renderer({
      assets: api.library.assets,
      element: (value) => api.library.element(value),
    }).render(api.project, api.project.playhead, native);
    const reference = native
      .getContext("2d")
      .getImageData(0, 0, native.width, native.height).data;
    let colored = 0,
      hash = 2166136261,
      difference = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (
        Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) -
          Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) >
        30
      )
        colored++;
      hash =
        Math.imul(
          hash ^ pixels[i] ^ pixels[i + 1] ^ pixels[i + 2],
          16777619,
        ) >>> 0;
      for (let c = 0; c < 3; c++)
        difference += Math.abs(pixels[i + c] - reference[i + c]);
    }
    const rect = canvas.getBoundingClientRect(),
      state = api.library.frames.get(video.id);
    return {
      time: api.project.playhead,
      seeking: api.engine.seeking,
      preparing: api.engine.preparing,
      width: rect.width,
      height: rect.height,
      pixels: [canvas.width, canvas.height],
      visible: !canvas.hidden && getComputedStyle(canvas).display !== "none",
      colored: colored / (pixels.length / 4),
      hash,
      difference: difference / ((pixels.length / 4) * 3),
      decoder: { ready: decoder.readyState, time: decoder.currentTime },
      pending: Boolean(state?.pending),
      fallback: Boolean(state?.fallback),
      conversionCalls: window.conversionCalls || 0,
    };
  });
}
async function scenario(name, url) {
  const context = await browser.createBrowserContext(),
    page = await context.newPage();
  page.on("pageerror", (error) => errors.push({ name, error: String(error) }));
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push({ name, error: message.text() });
  });
  try {
    await page.goto(url + (name === "legacy" ? "?legacy=1" : ""));
    await page.waitForFunction(() => window.UsefulToolVideoEditor?.ready);
    await page.evaluate((name) => {
      window.conversionCalls = 0;
      if (name === "stalled")
        window.createImageBitmap = () => {
          conversionCalls++;
          return new Promise(() => {});
        };
      if (name === "rejected")
        window.createImageBitmap = () => {
          conversionCalls++;
          return Promise.reject(
            new DOMException(
              "Injected GPU surface copy failure",
              "UnknownError",
            ),
          );
        };
      if (name === "native") {
        window.createImageBitmap = undefined;
        window.VideoFrame = undefined;
      }
    }, name);
    await (await page.$("#videoFiles")).uploadFile(fixture);
    await page.waitForFunction(() =>
      UsefulToolVideoEditor.project.items.some((i) => i.kind === "video"),
    );
    // Do not hang this UAT if the bug leaves Engine.prepare waiting forever.
    await page
      .waitForFunction(
        () =>
          !UsefulToolVideoEditor.engine.seeking &&
          !UsefulToolVideoEditor.loading,
        { timeout: 4000 },
      )
      .catch(() => {});
    await delay(100);
    const imported = await snapshot(page);
    await page.screenshot({ path: path.join(reports, name + "-import.png") });
    check(
      name + ": upload completes with a visible decoded frame",
      !imported.seeking &&
        imported.visible &&
        imported.width > 100 &&
        imported.height > 80 &&
        imported.colored > 0.8,
      imported,
    );
    check(
      name + ": preview matches the native decoder",
      imported.difference < 4,
      imported.difference,
    );
    if (name === "normal") {
      await page.evaluate(() => {
        document.getElementById("stageViewport").style.display = "none";
      });
      await delay(100);
      const hidden = await snapshot(page);
      check(
        "hidden viewport preserves its backing canvas",
        hidden.pixels.join() === imported.pixels.join(),
        hidden,
      );
      await page.evaluate(() => {
        document.getElementById("stageViewport").style.display = "";
      });
      await delay(100);
      const restored = await snapshot(page);
      check(
        "showing the viewport restores its decoded picture",
        restored.colored > 0.8 && restored.height > 80,
        restored,
      );
    }
    if (["stalled", "rejected"].includes(name))
      check(
        name + ": conversion failure is contained",
        imported.fallback && !imported.pending && imported.conversionCalls > 0,
        imported,
      );
    await page.evaluate(() => UsefulToolVideoEditor.seekTo(1));
    const sought = await snapshot(page);
    check(
      name + ": seeking paints the requested frame",
      !sought.seeking && sought.hash !== imported.hash && sought.difference < 4,
      sought,
    );
    await page.locator("#playButton").click();
    await page.waitForFunction(
      () =>
        UsefulToolVideoEditor.engine.playing &&
        !UsefulToolVideoEditor.engine.preparing,
      { timeout: 7000 },
    );
    const samples = [];
    for (let n = 0; n < 4; n++) {
      await delay(180);
      samples.push(await snapshot(page));
    }
    check(
      name + ": Play advances actual video pixels and the clock",
      samples.every((s) => s.colored > 0.8) &&
        new Set(samples.map((s) => s.hash)).size >= 3 &&
        samples.at(-1).time - samples[0].time > 0.4,
      samples,
    );
    await page.locator("#playButton").click();
    await page.evaluate(() => UsefulToolVideoEditor.seekTo(1));
    if (["normal", "legacy", "stalled"].includes(name)) {
      for (const [width, height] of [
        [1920, 1080],
        [1366, 768],
        [1024, 768],
        [390, 844],
        [2560, 1440],
      ]) {
        await page.setViewport({ width, height });
        await delay(150);
        const resized = await snapshot(page);
        check(
          name + ": visible after resizing to " + width + "×" + height,
          resized.visible &&
            resized.width > 100 &&
            resized.height > 80 &&
            resized.colored > 0.8 &&
            resized.difference < 4,
          resized,
        );
        await page.screenshot({
          path: path.join(reports, name + "-" + width + "x" + height + ".png"),
          fullPage: true,
        });
      }
    }
  } finally {
    await context.close();
  }
}
(async () => {
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    browser = await launch({
      browser: "firefox",
      executablePath:
        process.env.FIREFOX_BINARY ||
        path.join(os.homedir(), "UAT-firefox/firefox/firefox"),
      headless: process.env.FIREFOX_HEADED !== "1",
      defaultViewport: { width: 1366, height: 768 },
      protocolTimeout: 90000,
    });
    processes.add(browser.process().pid);
    version = await browser.version();
    for (const name of (
      process.env.SCENARIOS || "normal,legacy,stalled,rejected,native"
    ).split(","))
      await scenario(
        name,
        "http://127.0.0.1:" + server.address().port + "/video-editor.html",
      );
    check("no browser errors", errors.length === 0, errors);
  } finally {
    if (browser) {
      const rows = execFileSync("ps", ["-eo", "pid=,ppid="], {
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .map((r) => r.trim().split(/\s+/).map(Number));
      for (let n = 0; n < 10; n++)
        for (const [pid, ppid] of rows)
          if (processes.has(ppid)) processes.add(pid);
      await browser.close().catch(() => {});
      for (const pid of processes)
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
    }
    server.close();
    fs.writeFileSync(
      path.join(
        reports,
        (process.env.REPORT_NAME || "firefox-regressions") + ".json",
      ),
      JSON.stringify(
        {
          version,
          headed: process.env.FIREFOX_HEADED === "1",
          checks,
          errors,
          closedProcesses: [...processes],
        },
        null,
        2,
      ),
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
