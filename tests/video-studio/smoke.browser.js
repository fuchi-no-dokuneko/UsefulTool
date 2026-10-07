// Shared-site smoke uses the current studio API; detailed editing checks live
// beside this file and are run by the video-specific browser acceptance job.
window.runVideoStudioSmoke = async function (frame, check, waitUntil) {
  const w = frame.contentWindow,
    d = frame.contentDocument;
  await waitUntil(
    () => w.UsefulToolVideoEditor?.ready,
    "Video Studio initialization",
  );
  const api = w.UsefulToolVideoEditor,
    M = api.Model;
  check(
    "video studio has the four-step workspace",
    d.querySelectorAll(".workflow-stepper button:not(.touch-help)").length ===
      4 &&
      d.querySelector(".context-panel") &&
      d.querySelector("#timelineContent"),
  );
  check(
    "video studio has one page-level heading",
    d.querySelectorAll("h1").length === 1 &&
      d.querySelector("h1").textContent.trim() === "Video Studio",
  );
  const source = await (await fetch("video-studio/fixtures/source.mp4")).blob();
  await api.importFiles(
    [1, 2, 3].map(
      (i) => new w.File([source], "smoke-" + i + ".mp4", { type: "video/mp4" }),
    ),
    "video",
  );
  check(
    "video studio imports three sequential pictures and independent sounds",
    api.project.mainOrder.length === 3 &&
      api.project.items.filter((i) => i.kind === "audio").length === 3,
  );
  api.setStep("arrange");
  await window.checkDesktopSound(frame, api, check);
  const second = M.mainItems(api.project)[1];
  api.selectItem(second.id, false);
  await api.seekTo(second.start + 0.3);
  d.getElementById("splitButton").click();
  check(
    "video studio splits at the playhead and supports Undo",
    api.project.mainOrder.length === 4 && api.history.canUndo,
  );
  api.undo();
  await api.seekTo(0.2);
  api.edit(() => {
    const sourceId = api.project.assets[0].id;
    const a = M.addMedia(api.project, sourceId, {
      layerId: "overlay-1",
      start: 0,
    });
    const b = M.addMedia(api.project, sourceId, {
      layerId: "overlay-2",
      start: 0,
    });
    M.applyOverlayPreset(
      api.project,
      [M.mainItems(api.project)[0].id, a.id, b.id],
      "groovy",
    );
  });
  api.addNewItem("text");
  api.selectedItem.text.content = "Smoke movie";
  M.trimItem(api.project, api.selectedItem.id, "end", 1.2);
  api.addNewItem("filter", { duration: 1.2 });
  await api.seekTo(0.5);
  check(
    "video studio shares three-video composition with text and local blur",
    M.evaluateFrame(api.project, 0.5).videoCount === 3 &&
      d.querySelector("#interactionBox.filter-selection") &&
      !d.getElementById("interactionBox").hidden,
  );
  const json = M.serialize(api.project);
  check(
    "video studio restores exact layered project objects",
    JSON.stringify(M.parseProject(json).items) ===
      JSON.stringify(api.project.items),
  );
  await api.store.flush();
  check(
    "video studio caches source media for refresh",
    (await api.store.getFile(api.project.assets[0])).size === source.size,
  );
  api.project.exportSettings.quality = "high";
  api.project.exportSettings.bitrate = 0.5;
  const result = await api.engine.recordRange(0.2, 0.8);
  check(
    "video studio exports actual local video with stereo audio",
    result?.blob.size > 1000 && result.width === 160 && result.height === 90,
  );
  check(
    "video studio retains interval exports and registered accessible controls",
    M.segmentRanges(1.2, 0.6).length === 2 &&
      [...d.querySelectorAll("button")].every(
        (b) => b.dataset.helpId && b.getAttribute("aria-label"),
      ),
  );
  const audio = api.project.items.find((item) => item.audio);
  api.selectItem(audio.id, false);
  const beforePaste = api.project.items.length;
  d.getElementById("copySegmentButton").click();
  await api.seekTo(0.5);
  d.getElementById("pasteSegmentButton").click();
  check(
    "video studio Copy/Paste places only the selected sound at the playhead",
    api.project.items.length === beforePaste + 1 &&
      api.selectedItem.kind === "audio" &&
      api.selectedItem.start === 0.5 &&
      api.selectedItem.assetId === audio.assetId,
  );
  d.getElementById("projectMenuButton").click();
  d.querySelector('dialog button[data-help-id="undo"]').click();
  check(
    "project-menu Undo reverses sound paste",
    api.project.items.length === beforePaste,
  );
  d.getElementById("projectMenuButton").click();
  d.querySelector('dialog button[data-help-id="redo"]').click();
  check(
    "project-menu Redo restores sound paste",
    api.project.items.length === beforePaste + 1,
  );
  api.undo();
  api.selectItem(audio.id, false);
  d.getElementById("decoupleChannelsButton").click();
  const ears = api.project.items.filter((item) => item.audio?.sourceChannel);
  check(
    "Decouple L/R retains independent left and right source channels",
    ears.length === 2 &&
      ears
        .map((item) => item.audio.sourceChannel)
        .sort()
        .join(",") === "left,right" &&
      ears
        .map((item) => item.audio.channelMode)
        .sort()
        .join(",") === "leftOnly,rightOnly",
  );
  api.undo();
  check(
    "Undo restores the original stereo segment",
    !api.project.items.some((item) => item.audio?.sourceChannel),
  );
  const wasMuted = api.mixer.muted;
  d.getElementById("muteButton").click();
  check("preview mute changes monitor output", api.mixer.muted !== wasMuted);
  d.getElementById("muteButton").click();
  check("preview unmute restores monitor output", api.mixer.muted === wasMuted);
  const main = M.layer(api.project, "main"),
    beforeItems = JSON.stringify(api.project.items);
  d.querySelector('.track-toggle[data-help-id="toggleTrack"]').click();
  check(
    "track disable hides the picture without deleting segments",
    !main.visible && JSON.stringify(api.project.items) === beforeItems,
  );
  d.querySelector('.track-toggle[data-help-id="toggleTrack"]').click();
  check("track enable restores the picture", main.visible);
  const expand = () => d.querySelector('button[data-help-id="expandSound"]');
  const firstLabel = expand().textContent;
  expand().click();
  check(
    "sound tracks can collapse and expand",
    expand().textContent !== firstLabel,
  );
  expand().click();
  for (const label of ["Music", "Images", "Videos"]) {
    [...d.querySelectorAll('button[data-help-id="mediaTab"]')]
      .find((button) => button.textContent === label)
      .click();
    check(
      "media library opens its " + label + " tab",
      d.querySelector(".media-tabs .is-active").textContent === label,
    );
  }
  await api.engine.dispose();
};

window.runVideoStudioSuites = async function (check, waitUntil) {
  for (const page of [
    "core",
    "render",
    "ui",
    "advanced",
    "controls",
    "gestures",
    "regressions",
    "review",
    "tools",
  ]) {
    sessionStorage.removeItem("utvstudio-session");
    const frame = document.createElement("iframe");
    frame.title = "Video Studio " + page + " acceptance";
    frame.style.cssText =
      "position:fixed;inset:0;width:1363px;height:1100px;border:0;z-index:99999;background:white";
    frame.src = "video-studio/" + page + ".html";
    document.body.append(frame);
    try {
      await waitUntil(
        () => frame.contentWindow.TEST_RESULT,
        "Video Studio " + page + " suite",
        60000,
      );
      const result = frame.contentWindow.TEST_RESULT;
      for (const item of result.checks)
        check("video " + page + ": " + item.name, item.passed);
      if (!result.passed) throw new Error(result.error);
    } finally {
      frame.remove();
    }
  }
};
