(async () => {
  const checks = [];
  const check = (name, ok) => {
    checks.push({ name, passed: Boolean(ok) });
    if (!ok) throw new Error(name);
  };
  const frame = document.getElementById("studio");
  const wait = async (predicate) => {
    const start = performance.now();
    while (!predicate()) {
      if (performance.now() - start > 20000)
        throw new Error("Touch editor timed out");
      await new Promise((r) => setTimeout(r, 30));
    }
  };
  try {
    await wait(() => frame.contentWindow.UsefulToolVideoEditor?.ready);
    const w = frame.contentWindow,
      d = frame.contentDocument,
      api = w.UsefulToolVideoEditor;
    check(
      "browser emulates a coarse touch pointer",
      w.matchMedia("(hover: none) and (pointer: coarse)").matches,
    );
    const importButton = d.getElementById("addVideosButton");
    const info = (
      importButton || d.querySelector('button[data-help-id="addVideos"]')
    ).parentElement.querySelector(".touch-help");
    info.click();
    const tip = d.getElementById("studio-tooltip");
    check(
      "visible touch information opens the shared explanation",
      info.getBoundingClientRect().width >= 40 &&
        !tip.hidden &&
        tip.textContent.includes("Choose video files"),
    );
    w.UTStudio.Help.close();
    const source = await (await fetch("fixtures/source.mp4")).blob();
    await api.importFiles(
      [new w.File([source], "touch.mp4", { type: "video/mp4" })],
      "video",
    );
    api.setStep("arrange");
    await api.seekTo(0.2);
    const helpTargets = [...d.querySelectorAll(".touch-help")].filter(
      (e) => e.getBoundingClientRect().width > 0,
    );
    check(
      "all visible touch information targets are at least forty pixels",
      helpTargets.length > 10 &&
        helpTargets.every((e) => {
          const r = e.getBoundingClientRect();
          return r.width >= 40 && r.height >= 40;
        }),
    );
    const overflowingControls = [
      ...d.querySelectorAll(".workflow-stepper button, .transport button"),
    ]
      .map((e) => ({
        name: e.getAttribute("aria-label"),
        rect: e.getBoundingClientRect().toJSON(),
      }))
      .filter(({ rect }) => rect.width && (rect.left < 0 || rect.right > 390));
    if (overflowingControls.length || d.documentElement.scrollWidth > 392)
      throw new Error(
        JSON.stringify({
          overflowingControls,
          bodyWidth: d.documentElement.scrollWidth,
        }),
      );
    check(
      "touch stepper and transport stay within the phone viewport",
      !overflowingControls.length && d.documentElement.scrollWidth <= 392,
    );
    api.addNewItem("text");
    check(
      "touch editing retains a scrollable timeline and bottom inspector",
      d.getElementById("timelineContent").getBoundingClientRect().width >=
        720 &&
        w.getComputedStyle(d.getElementById("contextPanel")).position ===
          "fixed",
    );
    window.TEST_RESULT = { passed: true, checks };
  } catch (error) {
    window.TEST_RESULT = { passed: false, checks, error: error.stack };
  }
  document.getElementById("result").textContent = JSON.stringify(
    window.TEST_RESULT,
    null,
    2,
  );
})();
