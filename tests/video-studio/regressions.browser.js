(async () => {
  const checks = [];
  window.TEST_PROGRESS = checks;
  const check = (name, passed) => {
    checks.push({ name, passed: Boolean(passed) });
    if (!passed) throw new Error(name);
  };
  const wait = async (predicate) => {
    const deadline = performance.now() + 20000;
    while (!predicate()) {
      if (performance.now() > deadline)
        throw new Error("Regression check timed out");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  try {
    const frame = document.getElementById("studio");
    await wait(() => frame.contentWindow.UsefulToolVideoEditor?.ready);
    const w = frame.contentWindow,
      d = frame.contentDocument,
      api = w.UsefulToolVideoEditor,
      M = api.Model;
    const click = (id, scope = "#contextPanel") => {
      const button = d.querySelector(
        scope + ' button[data-help-id="' + id + '"]',
      );
      if (!button || button.disabled)
        throw new Error("Unavailable control: " + id);
      button.click();
    };
    const blob = await (await fetch("fixtures/source.mp4")).blob();
    await api.importFiles(
      [1, 2, 3].map(
        (i) => new w.File([blob], "batch-" + i + ".mp4", { type: "video/mp4" }),
      ),
      "video",
    );
    const initial = M.copy(api.project);
    check(
      "direct batch import links every original sound by source and linkId",
      M.mainItems(api.project).every((v) =>
        api.project.items.some(
          (a) =>
            a.kind === "audio" &&
            a.linkEnabled &&
            v.linkEnabled &&
            a.linkId === v.linkId &&
            a.sourceId === v.sourceId,
        ),
      ),
    );
    const reset = async () => {
      await api.replaceProject(M.copy(initial));
      api.setStep("arrange");
      api.selectItem(M.mainItems(api.project)[0].id, false);
    };
    for (const event of ["change", "blur", "Enter"]) {
      await reset();
      const input = d.querySelector('input[data-control="endsAt"]');
      input.value = 0.8;
      input.dispatchEvent(new w.Event("input", { bubbles: true }));
      input.dispatchEvent(
        event === "Enter"
          ? new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })
          : new w.Event(event, { bubbles: true }),
      );
      click("duplicateItem");
      api.undo();
      check(
        event + " commits Trim separately from Duplicate",
        M.mainItems(api.project).length === 3 &&
          M.mainItems(api.project)[0].end === 0.8,
      );
      api.undo();
      api.redo();
      check(
        event + " Undo and Redo retain the independent Trim boundary",
        M.mainItems(api.project).length === 3 &&
          M.mainItems(api.project)[0].end === 0.8,
      );
    }
    await reset();
    await api.importFiles(
      [
        new w.File(
          [await (await fetch("fixtures/music.mp3")).blob()],
          "music.mp3",
          { type: "audio/mpeg" },
        ),
      ],
      "audio",
    );
    d.getElementById("studioDialog").close();
    api.edit(
      (project) => {
        M.addMedia(project, project.assets[0].id, {
          layerId: "overlay-1",
          start: 0,
        });
        M.addMedia(project, project.assets[0].id, {
          layerId: "overlay-2",
          start: 0,
        });
        M.addMedia(project, project.assets.find((a) => a.kind === "audio").id, {
          start: 0,
        });
      },
      "Add overlapping sounds",
      { context: true },
    );
    const count = api.project.items.length;
    check(
      "all three video originals plus music raise one shared limit warning",
      M.audioConflicts(api.project)[0].items.length === 4 &&
        !d.getElementById("audioConflictCard").hidden,
    );
    let playbackError;
    try {
      await api.engine.play();
    } catch (error) {
      playbackError = error.message;
    }
    check(
      "four-source playback is stopped with a corrective message",
      /three sounds/.test(playbackError) && !api.engine.playing,
    );
    await api.exportMovie(false);
    check(
      "four-source export fails visibly and leaves the project editable",
      !api.exporting &&
        !api.results.length &&
        /three sounds/.test(d.getElementById("contextError").textContent),
    );
    api.setStep("arrange");
    click("audioLimit");
    const choices = d.querySelectorAll(
      '#studioDialog input[data-control="muteItem"]',
    );
    check(
      "Review overlapping sounds exposes all four mute choices",
      choices.length === 4,
    );
    choices[0].click();
    click("close", "#studioDialog");
    check(
      "muting through the correction dialog resolves the limit without deleting sound",
      M.audioConflicts(api.project).length === 0 &&
        api.project.items.length === count,
    );
    api.undo();
    check(
      "Undo restores the sound and its overlap warning",
      M.audioConflicts(api.project).length > 0 &&
        !d.getElementById("audioConflictCard").hidden,
    );
    click("fixAudioLimit");
    check(
      "automatic audio correction is a separate undoable edit",
      M.audioConflicts(api.project).length === 0 &&
        api.project.items.length === count,
    );
    await api.seekTo(0.2);
    const play = d.getElementById("playButton");
    play.click();
    await wait(() => api.engine.playing && !api.engine.preparing);
    check(
      "Play and Pause retain one focus target and update their helpId",
      d.getElementById("playButton") === play &&
        play.dataset.helpId === "pause",
    );
    play.click();
    check(
      "the same transport control pauses all sound immediately",
      !api.engine.playing && play.dataset.helpId === "play",
    );
    const completed = await api.engine.play({ start: 0.3, end: 0.5 });
    check(
      "preview reaching its requested end stops and resolves successfully",
      completed &&
        !api.engine.playing &&
        Math.abs(api.project.playhead - 0.5) < 0.001,
    );
    await reset();
    api.project.exportSettings.quality = "high";
    api.project.exportSettings.bitrate = 0.5;
    api.project.exportSettings.includeAudio = false;
    const silent = await api.engine.recordRange(0.013, 0.123);
    const input = new w.UTVideoCodecs.Input({
      formats: w.UTVideoCodecs.ALL_FORMATS,
      source: new w.UTVideoCodecs.BlobSource(silent.blob),
    });
    check(
      "a silent fractional-frame export contains four frames and no audio track",
      silent.frameCount === 4 &&
        silent.audioSamples === 0 &&
        (await input.getPrimaryAudioTrack()) === null,
    );
    input.dispose();
    api.project.exportSettings.includeAudio = true;
    const withSound = await api.engine.recordRange(0.013, 0.123);
    check(
      "a non-frame-aligned segment keeps exact project audio duration",
      withSound.frameCount === 4 &&
        withSound.audioSamples === 5280 &&
        Math.abs(withSound.duration - 0.11) < 1e-9,
    );
    const id = api.project.assets[0].id,
      runtime = api.library.assets.get(id);
    api.library.assets.delete(id);
    let missing;
    try {
      await api.engine.recordRange(0, 0.1);
    } catch (error) {
      missing = error.message;
    } finally {
      api.library.assets.set(id, runtime);
    }
    check(
      "export of evicted media requests the missing file by name",
      missing?.includes("Relink batch-1.mp4"),
    );
    await api.engine.dispose();
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
