(function () {
  "use strict";
  const V = UTVideoCompress,
    $ = (id) => document.getElementById(id),
    message = (text, mode) => UsefulTool.status($("status"), text, mode);
  let loaded = null,
    result = null,
    revision = 0,
    loadRevision = 0,
    operation = null,
    originalUrl = null,
    resultUrl = null,
    encodersReady = false;
  function reset() {
    revision++;
    if (operation) {
      operation.cancelled = true;
      operation.conversion?.cancel().catch(() => {});
      operation = null;
    }
    result = null;
    $("resultPreview").pause();
    $("resultPreview").removeAttribute("src");
    $("resultPreview").load();
    $("resultPreview").hidden = true;
    URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    $("downloadButton").disabled = true;
    $("resultFacts").textContent = "Compressed result";
    $("compressButton").disabled = !loaded || !encodersReady;
    $("cancelButton").hidden = true;
    $("progress").hidden = true;
  }
  const ready = (async () => {
    for (const option of $("encoding").options) {
      option.disabled = !(await V.canEncodeVideo(option.value, {
        width: 640,
        height: 360,
      }));
      if (option.disabled) option.textContent += " · unavailable";
    }
    const first = [...$("encoding").options].find((o) => !o.disabled);
    encodersReady = !!first;
    if (first) {
      $("encoding").value = first.value;
      message("Choose a local video of at most 1 GiB.");
    } else
      message(
        "This browser has no supported video encoder. Try a browser with WebCodecs encoding support.",
        "error",
      );
    $("compressButton").disabled = !loaded || !encodersReady;
  })().catch((error) => message(error.message, "error"));
  $("videoFile").addEventListener("change", async (event) => {
    reset();
    const current = ++loadRevision,
      file = event.target.files[0];
    loaded = null;
    $("compressButton").disabled = true;
    $("originalPreview").pause();
    $("originalPreview").removeAttribute("src");
    $("originalPreview").load();
    URL.revokeObjectURL(originalUrl);
    $("originalFacts").textContent = "Original video";
    if (!file) return;
    let input;
    try {
      if (!file.size || file.size > 1073741824)
        throw new Error("Choose a nonempty video of at most 1 GiB.");
      input = new V.Input({
        formats: V.ALL_FORMATS,
        source: new V.BlobSource(file),
      });
      const videos = await input.getVideoTracks(),
        audio = await input.getAudioTracks();
      if (!videos.length) throw new Error("This file has no video track.");
      const width = await videos[0].getDisplayWidth(),
        height = await videos[0].getDisplayHeight(),
        duration = await input.computeDuration();
      if (!(duration > 0 && Number.isFinite(duration)))
        throw new Error("The video has no readable finite duration.");
      await ready;
      if (current !== loadRevision) return;
      loaded = {
        file,
        width,
        height,
        duration,
        audio: audio.length,
        videos: videos.length,
      };
      originalUrl = URL.createObjectURL(file);
      $("originalPreview").src = originalUrl;
      $("originalFacts").textContent =
        `${file.name} · ${width} × ${height} · ${duration.toFixed(2)} s · ${audio.length} audio track(s) · ${UsefulTool.bytesLabel(file.size)}`;
      $("compressButton").disabled = !encodersReady;
      message(
        encodersReady
          ? "Ready. Choose resolution, FPS and encoding."
          : "No supported encoder is available.",
        encodersReady ? "" : "error",
      );
    } catch (error) {
      if (current === loadRevision) message(error.message, "error");
    } finally {
      input?.dispose();
    }
  });
  for (const id of ["resolution", "frameRate", "encoding"])
    $(id).addEventListener("input", () => {
      reset();
      if (loaded) message("Settings changed. Compress to update the result.");
    });
  $("cancelButton").addEventListener("click", () => {
    reset();
    message("Cancelled. Your original video is unchanged.");
  });
  $("compressButton").addEventListener("click", async () => {
    if (!loaded || !encodersReady) return;
    reset();
    const current = revision,
      data = loaded,
      op = (operation = { cancelled: false, conversion: null });
    let input;
    try {
      $("compressButton").disabled = true;
      $("cancelButton").hidden = false;
      $("progress").hidden = false;
      $("progress").value = 0;
      $("originalPreview").pause();
      message("Preparing compression…");
      const codec = $("encoding").value,
        side = Number($("resolution").value),
        fps = Number($("frameRate").value),
        mp4 = codec === "avc";
      input = new V.Input({
        formats: V.ALL_FORMATS,
        source: new V.BlobSource(data.file),
      });
      const output = new V.Output({
        format: mp4 ? new V.Mp4OutputFormat() : new V.WebMOutputFormat(),
        target: new V.BufferTarget(),
      });
      const conversion = await V.Conversion.init({
        input,
        output,
        tracks: "all",
        showWarnings: false,
        video: async (track) => {
          const w = await track.getDisplayWidth(),
            h = await track.getDisplayHeight(),
            scale = side ? Math.min(1, side / Math.max(w, h)) : 1;
          return {
            width: Math.max(2, Math.round((w * scale) / 2) * 2),
            height: Math.max(2, Math.round((h * scale) / 2) * 2),
            fit: "contain",
            allowRotationMetadata: false,
            frameRate: fps || undefined,
            codec,
            quality: new V.Quality("medium"),
            forceTranscode: true,
          };
        },
      });
      op.conversion = conversion;
      if (op.cancelled || current !== revision) {
        await conversion.cancel();
        return;
      }
      if (!conversion.isValid || conversion.discardedTracks.length) {
        await conversion.cancel();
        throw new Error(
          "Cannot preserve every media track with this encoding: " +
            conversion.discardedTracks.map((t) => t.reason).join(", ") +
            ". Choose another encoding.",
        );
      }
      conversion.onProgress = (value) => {
        if (current === revision) {
          $("progress").value = value;
          message("Compressing… " + Math.round(value * 100) + "%");
        }
      };
      await conversion.execute();
      if (op.cancelled || current !== revision) return;
      const blob = new Blob([output.target.buffer], {
        type: mp4 ? "video/mp4" : "video/webm",
      });
      const verify = new V.Input({
        formats: V.ALL_FORMATS,
        source: new V.BlobSource(blob),
      });
      let w, h, duration;
      try {
        const videos = await verify.getVideoTracks(),
          audio = await verify.getAudioTracks();
        if (videos.length !== data.videos || audio.length !== data.audio)
          throw new Error(
            "Output verification failed: media track counts differ.",
          );
        w = await videos[0].getDisplayWidth();
        h = await videos[0].getDisplayHeight();
        duration = await verify.computeDuration();
        if (
          Math.abs(duration - data.duration) >
          Math.max(0.2, data.duration * 0.005)
        )
          throw new Error("Output verification failed: duration differs.");
      } finally {
        verify.dispose();
      }
      if (current !== revision) return;
      result = { blob, extension: mp4 ? "mp4" : "webm" };
      resultUrl = URL.createObjectURL(blob);
      $("resultPreview").src = resultUrl;
      $("resultPreview").hidden = false;
      $("resultFacts").textContent =
        `${w} × ${h} · ${fps ? fps + " fps" : "original frame timing"} · ${codec.toUpperCase()}\n${UsefulTool.bytesLabel(blob.size)} · ${duration.toFixed(2)} s · ${data.audio} audio track(s)\n${blob.size < data.file.size ? Math.round((1 - blob.size / data.file.size) * 100) + "% smaller" : "This result is larger than the original. Try smaller dimensions or FPS."}`;
      $("downloadButton").disabled = false;
      message("Ready. The full video and its audio tracks are retained.");
    } catch (error) {
      if (current === revision && !op.cancelled)
        message(error.message, "error");
    } finally {
      input?.dispose();
      if (current === revision) {
        operation = null;
        $("compressButton").disabled = !loaded || !encodersReady;
        $("cancelButton").hidden = true;
        $("progress").hidden = true;
      }
    }
  });
  $("downloadButton").addEventListener("click", () => {
    if (result)
      UsefulTool.download(
        result.blob,
        loaded.file.name.replace(/\.[^.]*$/, "") +
          "-compressed." +
          result.extension,
      );
  });
  window.addEventListener("pagehide", () => {
    if (operation) {
      operation.cancelled = true;
      operation.conversion?.cancel().catch(() => {});
    }
  });
})();
