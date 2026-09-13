(async () => {
  const checks = [];
  window.TEST_PROGRESS = checks;
  const check = (name, ok) => {
    checks.push({ name, passed: !!ok });
    if (!ok) throw new Error(name);
  };
  const wait = async (fn) => {
    const start = performance.now();
    while (!fn()) {
      if (performance.now() - start > 15000)
        throw new Error("Offline operation timed out");
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  try {
    const frame = document.getElementById("studio");
    await wait(() => frame.contentWindow.UsefulToolVideoEditor?.ready);
    const w = frame.contentWindow,
      d = frame.contentDocument,
      api = w.UsefulToolVideoEditor,
      M = api.Model;
    check(
      "offline HTML embeds every script and stylesheet",
      !d.querySelector('script[src],link[rel="stylesheet"]') &&
        d.querySelectorAll("script[data-inlined-from]").length === 10,
    );
    const file = new w.File(
      [await (await fetch("fixtures/source.mp4")).blob()],
      "offline.mp4",
      { type: "video/mp4" },
    );
    await api.importFiles([file], "video");
    check(
      "offline import makes a video with independent original audio",
      api.project.items.length === 2 &&
        api.project.assets[0].waveform.some((n) => n > 0),
    );
    api.addNewItem("text");
    api.selectedItem.text.content = "Offline movie";
    M.trimItem(api.project, api.selectedItem.id, "end", 1.2);
    api.addNewItem("filter", { duration: 1.2 });
    api.selectedItem.filter.amount = 3;
    api.project.exportSettings.quality = "high";
    api.project.exportSettings.bitrate = 0.5;
    await api.seekTo(0.2);
    await api.store.flush();
    check(
      "offline editing saves media and the full layered model",
      M.parseProject(M.serialize(api.project)).items.length === 4 &&
        (await api.store.getFile(api.project.assets[0])).size === file.size,
    );
    api.setStep("export");
    const results = await api.exportMovie(false);
    check(
      "offline shared compositor exports real video and sound",
      results.length === 1 &&
        results[0].blob.size > 1000 &&
        results[0].width === 160 &&
        d.getElementById("downloadButton"),
    );
    await wait(() => d.getElementById("outputVideo").videoWidth > 0);
    check(
      "offline output has readable local duration",
      Math.abs(d.getElementById("outputVideo").duration - 1.2) < 0.1,
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
