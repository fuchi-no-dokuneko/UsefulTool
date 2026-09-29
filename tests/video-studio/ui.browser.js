(async () => {
  const checks = [];
  window.TEST_PROGRESS = checks;
  let w, api, d;
  let recordingDebug;
  const check = (name, condition) => {
    checks.push({ name, passed: Boolean(condition) });
    if (!condition) throw new Error(name);
  };
  const wait = async (condition) => {
    const start = performance.now();
    while (!condition()) {
      if (performance.now() - start > 20000)
        throw new Error("Timed out waiting for the editor.");
      await new Promise((r) => setTimeout(r, 30));
    }
  };
  const click = (selector) => {
    const target = d.querySelector(selector);
    if (!target) throw new Error("Control not found: " + selector);
    if (target.disabled) throw new Error("Control disabled: " + selector);
    target.click();
  };
  const change = (selector, value) => {
    const target = d.querySelector(selector);
    if (!target) throw new Error("Field not found: " + selector);
    target.value = value;
    target.dispatchEvent(new w.Event("input", { bubbles: true }));
    target.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  try {
    const frame = document.getElementById("studio");
    await wait(() => frame.contentWindow.UsefulToolVideoEditor?.ready);
    w = frame.contentWindow;
    d = frame.contentDocument;
    api = w.UsefulToolVideoEditor;
    check(
      "four-step editor initializes with video, music and image import",
      d.querySelectorAll(".workflow-stepper button:not(.touch-help)").length ===
        4 &&
        Boolean(d.getElementById("musicFiles")) &&
        Boolean(d.getElementById("imageFiles")),
    );
    const box = (selector) => d.querySelector(selector).getBoundingClientRect();
    check(
      "desktop timeline spans beneath preview and settings without overlapping either",
      box(".topbar").height === 64 &&
        box(".workflow-stepper").height === 56 &&
        box(".media-panel").width === 248 &&
        box(".context-panel").width === 292 &&
        box(".editor-workspace").width === 823 &&
        box(".timeline-card").left === box(".preview-card").left &&
        box(".timeline-card").right === box(".context-panel").right &&
        Math.abs(box(".timeline-card").top - box(".preview-card").bottom) < 1 &&
        box(".context-panel").bottom <= box(".timeline-card").top &&
        box(".timeline-card").height >= 280,
    );
    const source = await (await fetch("fixtures/source.mp4")).blob();
    await api.importFiles(
      [1, 2, 3].map(
        (i) =>
          new w.File([source], "video-" + i + ".mp4", { type: "video/mp4" }),
      ),
      "video",
    );
    check(
      "three imported videos are contiguous and have separate original sounds",
      api.project.mainOrder.length === 3 &&
        api.project.items.filter((i) => i.kind === "audio").length === 3 &&
        api.Model.mainItems(api.project)[2].start > 2,
    );
    click("#startArrangeButton");
    check(
      "Start arranging opens the arranged timeline",
      api.project.workflow === "arrange",
    );
    const second = api.Model.mainItems(api.project)[1];
    api.selectItem(second.id, false);
    change('[data-control="endsAt"]', second.end - 0.3);
    await api.seekTo(second.start + 0.3);
    click("#splitButton");
    check(
      "trim and Cut here create matching picture and sound pieces",
      api.project.mainOrder.length === 4 &&
        api.project.items.filter((i) => i.kind === "audio").length === 4,
    );
    api.selectItem(api.Model.mainItems(api.project)[0].id, false);
    await api.seekTo(0.2);
    click("#step-effects");
    click('#contextPanel button[data-help-id="videoOverlay"]');
    click('#studioDialog button[data-help-id="groovyTriple"]');
    click('#studioDialog button[data-help-id="apply"]');
    await wait(
      () =>
        api.project.items.filter(
          (i) => i.kind === "video" && i.layerId !== "main",
        ).length === 2,
    );
    await api.seekTo(0.4);
    const overlays = api.project.items
      .filter((i) => i.kind === "video" && i.layerId !== "main")
      .sort((a, b) => a.layerId.localeCompare(b.layerId));
    check(
      "four major clicks create Groovy triple with 55 and 35 percent overlays",
      overlays[0].opacity === 0.55 &&
        overlays[1].opacity === 0.35 &&
        api.Model.evaluateFrame(api.project, 0.4).videoCount === 3,
    );
    click('#contextPanel button[data-help-id="addText"]');
    change('[data-control="textContent"]', "Summer Trip");
    check(
      "text selection and preview offer eight resize handles",
      api.selectedItem.text.content === "Summer Trip" &&
        d.querySelectorAll(".interaction-box .resize-handle").length === 8 &&
        !d.getElementById("interactionBox").hidden,
    );
    const pngCanvas = w.document.createElement("canvas");
    pngCanvas.width = 40;
    pngCanvas.height = 20;
    pngCanvas.getContext("2d").fillRect(0, 0, 20, 20);
    const png = new w.File(
      [await new Promise((resolve) => pngCanvas.toBlob(resolve))],
      "transparent.png",
      { type: "image/png" },
    );
    await api.importFiles([png], "image");
    click('#contextPanel button[data-help-id="addImage"]');
    click('#studioDialog button[data-help-id="apply"]');
    check(
      "image overlay keeps alpha and defaults to three seconds",
      api.selectedItem.kind === "image" &&
        api.Model.span(api.selectedItem) === 3 &&
        api.project.assets.find((a) => a.kind === "image").transparent,
    );
    click('#contextPanel button[data-help-id="blurArea"]');
    change('[data-control="blurAmount"][type="number"]', 8);
    check(
      "blur has an editable preview rectangle and exact time range",
      api.selectedItem.filter.type === "gaussian" &&
        api.selectedItem.filter.amount === 8 &&
        d
          .getElementById("interactionBox")
          .classList.contains("filter-selection"),
    );
    const music = await (await fetch("fixtures/music.mp3")).blob();
    await api.importFiles(
      [new w.File([music], "music.mp3", { type: "audio/mpeg" })],
      "audio",
    );
    click('#studioDialog button[data-help-id="wholeMovie"]');
    change('[data-control="speed"][type="number"]', 1.5);
    check(
      "whole-movie MP3 supports independent 1.5x playback and looping",
      api.selectedItem.kind === "audio" &&
        api.selectedItem.playbackRate === 1.5 &&
        api.selectedItem.audio.wholeMovie &&
        api.selectedItem.audio.loop,
    );
    const original = api.project.items.find(
      (i) => i.kind === "audio" && i.audio.category === "video",
    );
    api.selectItem(original.id, false);
    click('#contextPanel button[data-help-id="unlinkAudio"]');
    change('[data-control="speed"][type="number"]', 2);
    check(
      "original audio can run at 2x while its source picture stays at 1x",
      original.playbackRate === 2 &&
        api.project.items.find(
          (i) =>
            i.kind === "video" && i.linkedGroupId === original.linkedGroupId,
        ).playbackRate === 1,
    );
    check(
      "four overlapping sounds trigger the three-source limit",
      api.Model.evaluateAudio(api.project, 0.4).length === 3 &&
        api.Model.audioConflicts(api.project).length > 0,
    );
    api.edit(
      () => {
        api.project.items.find(
          (i) => i.kind === "audio" && i.linkId === overlays[1].linkId,
        ).audio.muted = true;
      },
      "Mute an overlay sound",
      { context: true },
    );
    await api.seekTo(0.4);
    const selection = api.selectedItem.id;
    const playing = api.engine.play();
    await new Promise((r) => setTimeout(r, 500));
    api.engine.stop();
    await playing;
    check(
      "play and pause preserve the current selection",
      api.selectedItem.id === selection,
    );
    check(
      "all buttons and sliders have registered explanations",
      [...d.querySelectorAll('button,input[type="range"]')].every(
        (button) =>
          button.dataset.helpId &&
          w.UTStudio.Help.HELP_CONTENT[button.dataset.helpId],
      ),
    );
    const hiddenButton = d.getElementById("redoButton");
    w.focus();
    hiddenButton.parentElement.focus();
    await new Promise((r) => setTimeout(r, 30));
    check(
      "disabled controls expose a keyboard tooltip through their wrapper",
      !d.getElementById("studio-tooltip").hidden &&
        d.getElementById("studio-tooltip").textContent.includes("Redo"),
    );
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    check(
      "Escape closes the shared tooltip",
      d.getElementById("studio-tooltip").hidden,
    );
    await api.store.flush();
    const before = api.Model.serialize(api.project);
    await api.replaceProject(api.Model.parseProject(before));
    check(
      "opening a project recovers objects and cached media",
      api.project.items.length === JSON.parse(before).items.length &&
        api.project.assets.every((a) => api.library.has(a.id)),
    );
    click("#step-export");
    change('[data-control="quality"]', "standard");
    check(
      "Standard export selects 1920 by 1080 and six Mbps",
      api.Model.exportDimensions(api.project).width === 1920 &&
        api.project.exportSettings.bitrate === 6,
    );
    // Keep the real recording short while retaining all three videos, text, image, blur and independent audio.
    const result = await api.engine.recordRange(0.3, 0.9);
    recordingDebug = result
      ? {
          size: result.blob.size,
          width: result.width,
          height: result.height,
          type: result.mimeType,
        }
      : { result: null };
    check(
      "real 1080p export produces a video file with mixed audio",
      result?.blob.size > 1000 &&
        result.width === 1920 &&
        result.height === 1080 &&
        result.mimeType.startsWith("video/"),
    );
    const video = w.document.createElement("video");
    video.src = URL.createObjectURL(result.blob);
    video.muted = true;
    await w.UTStudio.Media.waitMedia(video);
    check(
      "the exported file decodes with finite duration and correct dimensions",
      Number.isFinite(video.duration) &&
        video.videoWidth === 1920 &&
        Math.abs(video.duration - 0.6) < 0.3,
    );
    URL.revokeObjectURL(video.src);
    const pcm = await new w.OfflineAudioContext(2, 1, 48000).decodeAudioData(
      await result.blob.arrayBuffer(),
    );
    const peak = pcm
      .getChannelData(0)
      .reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0);
    check(
      "the exported file contains audible stereo PCM from the shared mix",
      pcm.numberOfChannels === 2 && peak > 0.005,
    );
    await api.store.flush();
    const saved = JSON.parse(api.Model.serialize(api.project)),
      oldApi = api;
    const loaded = new Promise((resolve) =>
      frame.addEventListener("load", resolve, { once: true }),
    );
    w.location.reload();
    await loaded;
    await wait(
      () =>
        frame.contentWindow.UsefulToolVideoEditor?.ready &&
        frame.contentWindow.UsefulToolVideoEditor !== oldApi,
    );
    w = frame.contentWindow;
    d = frame.contentDocument;
    api = w.UsefulToolVideoEditor;
    check(
      "a real page refresh offers Continue last project",
      Boolean(d.getElementById("continueProjectButton")),
    );
    click("#continueProjectButton");
    await wait(
      () =>
        !api.loading &&
        api.project.items.length === saved.items.length &&
        api.project.assets.every((a) => api.library.has(a.id)) &&
        !d.getElementById("studioDialog").open,
    );
    check(
      "refresh recovery preserves exact objects layers curves and export settings",
      JSON.stringify(api.project.items) === JSON.stringify(saved.items) &&
        JSON.stringify(api.project.layers) === JSON.stringify(saved.layers) &&
        JSON.stringify(api.project.exportSettings) ===
          JSON.stringify(saved.exportSettings),
    );
    click("#step-export");
    click("#exportButton");
    await wait(() => api.exporting);
    check(
      "export view shows progress and cancellation while recording",
      Boolean(d.getElementById("exportProgress")) &&
        Boolean(d.getElementById("cancelButton")),
    );
    await wait(() => !api.exporting && api.results.length > 0);
    check(
      "the full Export video flow produces preview and Download video",
      Boolean(d.getElementById("downloadButton")) &&
        !d.getElementById("outputVideo").hidden &&
        api.results[0].blob.size > 1000,
    );
    window.TEST_RESULT = { passed: true, checks };
  } catch (error) {
    window.TEST_RESULT = {
      passed: false,
      checks,
      recordingDebug,
      error: error.stack,
      uiError: d?.getElementById("contextError")?.textContent,
      focusDebug: {
        button: d?.getElementById("redoButton")?.parentElement.outerHTML,
        active: d?.activeElement?.outerHTML?.slice(0, 400),
        hasFocus: d?.hasFocus(),
        dialog: d?.getElementById("studioDialog")?.open,
      },
    };
  }
  document.getElementById("result").textContent = JSON.stringify(
    window.TEST_RESULT,
    null,
    2,
  );
})();
