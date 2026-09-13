// Run only video-studio acceptance. No unrelated pages or test files are changed.
const {
  Builder,
  By,
} = require("../../acceptance/node_modules/selenium-webdriver");
const chrome = require("../../acceptance/node_modules/selenium-webdriver/chrome");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "../..");
const reports = path.join(root, "build/reports/video-studio");
const fixtures = path.join(reports, "fixtures");
fs.mkdirSync(fixtures, { recursive: true });
if (!fs.existsSync(path.join(fixtures, "source.mp4")))
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x90:rate=30:duration=1.2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=1.2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    path.join(fixtures, "source.mp4"),
  ]);
if (!fs.existsSync(path.join(fixtures, "music.mp3")))
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:sample_rate=48000:duration=1.2",
    "-c:a",
    "libmp3lame",
    path.join(fixtures, "music.mp3"),
  ]);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
};
const server = http.createServer((req, res) => {
  let file;
  try {
    file = path.resolve(
      root,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (
    !file.startsWith(root + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  ) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": mime[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(file).pipe(res);
});
(async () => {
  let driver, profile;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const snap = path.join(os.homedir(), "snap/chromium/common");
    profile = fs.mkdtempSync(
      path.join(
        fs.existsSync(snap) ? snap : os.tmpdir(),
        "video-studio-tests-",
      ),
    );
    const binary =
      process.env.CHROME_BINARY ||
      [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
      ].find(fs.existsSync);
    const options = new chrome.Options()
      .setChromeBinaryPath(binary)
      .addArguments(
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--autoplay-policy=no-user-gesture-required",
        "--window-size=1363,1079",
        "--user-data-dir=" + profile,
      );
    const driverPath =
      process.env.CHROMEDRIVER_PATH ||
      (process.env.PATH || "")
        .split(path.delimiter)
        .map((dir) => path.join(dir, "chromedriver"))
        .find(fs.existsSync);
    const service = new chrome.ServiceBuilder(driverPath).loggingTo(
      path.join(reports, "driver.log"),
    );
    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .setChromeService(service)
      .build();
    // Headless Chrome otherwise keeps iframe documents unfocused: focus() changes
    // activeElement but never dispatches focus events. Emulate an active window.
    await driver.sendDevToolsCommand("Emulation.setFocusEmulationEnabled", {
      enabled: true,
    });
    await driver
      .manage()
      .setTimeouts({ pageLoad: 30000, script: 90000, implicit: 0 });
    const page = process.argv[2] || "core.html";
    if (page === "long-playback.html") require("./create-long-fixtures.cjs");
    if (page === "touch.html") {
      await driver.sendDevToolsCommand("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 936,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await driver.sendDevToolsCommand("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 5,
      });
    }
    const url = "http://127.0.0.1:" + server.address().port;
    await driver.get(url + "/tests/video-studio/" + page);
    await driver.wait(
      () => driver.executeScript("return !!window.TEST_RESULT"),
      page === "long-playback.html" ? 300000 : 90000,
    );
    const result = await driver.executeScript("return window.TEST_RESULT");
    if (page === "offline.html" && result.passed) {
      // Opening the downloaded file is a distinct origin/security context from
      // serving its embedded code over localhost. Exercise the real file too.
      await driver.get(
        pathToFileURL(path.join(root, "offline/video-editor.html")).href,
      );
      await driver.wait(
        () =>
          driver.executeScript("return !!window.UsefulToolVideoEditor?.ready"),
        20000,
      );
      await driver
        .findElement(By.id("videoFiles"))
        .sendKeys(path.join(fixtures, "source.mp4"));
      await driver.wait(
        () =>
          driver.executeScript(
            "return window.UsefulToolVideoEditor.project.items.length===2",
          ),
        20000,
      );
      await driver.executeAsyncScript(
        "const done=arguments[arguments.length-1]; UsefulToolVideoEditor.store.flush().then(()=>done(true),e=>done(e.message));",
      );
      await driver.navigate().refresh();
      await driver.wait(
        () =>
          driver.executeScript(
            'return !!document.getElementById("continueProjectButton")',
          ),
        20000,
      );
      await driver.findElement(By.id("continueProjectButton")).click();
      await driver.wait(
        () =>
          driver.executeScript(
            "const a=UsefulToolVideoEditor;return !a.loading && a.project.items.length===2 && a.project.assets.every(f=>a.library.has(f.id))",
          ),
        20000,
      );
      const local = await driver.executeAsyncScript(
        'const done=arguments[arguments.length-1],a=UsefulToolVideoEditor;a.project.exportSettings.quality="high";a.project.exportSettings.bitrate=.5;a.engine.recordRange(.1,.7).then(r=>done({size:r?.blob.size,width:r?.width}),e=>done({error:e.message}));',
      );
      result.checks.push({
        name: "downloaded file opens imports recovers after refresh and exports under file protocol",
        passed: local.size > 1000 && local.width === 160,
      });
      result.passed = result.checks.every((c) => c.passed);
      if (!result.passed) result.error = JSON.stringify(local);
    }
    fs.writeFileSync(
      path.join(reports, page.replace(".html", ".json")),
      JSON.stringify(result, null, 2),
    );
    fs.writeFileSync(
      path.join(reports, page.replace(".html", ".png")),
      Buffer.from(await driver.takeScreenshot(), "base64"),
    );
    for (const c of result.checks || [])
      console.log((c.passed ? "PASS " : "FAIL ") + c.name);
    if (!result.passed)
      throw new Error(
        result.error || "Video Studio browser acceptance failed.",
      );
    console.log(
      "Video Studio browser acceptance passed: " +
        (result.checks || []).length +
        " checks.",
    );
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
    if (driver) {
      const state = await driver
        .executeScript(
          'return {result:window.TEST_RESULT,progress:window.TEST_PROGRESS,frames:[...document.querySelectorAll("iframe")].map(f=>({title:f.contentDocument.title,ready:f.contentWindow.UsefulToolVideoEditor?.ready,playing:f.contentWindow.UsefulToolVideoEditor?.engine?.playing,exporting:f.contentWindow.UsefulToolVideoEditor?.exporting,dialog:f.contentDocument.querySelector("dialog")?.open,error:f.contentDocument.querySelector("#contextError")?.textContent,status:f.contentDocument.querySelector("#saveStatus")?.textContent,exportStatus:f.contentDocument.querySelector("#exportPercent")?.textContent}))}',
        )
        .catch((e) => ({ error: e.message }));
      fs.writeFileSync(
        path.join(reports, "failure-state.json"),
        JSON.stringify(state, null, 2),
      );
      fs.writeFileSync(
        path.join(reports, "failure.png"),
        Buffer.from(await driver.takeScreenshot(), "base64"),
      );
      console.error(
        JSON.stringify({
          ...state,
          result: state.result && {
            passed: state.result.passed,
            checks: state.result.checks,
            error: state.result.error,
          },
          progress: state.progress?.current || state.progress,
        }),
      );
    }
  } finally {
    if (driver) await driver.quit();
    server.close();
    if (profile) fs.rmSync(profile, { recursive: true, force: true });
  }
})();
