// Real Firefox UI playback checks. No decoder, audio graph, or playback mocks.
const { launch } = require("puppeteer-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const reports = path.join(root, "build/reports/video-studio/firefox-preview");
fs.mkdirSync(reports, { recursive: true });
const fixture = path.join(reports, "moving-stereo.mp4");
if (!fs.existsSync(fixture))
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x180:rate=30:duration=8",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc=0.15*sin(2*PI*440*t)|0.15*sin(2*PI*880*t):s=48000:d=8",
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
  const file = path.resolve(
    root,
    "." + new URL(req.url, "http://localhost").pathname,
  );
  if (
    !file.startsWith(root + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  )
    return res.writeHead(404).end();
  res.writeHead(200, {
    "Content-Type":
      { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
        path.extname(file)
      ] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(file).pipe(res);
});
const checks = [],
  errors = [],
  processes = new Set();
let browser, page, version;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function descendants(pid) {
  const rows = execFileSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((row) => row.trim().split(/\s+/).map(Number));
  const ids = new Set([pid]);
  for (let n = 0; n < 10; n++)
    for (const [child, parent] of rows) if (ids.has(parent)) ids.add(child);
  return ids;
}
async function closeBrowser() {
  if (!browser) return;
  const ids = descendants(browser.process().pid);
  await browser.close().catch(() => {});
  for (const pid of ids) {
    processes.add(pid);
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  browser = null;
}
async function startBrowser(noAudio = false) {
  browser = await launch({
    browser: "firefox",
    executablePath:
      process.env.FIREFOX_BINARY ||
      path.join(os.homedir(), "UAT-firefox/firefox/firefox"),
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    protocolTimeout: 90000,
    env: noAudio
      ? {
          ...process.env,
          PULSE_SERVER: "unix:" + path.join(reports, "missing-audio-socket"),
        }
      : process.env,
  });
  processes.add(browser.process().pid);
  version = await browser.version();
}
function check(name, condition, detail) {
  checks.push({ name, passed: Boolean(condition), detail });
  console.log((condition ? "PASS " : "FAIL ") + name);
  assert.ok(condition, name + (detail ? ": " + JSON.stringify(detail) : ""));
}
async function open(url) {
  const context = await browser.createBrowserContext();
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.UsefulToolVideoEditor?.ready);
  await (await page.$("#videoFiles")).uploadFile(fixture);
  await page.waitForFunction(
    () =>
      UsefulToolVideoEditor.project.items.length === 2 &&
      !UsefulToolVideoEditor.loading &&
      !UsefulToolVideoEditor.engine.seeking,
  );
  return context;
}
const click = (selector) => page.locator(selector).click();
async function snapshot() {
  return page.evaluate(() => {
    const a = UsefulToolVideoEditor,
      canvas = document.getElementById("previewCanvas"),
      rect = canvas.getBoundingClientRect();
    const pixels = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261,
      colored = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      hash =
        Math.imul(
          hash ^ pixels[i] ^ pixels[i + 1] ^ pixels[i + 2],
          16777619,
        ) >>> 0;
      if (
        Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) -
          Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) >
        30
      )
        colored++;
    }
    const output = document.getElementById("outputVideo");
    return {
      time: a.project.playhead,
      playing: a.engine.playing,
      preparing: a.engine.preparing,
      visible:
        !canvas.hidden &&
        rect.width > 10 &&
        rect.height > 10 &&
        getComputedStyle(canvas).display !== "none",
      hash,
      colored,
      width: rect.width,
      height: rect.height,
      peak: a.mixer.peak(),
      outputVisible: !output.hidden,
      outputPaused: output.paused,
      audioState: a.mixer.context?.state,
      status: document.getElementById("previewStatus").textContent,
    };
  });
}
async function seekStart() {
  await page.focus("#seek");
  await page.keyboard.press("Home");
  await page.waitForFunction(
    () =>
      !UsefulToolVideoEditor.engine.seeking &&
      UsefulToolVideoEditor.project.playhead < 0.05,
  );
}
async function moving(label, audible = true) {
  await page.waitForFunction(
    () =>
      UsefulToolVideoEditor.engine.playing &&
      !UsefulToolVideoEditor.engine.preparing,
    { timeout: 7000 },
  );
  const samples = [];
  for (let n = 0; n < 4; n++) {
    await delay(200);
    samples.push(await snapshot());
  }
  check(
    label + ": visible picture and clock advance",
    samples.every((s) => s.visible && s.colored > 100) &&
      new Set(samples.map((s) => s.hash)).size >= 3 &&
      samples.at(-1).time - samples[0].time > 0.4,
    samples,
  );
  if (audible)
    check(
      label + ": real audio is running",
      samples.some((s) => s.peak > 0.01) &&
        samples.every((s) => s.audioState === "running"),
    );
  return samples;
}
async function screenshot(name) {
  await page.screenshot({
    path: path.join(reports, name + ".png"),
    fullPage: true,
  });
}
async function workflow(url, name) {
  const context = await open(url);
  await page.setViewport({ width: 1920, height: 1080 });
  const imported = await snapshot();
  check(
    name + ": upload renders actual video pixels",
    imported.visible && imported.colored > 100,
    imported,
  );
  await click("#playButton");
  await moving(name + " first Play");
  await click("#playButton");
  const paused = await snapshot();
  await delay(350);
  const held = await snapshot();
  check(
    name + ": Pause holds the clock and picture",
    !held.playing && held.time === paused.time && held.hash === paused.hash,
  );
  await seekStart();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => !UsefulToolVideoEditor.engine.seeking);
  check(
    name + ": seek slider moves the paused preview",
    (await snapshot()).time > 0,
  );
  const beforeFrame = await snapshot();
  for (let n = 0; n < 4; n++) await click('[data-help-id="frameForward"]');
  await page.waitForFunction(() => !UsefulToolVideoEditor.engine.seeking);
  const afterFrame = await snapshot();
  check(
    name + ": frame stepping changes actual pixels",
    afterFrame.time > beforeFrame.time && afterFrame.hash !== beforeFrame.hash,
  );
  await click("#decoupleChannelsButton");
  await click("#playButton");
  await moving(name + " decoupled ears");
  await click('[data-track-toggle="main"]');
  await delay(200);
  check(
    name + ": picture track Off removes video pixels",
    (await snapshot()).colored === 0,
  );
  await click('[data-track-toggle="main"]');
  await moving(name + " picture track restored");
  const ears = await page.evaluate(() =>
    UsefulToolVideoEditor.project.items
      .filter((item) => item.kind === "audio")
      .map((item) => item.layerId),
  );
  for (const id of ears) await click(`[data-track-toggle="${id}"]`);
  const muted = await moving(name + " both ear tracks Off", false);
  check(
    name + ": disabled ear tracks are silent without pausing the picture",
    muted.every((sample) => sample.peak < 0.0001),
  );
  for (const id of ears) await click(`[data-track-toggle="${id}"]`);
  await moving(name + " ear tracks restored");
  await click("#playButton");
  await seekStart();
  await click("#step-export");
  await page.focus('select[data-control="quality"]');
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => UsefulToolVideoEditor.project.exportSettings.quality === "high",
  );
  await click("#exportButton");
  await page.waitForFunction(
    () =>
      !UsefulToolVideoEditor.exporting &&
      UsefulToolVideoEditor.results.length === 1,
    { timeout: 120000 },
  );
  await page.waitForFunction(
    () => document.getElementById("outputVideo").readyState >= 2,
  );
  check(
    name + ": UI export shows the encoded movie",
    (await snapshot()).outputVisible,
  );
  // This previously advanced a hidden canvas behind a paused exported video.
  await click("#playButton");
  await moving(name + " Play after export");
  const afterExport = await snapshot();
  check(
    name + ": timeline playback hides and pauses the exported player",
    !afterExport.outputVisible && afterExport.outputPaused,
  );
  await screenshot(name + "-after-export");
  await click("#playButton");
  // Export again using the UI, then exercise the keyboard route too.
  await click("#exportButton");
  await page.waitForFunction(
    () =>
      !UsefulToolVideoEditor.exporting &&
      UsefulToolVideoEditor.results.length === 1,
    { timeout: 120000 },
  );
  await page.focus("#playButton");
  await page.keyboard.press(" ");
  await moving(name + " Space after export");
  await click("#playButton");
  await context.close();
}
(async () => {
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url =
      "http://127.0.0.1:" + server.address().port + "/video-editor.html";
    await startBrowser();
    console.log(version);
    await workflow(url, "online");
    await workflow(
      pathToFileURL(path.join(root, "offline/video-editor.html")).href,
      "offline",
    );
    const context = await open(url);
    for (const [label, width, height, scale] of [
      ["desktop", 1440, 900, 1],
      ["4k", 3840, 2160, 1],
      ["portrait", 820, 1180, 1],
      ["phone", 320, 568, 1],
      ["200-percent", 720, 500, 2],
    ]) {
      await page.setViewport({ width, height, deviceScaleFactor: scale });
      await seekStart();
      await click("#playButton");
      await moving(label + " resized preview");
      await screenshot(label);
      await click("#playButton");
    }
    await context.close();
    await closeBrowser();
    // A real unavailable output, not a mocked AudioContext or playback engine.
    await startBrowser(true);
    await open(url);
    await click("#playButton");
    await delay(150);
    await click("#playButton");
    await delay(2700);
    check(
      "cancelling audio startup cannot restart playback later",
      !(await snapshot()).playing && (await snapshot()).time === 0,
    );
    await click("#playButton");
    await moving("unavailable audio output", false);
    const silent = await snapshot();
    check(
      "unavailable audio is clearly identified instead of hanging",
      silent.audioState === "suspended" &&
        silent.status.includes("silent preview"),
    );
    await screenshot("audio-unavailable");
    check(
      "no application errors in Firefox preview UAT",
      errors.length === 0,
      errors,
    );
  } catch (error) {
    if (page) await screenshot("failure").catch(() => {});
    errors.push(error.stack);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closeBrowser();
    server.close();
    fs.writeFileSync(
      path.join(reports, "report.json"),
      JSON.stringify(
        {
          browser: version,
          passed: !process.exitCode,
          checks,
          errors,
          closedProcesses: [...processes],
        },
        null,
        2,
      ),
    );
    console.log("Closed owned Firefox processes:", [...processes].join(", "));
  }
})();
