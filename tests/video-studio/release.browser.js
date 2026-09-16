(async () => {
  const checks = [],
    metrics = {};
  const check = (name, passed, detail) => {
    checks.push({ name, passed: Boolean(passed), detail });
  };
  const wait = async (predicate, timeout = 30000) => {
    const deadline = performance.now() + timeout;
    while (!predicate()) {
      if (performance.now() > deadline)
        throw new Error(
          "Release UAT timed out: " + window.TEST_PROGRESS.current,
        );
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  let requestId = 0;
  async function clickActual(selector) {
    const id = ++requestId;
    window.UAT_REQUEST = { id, selector };
    await wait(() => window.UAT_RESPONSE?.id === id);
    if (window.UAT_RESPONSE.error) throw new Error(window.UAT_RESPONSE.error);
  }
  window.TEST_PROGRESS = { checks, current: "Importing batch" };
  try {
    const frame = document.getElementById("studio");
    await wait(() => frame.contentWindow.UsefulToolVideoEditor?.ready);
    let w = frame.contentWindow,
      d = frame.contentDocument,
      api = w.UsefulToolVideoEditor,
      M = api.Model;
    const read = async (name, type) =>
      new w.File(
        [
          await (
            await fetch(
              "../../build/reports/video-studio/release-fixtures/" + name,
            )
          ).blob(),
        ],
        name,
        { type },
      );
    const batch = await Promise.all(
      ["x", "y", "z"].map((letter) =>
        read("uat-" + letter + ".mp4", "video/mp4"),
      ),
    );
    await api.importFiles(batch, "video");
    const initial = M.copy(api.project);
    const paired = (project, value) =>
      project.items.find(
        (i) => i.kind === "audio" && i.linkId === value.linkId,
      );
    const synced = (a, b) =>
      a &&
      b &&
      a.linkEnabled &&
      b.linkEnabled &&
      a.linkId === b.linkId &&
      [
        "start",
        "end",
        "sourceIn",
        "sourceOut",
        "playbackRate",
        "sourceId",
      ].every((key) => a[key] === b[key]);
    check(
      "batch import initializes three contiguous linked picture/sound pairs",
      M.mainItems(api.project).length === 3 &&
        M.mainItems(api.project).every(
          (value, index) =>
            value.start === index * 4 &&
            synced(value, paired(api.project, value)),
        ),
    );
    const reset = async () => {
      await api.replaceProject(M.copy(initial));
      api.setStep("arrange");
      api.selectItem(M.mainItems(api.project)[0].id, false);
    };
    const number = (helpId, value, commit = true) => {
      const input = d.querySelector(
        '#contextPanel input[type="number"][data-control="' + helpId + '"]',
      );
      if (!input) throw new Error("Missing field " + helpId);
      input.value = value;
      input.dispatchEvent(new w.Event("input", { bubbles: true }));
      if (commit) input.dispatchEvent(new w.Event("change", { bubbles: true }));
      return input;
    };
    await reset();
    await api.seekTo(1);
    d.getElementById("splitButton").click();
    check(
      "Cut splits linked picture and original sound at the same source timestamp",
      M.mainItems(api.project).length === 4 &&
        api.project.items.filter((i) => i.kind === "audio").length === 4 &&
        M.mainItems(api.project).every((v) =>
          synced(v, paired(api.project, v)),
        ),
    );
    await reset();
    number("speed", 2);
    check(
      "Speed 2x shortens both linked streams and ripples later pairs",
      api.selectedItem.end === 2 &&
        M.mainItems(api.project).every((v) =>
          synced(v, paired(api.project, v)),
        ),
    );
    await reset();
    number("endsAt", 2);
    check(
      "Trim updates linked start end and source bounds",
      api.selectedItem.end === 2 &&
        synced(api.selectedItem, paired(api.project, api.selectedItem)),
    );
    d.querySelector(
      '#contextPanel button[data-help-id="duplicateItem"]',
    ).click();
    check(
      "Duplicate creates a new linked group with matching source mapping",
      M.mainItems(api.project).length === 4 &&
        M.mainItems(api.project).every((v) =>
          synced(v, paired(api.project, v)),
        ) &&
        new Set(M.mainItems(api.project).map((v) => v.linkId)).size === 4,
    );

    await reset();
    number("endsAt", 2, false);
    d.querySelector(
      '#contextPanel button[data-help-id="duplicateItem"]',
    ).click();
    api.undo();
    check(
      "Undo Duplicate retains the preceding unblurred Ends at edit",
      M.mainItems(api.project).length === 3 &&
        M.mainItems(api.project)[0].end === 2,
    );
    api.undo();
    check(
      "a second Undo reverses Trim alone",
      M.mainItems(api.project)[0].end === 4,
    );
    api.redo();
    check(
      "Redo restores Trim independently",
      M.mainItems(api.project).length === 3 &&
        M.mainItems(api.project)[0].end === 2,
    );
    api.redo();
    check(
      "a second Redo restores Duplicate alone",
      M.mainItems(api.project).length === 4 &&
        M.mainItems(api.project)[0].end === 2,
    );
    for (const event of ["blur", "enter", "change"]) {
      await reset();
      const before = api.history.index,
        input = number("endsAt", 2, false);
      input.dispatchEvent(
        event === "enter"
          ? new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })
          : new w.Event(event, { bubbles: true }),
      );
      check(
        event + " commits the numeric edit into its own history snapshot",
        api.history.index === before + 1,
      );
    }
    await reset();
    number("endsAt", 2, false);
    const handle = d.querySelector(
      '.timeline-item[data-item-id="' +
        api.selectedItem.id +
        '"] .trim-handle.end button',
    );
    const rect = handle.getBoundingClientRect(),
      x = rect.left + rect.width / 2,
      y = rect.top + rect.height / 2;
    for (const [target, type, at] of [
      [handle, "pointerdown", x],
      [d, "pointermove", x - 35],
      [d, "pointerup", x - 35],
    ])
      target.dispatchEvent(
        new w.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 19,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: at,
          clientY: y,
        }),
      );
    const draggedEnd = M.mainItems(api.project)[0].end;
    api.undo();
    check(
      "pointer trim is a separate Undo after an unblurred numeric edit",
      draggedEnd < 2 && M.mainItems(api.project)[0].end === 2,
    );
    api.undo();
    check(
      "Undo of the preceding numeric edit restores its original linked duration",
      M.mainItems(api.project)[0].end === 4 &&
        synced(
          M.mainItems(api.project)[0],
          paired(api.project, M.mainItems(api.project)[0]),
        ),
    );
    await reset();
    const picture = api.selectedItem;
    d.querySelector('#contextPanel input[data-control="linkAudio"]').click();
    const sound = paired(api.project, picture);
    api.selectItem(sound.id, false);
    number("speed", 2);
    check(
      "explicit unlink still permits independent sound speed",
      sound.playbackRate === 2 && picture.playbackRate === 1,
    );

    window.TEST_PROGRESS.current = "Importing thirteen formats";
    await reset();
    await api.importFiles(
      [await read("timecode-90s.mp4", "video/mp4")],
      "video",
    );
    for (const duration of [7, 5, 4]) {
      await api.importFiles(
        [await read("music-" + duration + "s.mp3", "audio/mpeg")],
        "audio",
      );
      d.getElementById("studioDialog").close();
    }
    const types = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      bmp: "image/bmp",
      gif: "image/gif",
      webp: "image/webp",
      png: "image/png",
    };
    await api.importFiles(
      await Promise.all(
        Object.entries(types).map(([extension, type]) =>
          read(
            extension === "png" ? "transparent.png" : "picture." + extension,
            type,
          ),
        ),
      ),
      "image",
    );
    check(
      "all thirteen video music and image files decode and stay in the library",
      api.project.assets.length === 13 &&
        api.project.assets.every((a) => api.library.has(a.id)),
    );
    const libraryProject = M.copy(api.project),
      project = M.createProject();
    project.name = "Video Studio Release UAT";
    project.assets = M.copy(libraryProject.assets);
    const asset = (name) => project.assets.find((a) => a.name === name);
    for (const name of [
      "uat-x.mp4",
      "uat-y.mp4",
      "uat-z.mp4",
      "timecode-90s.mp4",
    ])
      M.addMedia(project, asset(name).id);
    M.setTransition(project, M.mainItems(project)[1].id, {
      type: "crossfade",
      duration: 0.5,
    });
    M.addMedia(project, asset("picture.jpg").id, { duration: 1.7 });
    M.addMedia(project, asset("picture.webp").id, { duration: 1.8 });
    const overlays = [
      M.addMedia(project, asset("timecode-90s.mp4").id, {
        layerId: "overlay-1",
        start: 18,
        duration: 34,
      }),
      M.addMedia(project, asset("uat-y.mp4").id, {
        layerId: "overlay-2",
        start: 28,
        duration: 4,
      }),
    ];
    M.applyOverlayPreset(
      project,
      [M.mainItems(project)[3].id, ...overlays.map((v) => v.id)],
      "groovy",
    );
    const title = M.addLayerItem(project, "text", { start: 14, duration: 64 });
    title.text.content = "Summer Trip · Release UAT";
    const png = M.addLayerItem(project, "image", {
      assetId: asset("transparent.png").id,
      start: 22,
      duration: 15,
    });
    Object.assign(png.transform, { x: 800, y: 80, width: 320, height: 180 });
    const blur = M.addLayerItem(project, "filter", { start: 16, duration: 67 });
    Object.assign(blur.transform, { x: 500, y: 250, width: 300, height: 180 });
    blur.filter.amount = 12;
    const credits = M.addLayerItem(project, "credits", {
      start: 100,
      duration: 5,
    });
    credits.credits.background = "transparent";
    M.addEffect(M.mainItems(project)[3], "contrast");
    const song = M.addMedia(project, asset("music-7s.mp3").id, { start: 0 });
    M.setSpeed(project, song.id, 1.5);
    M.setRepeat(project, song.id, true, true);
    song.audio.volume = 0.5;
    M.normalize(project);
    await api.replaceProject(project);
    api.setStep("arrange");
    check(
      "four-source overlap is detected by the shared audio rule",
      M.audioConflicts(api.project).some((c) => c.items.length === 4) &&
        M.evaluateAudio(api.project, 29).length === 3,
    );
    check(
      "audio limit displays an explanation and two correction actions",
      !d.getElementById("audioConflictCard").hidden &&
        d.querySelector('button[data-help-id="audioLimit"]') &&
        d.querySelector('button[data-help-id="fixAudioLimit"]'),
    );
    let playRejected = false,
      exportRejected = false;
    try {
      await api.engine.play();
    } catch (e) {
      playRejected = /three sounds/i.test(e.message);
    }
    try {
      await api.engine.recordRange(0, 0.1);
    } catch (e) {
      exportRejected = /three sounds/i.test(e.message);
    }
    check(
      "preview and export both refuse unresolved four-source audio",
      playRejected && exportRejected,
    );
    await clickActual('button[data-help-id="audioLimit"]');
    check(
      "audio correction dialog identifies every overlapping source",
      d.querySelectorAll('#studioDialog input[data-control="muteItem"]')
        .length === 4,
    );
    d.getElementById("studioDialog").close();
    await clickActual('button[data-help-id="fixAudioLimit"]');
    check(
      "Mute extra sounds resolves the conflict without deleting clips",
      M.audioConflicts(api.project).length === 0 &&
        api.project.items.length === project.items.length,
    );
    api.undo();
    check(
      "audio correction is independently undoable",
      M.audioConflicts(api.project).some((c) => c.items.length === 4),
    );
    // Keep music and the main original sound; mute the two optional overlay sounds.
    api.edit(
      () => {
        for (const overlay of overlays)
          paired(api.project, M.item(api.project, overlay.id)).audio.muted =
            true;
      },
      "Overlay sounds muted",
      { context: true },
    );
    check(
      "muting overlapping sounds restores an admissible mix",
      M.audioConflicts(api.project).length === 0 &&
        d.getElementById("audioConflictCard").hidden,
    );

    window.TEST_PROGRESS.current = "Checking timeline hit targets";
    // Undo restores the preview asynchronously and then rebuilds the timeline.
    // Await that seek before retaining the actual buttons for geometry checks.
    await api.seekTo(api.project.playhead);
    const viewport = d.getElementById("timelineViewport"),
      settings = d.querySelector(
        'button[aria-label="Settings for Main video"]',
      ),
      transition = d.querySelector(".transition-button");
    if (!viewport || !settings || !transition)
      throw new Error("Missing timeline geometry controls");
    const settingsBox = settings.getBoundingClientRect(),
      transitionBox = transition.getBoundingClientRect();
    viewport.scrollLeft +=
      transitionBox.left +
      transitionBox.width / 2 -
      settingsBox.left -
      settingsBox.width / 2;
    viewport.scrollTop = 15;
    await new Promise((r) => w.requestAnimationFrame(r));
    const box = settings.getBoundingClientRect(),
      hit = d.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
    check(
      "scrolled transition buttons cannot cover the fixed Main video settings",
      hit?.closest("button") === settings,
      { hit: hit?.outerHTML?.slice(0, 200) },
    );
    await clickActual('button[aria-label="Settings for Main video"]');
    check(
      "actual Main video settings click opens layer controls",
      Boolean(
        d.querySelector('#studioDialog input[data-control="renameLayer"]'),
      ),
    );
    d.getElementById("studioDialog").close();
    const viewportBox = viewport.getBoundingClientRect();
    const outside = d.elementFromPoint(
      viewportBox.left + viewportBox.width / 2,
      viewportBox.top - 5,
    );
    check(
      "timeline children do not intercept points above the viewport",
      !outside?.closest(".timeline-content"),
    );
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;

    window.TEST_PROGRESS.current = "Seeking long source then clicking Play";
    const play = d.getElementById("playButton"),
      originalFrame = api.engine.onFrame;
    let clickAt, firstFrame;
    play.addEventListener(
      "pointerdown",
      () => {
        clickAt = performance.now();
      },
      { once: true },
    );
    api.engine.onFrame = (...args) => {
      if (clickAt && args[0] > 70 && firstFrame === undefined)
        firstFrame = performance.now();
      originalFrame(...args);
    };
    const seek = api.seekTo(70);
    check(
      "Seek exposes loading state without disabling or replacing Play",
      api.engine.seeking &&
        /Loading frame/.test(d.getElementById("previewStatus").textContent) &&
        d.getElementById("playButton") === play &&
        !play.disabled,
    );
    await clickActual("#playButton");
    await wait(() => firstFrame !== undefined, 5000);
    metrics.seekPlayMs = firstFrame - clickAt;
    check(
      "actual Play after a long-source seek starts within 300ms",
      metrics.seekPlayMs < 300,
      metrics.seekPlayMs,
    );
    let pauseAt, pausedAt;
    play.addEventListener(
      "pointerdown",
      () => {
        pauseAt = performance.now();
      },
      { once: true },
    );
    const oldState = api.engine.onState;
    api.engine.onState = (...args) => {
      if (pauseAt && args[0] === "paused") pausedAt = performance.now();
      oldState(...args);
    };
    await clickActual("#playButton");
    await seek;
    metrics.pauseMs = pausedAt - pauseAt;
    check(
      "actual Pause remains below 100ms and transport time agrees",
      metrics.pauseMs < 100 &&
        !api.engine.playing &&
        d.getElementById("timeLabel").textContent ===
          M.formatTime(api.project.playhead, 30),
      metrics.pauseMs,
    );
    api.engine.onFrame = originalFrame;
    api.engine.onState = oldState;

    window.TEST_PROGRESS.current = "Saving and restoring all thirteen assets";
    const serialized = M.serialize(api.project),
      parsed = M.parseProject(serialized);
    const sameEdit = (a, b) =>
      [
        "assets",
        "items",
        "layers",
        "transitions",
        "mainOrder",
        "exportSettings",
        "soundBalance",
        "duration",
      ].every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
    check(
      "project save/open retains linkId and every item layer effect and parameter",
      sameEdit(api.project, parsed),
    );
    await api.store.flush();
    const snapshot = M.copy(api.project);
    frame.src = "../../video-editor.html?release-recovery";
    await wait(
      () =>
        frame.contentDocument !== d &&
        frame.contentWindow.UsefulToolVideoEditor?.ready,
    );
    w = frame.contentWindow;
    d = frame.contentDocument;
    api = w.UsefulToolVideoEditor;
    M = api.Model;
    await clickActual("#continueProjectButton");
    await wait(() => !api.loading && api.project.assets.length === 13);
    check(
      "refresh recovery restores all thirteen files and the complete project",
      sameEdit(snapshot, api.project) &&
        api.project.assets.every((a) => api.library.has(a.id)),
    );
    check(
      "recovered pairs retain shared timing speed source range and linkId",
      api.project.items
        .filter((i) => i.kind === "video" && i.linkEnabled)
        .every((v) => synced(v, paired(api.project, v))),
    );
    check(
      "release project has the required 105-second mixed composition",
      Math.abs(api.project.duration - 105) < 1e-6 &&
        api.project.items.some((i) => i.kind === "text") &&
        api.project.items.some((i) => i.kind === "filter") &&
        api.project.items.some((i) => i.kind === "credits"),
    );
    const groovy = [
      M.mainItems(api.project)[3],
      ...overlays.map((v) => M.item(api.project, v.id)),
    ];
    check(
      "Groovy retains fixed opacity position and hue values",
      groovy.every(
        (v, i) =>
          v.opacity === [1, 0.55, 0.35][i] &&
          v.transform.x === [-14, 0, 14][i] &&
          v.effects.find((f) => f.type === "hue")?.amount === [-20, 0, 20][i],
      ),
    );
    // Fail before the expensive export when a behavioral release requirement fails.
    if (checks.some((c) => !c.passed))
      throw new Error("A behavioral release gate failed.");
    api.project.exportSettings.quality = "standard";
    api.project.exportSettings.fps = 30;
    api.project.exportSettings.bitrate = 6;
    api.project.exportSettings.format = "video/webm;codecs=vp9,opus";
    api.setStep("export");
    window.TEST_PROGRESS.current = "Exporting Standard 1080p, 3,150 frames";
    const references = [],
      referenceFrames = new Set([0, 113, 600, 870, 1650, 2550, 3060, 3120]);
    const originalRender = w.UTStudio.Renderer.prototype.render;
    w.UTStudio.Renderer.prototype.render = function (project, time, canvas) {
      const plan = originalRender.call(this, project, time, canvas),
        frame = Math.round(time * 30);
      if (canvas.width === 1920 && referenceFrames.has(frame)) {
        referenceFrames.delete(frame);
        const image = d.createElement("canvas");
        image.width = 256;
        image.height = 144;
        image.getContext("2d").drawImage(canvas, 0, 0, 256, 144);
        references.push({ frame, time, png: image.toDataURL("image/png") });
      }
      return plan;
    };
    const began = performance.now(),
      exportPromise = api.exportMovie(false);
    await wait(() => api.exporting);
    const progressTimer = setInterval(() => {
      window.TEST_PROGRESS.current =
        d.getElementById("exportPercent")?.textContent +
        " · " +
        d.getElementById("exportProcessed")?.textContent;
    }, 500);
    await exportPromise;
    clearInterval(progressTimer);
    w.UTStudio.Renderer.prototype.render = originalRender;
    const output = api.results[0];
    if (!output)
      throw new Error(
        d.getElementById("contextError")?.textContent || "No export output",
      );
    metrics.exportSeconds = (performance.now() - began) / 1000;
    check(
      "Standard export encodes all 3,150 frames and exact stereo sample count",
      output.frameCount === 3150 &&
        output.audioSamples === 5040000 &&
        output.width === 1920 &&
        output.height === 1080,
      {
        frames: output.frameCount,
        samples: output.audioSamples,
        bytes: output.blob.size,
      },
    );
    const saved = await fetch("/__video-studio-test__/release-standard.webm", {
      method: "POST",
      body: output.blob,
    });
    if (!saved.ok)
      throw new Error("Could not retain the completed export file");
    await wait(() => d.getElementById("outputVideo").readyState >= 2);
    await clickActual("#downloadButton");
    check(
      "completed export offers a downloadable file and playable preview",
      !d.getElementById("downloadButton").disabled &&
        !d.getElementById("outputVideo").hidden,
    );
    window.TEST_RESULT = {
      passed: checks.every((c) => c.passed),
      checks,
      metrics,
      references,
      downloadName: output.name,
      artifact: "release-standard.webm",
      project: M.serialize(api.project),
    };
  } catch (error) {
    window.TEST_RESULT = { passed: false, checks, metrics, error: error.stack };
  }
  document.getElementById("result").textContent = JSON.stringify(
    { ...window.TEST_RESULT, project: undefined },
    null,
    2,
  );
})();
