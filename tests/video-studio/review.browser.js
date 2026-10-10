(async () => {
  const checks = [];
  window.TEST_PROGRESS = checks;
  const check = (name, passed) => {
    checks.push({ name, passed: Boolean(passed) });
    if (!passed) throw new Error(name);
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (fn) => {
    const until = performance.now() + 20000;
    while (!fn()) {
      if (performance.now() > until)
        throw new Error("Timed out after " + checks.at(-1)?.name);
      await delay(10);
    }
  };
  const frame = document.getElementById("studio");
  let w, d, api, M;
  const bind = () => {
    w = frame.contentWindow;
    d = frame.contentDocument;
    api = w.UsefulToolVideoEditor;
    M = api.Model;
  };
  const click = (id, scope = "#studioDialog") => {
    const b = d.querySelector(scope + ' button[data-help-id="' + id + '"]');
    if (!b || b.disabled) throw new Error("Unavailable button: " + id);
    b.click();
  };
  const close = () => click("cancel");
  const json = (value) => JSON.stringify(value);
  const content = (p) => {
    const c = M.copy(p);
    delete c.updatedAt;
    return json(c);
  };
  const input = (control, value) => {
    const node = d.querySelector('[data-control="' + control + '"]');
    if (!node) throw new Error("Missing field " + control);
    node.value = value;
    node.dispatchEvent(new w.Event("input", { bubbles: true }));
    node.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const reload = async () => {
    await api.store.flush();
    frame.contentWindow.location.reload();
    await delay(100);
    await wait(
      () =>
        frame.contentWindow.UsefulToolVideoEditor?.ready &&
        frame.contentDocument.getElementById("continueProjectButton"),
    );
    bind();
    d.getElementById("continueProjectButton").click();
    await wait(() => !api.loading && api.project.assets.length > 0);
  };
  const file = async (path, name, type) =>
    new w.File([await (await fetch(path)).blob()], name, { type });
  try {
    await wait(() => frame.contentWindow.UsefulToolVideoEditor?.ready);
    bind();
    await api.importFiles(
      [
        await file(
          "fixtures/silent.mp4",
          "uat-silent-video.mp4",
          "video/mp4",
        ),
      ],
      "video",
    );
    const silent = api.project.assets[0],
      first = M.mainItems(api.project)[0];
    check(
      "video-only MP4 metadata creates no audio item, link, waveform, or audio decoder",
      silent.hasAudio === false &&
        api.project.items.length === 1 &&
        !first.linkedGroupId &&
        !silent.waveform &&
        ![...api.library.elements.values()].some((e) => e.tagName === "AUDIO"),
    );
    api.setStep("arrange");
    api.selectItem(first.id, false);
    check(
      "silent video offers no original-sound or linked-sound controls",
      !d
        .getElementById("contextPanel")
        .textContent.includes("Edit original sound") &&
        !d.querySelector('[data-control="linkAudio"]') &&
        !d
          .getElementById("timelineContent")
          .textContent.includes("Sound linked"),
    );
    api.edit((p) => {
      M.trimItem(p, first.id, "end", 0.9);
      M.setSpeed(p, first.id, 2);
      const right = M.splitItem(p, first.id, 0.2);
      M.duplicateItem(p, right.id);
    });
    check(
      "silent video still supports Trim, Speed, Cut and Duplicate",
      M.mainItems(api.project).length === 3 &&
        api.project.items.every(
          (i) => i.kind === "video" && !i.linkedGroupId,
        ) &&
        !M.audioConflicts(api.project).length,
    );
    await reload();
    check(
      "refresh recovery keeps silent video edits and zero sound items",
      api.project.items.length === 3 &&
        api.project.items.every((i) => i.kind === "video") &&
        api.project.assets[0].hasAudio === false,
    );
    const portable = M.parseProject(M.serialize(api.project));
    await api.replaceProject(portable);
    check(
      "portable save/open never regenerates silent original sound",
      api.project.items.length === 3 &&
        M.evaluateAudio(api.project, 0.1).length === 0,
    );
    await api.importFiles(
      [await file("fixtures/music.mp3", "music.mp3", "audio/mpeg")],
      "audio",
    );
    close();
    const song = api.project.assets.find((a) => a.kind === "audio");
    api.edit((p) => {
      for (let n = 0; n < 3; n++) M.addMedia(p, song.id, { start: 0 });
    });
    api.selectItem(M.mainItems(api.project)[0].id, false);
    check(
      "three real sounds plus a silent video remain within the audio limit without a false sound-edit action",
      !M.audioConflicts(api.project).length &&
        M.evaluateAudio(api.project, 0.1).length === 3 &&
        !d
          .getElementById("contextPanel")
          .textContent.includes("Edit original sound"),
    );

    await api.importFiles(
      [await file("fixtures/source.mp4", "with-sound.mp4", "video/mp4")],
      "video",
    );
    const audible = api.project.assets.find((a) => a.name === "with-sound.mp4");
    const legacy = M.createProject();
    legacy.assets = M.copy(api.project.assets);
    for (let n = 0; n < 3; n++) M.addMedia(legacy, audible.id);
    legacy.schemaVersion = 1;
    legacy.items.forEach((i) => {
      i.linkEnabled = false;
      delete i.linkId;
    });
    // The third pair has an independently edited sound and must not be offered.
    legacy.items.filter((i) => i.kind === "audio")[2].sourceIn = 0.1;
    await api.replaceProject(M.parseProject(M.serialize(legacy)));
    check(
      "schema 1 migration offers only matching picture/sound candidates and does not enable them",
      d.getElementById("dialogTitle").textContent ===
        "Repair picture and sound links" &&
        d.querySelectorAll("[data-repair-link]").length === 2 &&
        !api.project.items.some((i) => i.linkEnabled),
    );
    d.querySelector("[data-repair-link]").checked = true;
    click("linkAudio");
    const repairedId = M.mainItems(api.project)[0].id,
      unlinkedId = M.mainItems(api.project)[1].id;
    check(
      "repair enables only the selected pair and preserves intentionally unlinked pairs",
      M.related(api.project, M.item(api.project, repairedId)).length === 2 &&
        M.related(api.project, M.item(api.project, unlinkedId)).length === 1 &&
        api.project.schemaVersion === 2,
    );
    api.undo();
    check(
      "repair Undo preserves the resolved migration decision",
      !api.project.items.some((i) => i.linkEnabled) &&
        api.project.linkRepair.status === "resolved",
    );
    api.redo();
    await reload();
    check(
      "migration choice and repaired link persist without a repeated prompt",
      !d.getElementById("studioDialog").open &&
        api.project.linkRepair.status === "resolved" &&
        M.item(api.project, repairedId).linkEnabled &&
        !M.item(api.project, unlinkedId).linkEnabled,
    );
    api.edit((p) => {
      M.setSpeed(p, repairedId, 2);
      M.splitItem(p, repairedId, 0.2);
    });
    check(
      "repaired legacy pair synchronizes speed and cuts",
      M.mainItems(api.project)
        .filter((i) => i.linkEnabled)
        .every(
          (v) =>
            M.related(api.project, v).length === 2 &&
            M.related(api.project, v).every(
              (a) =>
                a.playbackRate === v.playbackRate &&
                a.sourceIn === v.sourceIn &&
                a.sourceOut === v.sourceOut &&
                a.start === v.start &&
                a.end === v.end,
            ),
        ),
    );

    const libraryOnly = M.createProject();
    libraryOnly.assets = M.copy(api.project.assets);
    await api.replaceProject(libraryOnly);
    const originalName = api.project.name;
    const name = d.getElementById("projectName");
    name.value = "Desktop review project";
    name.dispatchEvent(new w.Event("input", { bubbles: true }));
    name.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    check(
      "project name Enter immediately enables Undo",
      !d.getElementById("undoButton").disabled && api.history.canUndo,
    );
    api.undo();
    check(
      "name Undo restores the old name on screen",
      d.getElementById("projectName").value === originalName,
    );
    api.redo();
    await reload();
    check(
      "name Redo and refresh retain the committed name",
      d.getElementById("projectName").value === "Desktop review project",
    );
    click("projectMenu", "#topbar");
    click("newProject");
    check(
      "a library-only project warns before New Project and explains media relinking",
      d.getElementById("dialogTitle").textContent === "Start a new project" &&
        /does not contain media files/.test(
          d.getElementById("studioDialog").textContent,
        ) &&
        /Relink/.test(d.getElementById("studioDialog").textContent),
    );
    const beforeCancel = content(api.project);
    close();
    check(
      "New Project Cancel preserves all library-only data",
      content(api.project) === beforeCancel,
    );
    const engine = api.engine,
      library = api.library;
    const open = api.store.open.bind(api.store),
      db = await open(),
      transaction = db.transaction.bind(db);
    db.transaction = (names, mode) => {
      const tx = transaction(names, mode);
      if (
        Array.isArray(names) &&
        names.includes("files") &&
        names.includes("projects")
      )
        queueMicrotask(() => tx.abort());
      return tx;
    };
    click("projectMenu", "#topbar");
    click("newProject");
    click("newProject");
    await wait(() =>
      /Could not clear/.test(d.getElementById("studioDialog").textContent),
    );
    db.transaction = transaction;
    check(
      "failed IndexedDB clearing preserves the live engine, library and original project",
      api.engine === engine &&
        api.library === library &&
        content(api.project) === beforeCancel &&
        api.project.assets.every((a) => library.has(a.id)),
    );
    close();
    await api.store.flush();
    check(
      "failed clear retains recoverable project and media in IndexedDB",
      (await api.store.load()).assets.length === api.project.assets.length &&
        Boolean(await api.store.getFile(api.project.assets[0])),
    );

    api.addNewItem("credits");
    const creditsId = api.selectedItem.id;
    const credits = () => M.item(api.project, creditsId);
    const assertTiming = () =>
      Math.abs(
        (credits().transform.height +
          M.creditsHeight(credits()) +
          credits().credits.marginTop +
          credits().credits.marginBottom) /
          M.span(credits()) -
          credits().credits.speed,
      ) < 1e-6;
    for (const mode of ["fit", "speed"]) {
      input("creditsMode", mode);
      for (const [key, value] of [
        ["height", 510],
        ["fontSize", 42],
        ["lineSpacing", 1.8],
        ["marginTop", 90],
        ["marginBottom", 100],
        ["groupContent", "One\nTwo\nThree"],
      ]) {
        const before = json(credits());
        input(
          key,
          mode === "speed"
            ? typeof value === "number"
              ? value + 1
              : value + "\nFour"
            : value,
        );
        const after = json(credits());
        check(
          mode + " " + key + " recalculates credits timing",
          assertTiming(),
        );
        api.undo();
        check(
          mode + " " + key + " has its own Undo",
          json(credits()) === before,
        );
        api.redo();
        check(
          mode + " " + key + " has its own Redo",
          json(credits()) === after,
        );
      }
      const prior = json(credits());
      d.querySelector('[data-handle="s"] button').dispatchEvent(
        new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      check(
        mode + " keyboard resize synchronizes credits timing",
        assertTiming(),
      );
      api.undo();
      check(
        mode + " keyboard resize is a separate Undo",
        json(credits()) === prior,
      );
      api.redo();
      const beforeDrag = json(credits()),
        handle = d.querySelector('[data-handle="s"] button'),
        r = handle.getBoundingClientRect();
      const pointer = (target, type, y) =>
        target.dispatchEvent(
          new w.PointerEvent(type, {
            bubbles: true,
            pointerId: 1,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: r.x + 2,
            clientY: y,
          }),
        );
      pointer(handle, "pointerdown", r.y + 2);
      pointer(d, "pointermove", r.y + 30);
      pointer(d, "pointerup", r.y + 30);
      check(
        mode + " stage drag synchronizes credits timing",
        assertTiming() && json(credits()) !== beforeDrag,
      );
      api.undo();
      check(
        mode + " stage drag has one independent Undo",
        json(credits()) === beforeDrag,
      );
      api.redo();
    }

    api.edit((p) => {
      p.canvas = { width: 1000, height: 800, background: "#123456" };
      p.exportSettings.bitrate = 4;
    });
    const beforeDraft = M.copy(api.project),
      timeline = M.timelineCheckpoint(api.project);
    click("autoMovie", "#mediaPanel");
    click("generateMovie");
    check(
      "AutoMovie explicitly confirms replacement before analysis",
      d.getElementById("replaceTimelineButton")?.textContent ===
        "Replace current timeline",
    );
    close();
    check(
      "AutoMovie replacement Cancel changes no project objects",
      content(api.project) === content(beforeDraft),
    );
    click("autoMovie", "#mediaPanel");
    [...d.querySelectorAll('#studioDialog button[data-help-id="autoTemplate"]')]
      .find((b) => b.textContent.includes("Fast"))
      .click();
    input("targetLength", "full");
    input("backgroundMusic", song.id);
    const schedule = api.store.schedule.bind(api.store),
      scheduledCheckpoints = [];
    api.store.schedule = (p) => {
      scheduledCheckpoints.push(Boolean(p.previousTimeline));
      schedule(p);
    };
    click("generateMovie");
    click("generateMovie");
    await wait(() => !d.getElementById("studioDialog").open);
    api.store.schedule = schedule;
    const firstCheckpoint = scheduledCheckpoints.indexOf(true);
    check(
      "closing the old preview engine cannot autosave over the durable checkpoint",
      firstCheckpoint >= 0 &&
        scheduledCheckpoints.slice(firstCheckpoint).every(Boolean),
    );
    const draft = M.copy(api.project);
    check(
      "AutoMovie still creates playable video, Wipe transitions, a title and background music",
      draft.items.some((i) => i.kind === "video") &&
        draft.transitions.some((t) => t.type === "wipe") &&
        draft.items.some((i) => i.kind === "text") &&
        draft.items.some((i) => i.audio?.category === "music"),
    );
    await api.engine.play();
    await delay(150);
    api.engine.stop();
    check(
      "the generated draft plays through the existing preview engine",
      api.project.playhead > 0,
    );
    check(
      "AutoMovie retains identity, library, canvas and export settings and stores the previous timeline",
      api.project.id === beforeDraft.id &&
        api.project.name === beforeDraft.name &&
        json(api.project.assets.map(({ analysis, ...source }) => source)) ===
          json(beforeDraft.assets.map(({ analysis, ...source }) => source)) &&
        json(api.project.canvas) === json(beforeDraft.canvas) &&
        json(api.project.exportSettings) === json(beforeDraft.exportSettings) &&
        json(api.project.previousTimeline) === json(timeline),
    );
    api.undo();
    check(
      "AutoMovie has one independent Undo",
      json(M.timelineCheckpoint(api.project)) === json(timeline),
    );
    api.redo();
    check(
      "AutoMovie has one independent Redo",
      json(api.project.items) === json(draft.items),
    );
    await reload();
    check(
      "successful AutoMovie analysis is retained in the media library after refresh",
      api.project.assets
        .filter((a) => a.kind === "video")
        .every((a) => a.analysis?.cuts.length > 0),
    );
    click("projectMenu", "#topbar");
    check(
      "Restore previous timeline remains available after refresh",
      Boolean(d.getElementById("restorePreviousTimelineButton")),
    );
    d.getElementById("restorePreviousTimelineButton").click();
    await wait(() => !api.project.previousTimeline);
    check(
      "persistent checkpoint restores all old timeline objects and retains project settings",
      json(M.timelineCheckpoint(api.project)) === json(timeline) &&
        json(api.project.canvas) === json(beforeDraft.canvas) &&
        api.project.id === beforeDraft.id,
    );

    const image = {
      ...M.copy(api.project.assets[0]),
      id: "analysis-image",
      kind: "image",
      name: "still.png",
      hasAudio: false,
    };
    const analysisProject = M.copy(api.project);
    analysisProject.assets.push(image);
    delete M.asset(analysisProject, audible.id).analysis;
    let count = 0;
    const progress = [];
    const analysis = {
      analyze: async (a, cb, signal) => {
        signal?.throwIfAborted();
        count++;
        cb(0.5);
        a.analysis = { cuts: [], peaks: [] };
        cb(1);
      },
    };
    const analyzedDraft = await w.UTStudio.AutoMovie.generate(
      analysisProject,
      analysis,
      { template: "family", length: "30", assetIds: [image.id, audible.id] },
      (p) => progress.push(p.percent),
    );
    check(
      "AutoMovie analysis denominator excludes images and success reaches 100%",
      count === 1 && progress[0] === 0.5 && progress.at(-1) === 1,
    );
    check(
      "analysis leaves the original project unchanged until a draft is accepted",
      !M.asset(analysisProject, audible.id).analysis,
    );
    count = 0;
    const cachedProgress = [];
    await w.UTStudio.AutoMovie.generate(
      M.parseProject(M.serialize(analyzedDraft)),
      analysis,
      { template: "family", length: "30", assetIds: [image.id, audible.id] },
      (p) => cachedProgress.push(p.percent),
    );
    check(
      "a saved draft reuses completed analysis without seeks and still reaches 100%",
      count === 0 && cachedProgress.length === 1 && cachedProgress[0] === 1,
    );
    count = 0;
    await w.UTStudio.AutoMovie.generate(analysisProject, analysis, {
      template: "family",
      length: "full",
      assetIds: [image.id, audible.id],
    });
    check(
      "Full length skips scene analysis when it does not affect the draft",
      count === 0,
    );
    const oldCreate = d.createElement.bind(d);
    let decoder,
      seeks = 0;
    d.createElement = (tag, ...rest) => {
      const node = oldCreate(tag, ...rest);
      if (tag === "video") {
        decoder = node;
        const descriptor = Object.getOwnPropertyDescriptor(
          w.HTMLMediaElement.prototype,
          "currentTime",
        );
        Object.defineProperty(node, "currentTime", {
          get: () => descriptor.get.call(node),
          set: () => {
            seeks++; /* Hold the seek until cancellation. */
          },
        });
      }
      return node;
    };
    const controller = new w.AbortController();
    let error;
    const uncachedSource = M.copy(
      api.project.assets.find((a) => a.id === audible.id),
    );
    delete uncachedSource.analysis;
    const pending = api.library
      .analyze(uncachedSource, () => {}, controller.signal)
      .catch((e) => {
        error = e;
      });
    await wait(() => seeks > 0);
    const began = performance.now();
    controller.abort();
    await pending;
    d.createElement = oldCreate;
    check(
      "AbortController immediately rejects an active analysis seek and releases its decoder",
      error?.name === "AbortError" &&
        performance.now() - began < 250 &&
        !decoder.hasAttribute("src") &&
        seeks === 1,
    );
    await api.importFiles(
      [
        await file(
          "fixtures/source.mp4",
          "new-analysis-source.mp4",
          "video/mp4",
        ),
      ],
      "video",
    );
    const beforeAbort = content(api.project);
    const originalAnalyze = api.library.analyze.bind(api.library);
    let signal,
      calls = 0;
    api.library.analyze = async (a, cb, s) => {
      calls++;
      signal = s;
      await new Promise((resolve, reject) =>
        s.addEventListener("abort", () => reject(s.reason), { once: true }),
      );
    };
    click("autoMovie", "#mediaPanel");
    click("generateMovie");
    click("generateMovie");
    await wait(() => signal);
    close();
    await delay(30);
    api.library.analyze = originalAnalyze;
    check(
      "AutoMovie Cancel aborts remaining work without a progress callback or project mutation",
      signal.aborted &&
        calls === 1 &&
        content(api.project) === beforeAbort &&
        !d.getElementById("studioDialog").open,
    );
    api.library.analyze = async () => {
      throw new Error("Test analysis failure");
    };
    click("autoMovie", "#mediaPanel");
    click("generateMovie");
    click("generateMovie");
    await wait(
      () =>
        d.querySelector('[data-control="targetLength"]') &&
        d
          .getElementById("studioDialog")
          .textContent.includes("Test analysis failure"),
    );
    check(
      "an analysis error preserves the project and restores editable AutoMovie choices",
      content(api.project) === beforeAbort &&
        d.querySelectorAll(".media-choice input").length > 0 &&
        !d.querySelector('#studioDialog button[data-help-id="generateMovie"]')
          .disabled,
    );
    api.library.analyze = originalAnalyze;
    close();
    const flush = api.store.flush.bind(api.store),
      previousEngine = api.engine;
    api.store.flush = async () => {
      throw new Error("Test checkpoint save failure");
    };
    click("autoMovie", "#mediaPanel");
    input("targetLength", "full");
    click("generateMovie");
    click("generateMovie");
    await wait(() =>
      d
        .getElementById("studioDialog")
        .textContent.includes("Test checkpoint save failure"),
    );
    api.store.flush = flush;
    check(
      "checkpoint save failure never replaces the timeline or disposes the current engine",
      content(api.project) === beforeAbort &&
        api.engine === previousEngine &&
        d.querySelector('[data-control="targetLength"]'),
    );
    close();
    await api.store.flush();
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
