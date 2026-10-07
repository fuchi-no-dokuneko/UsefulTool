(function () {
  "use strict";
  const C = UsefulToolCompression,
    $ = (id) => document.getElementById(id);
  let loaded = null,
    result = null,
    originalUrl = null,
    resultUrl = null,
    revision = 0,
    loadRevision = 0,
    controller = null;
  const status = (text, mode) => UsefulTool.status($("status"), text, mode);
  function invalidate() {
    revision++;
    controller?.abort();
    controller = null;
    result = null;
    URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    $("resultPreview").hidden = true;
    $("resultPreview").removeAttribute("src");
    $("resultFacts").textContent = "Compressed result";
    $("downloadButton").disabled = true;
    $("compressButton").disabled = !loaded;
    $("cancelButton").hidden = true;
    $("progress").hidden = true;
  }
  $("imageFile").addEventListener("change", async (event) => {
    invalidate();
    const version = ++loadRevision,
      file = event.target.files[0];
    loaded = null;
    $("compressButton").disabled = true;
    URL.revokeObjectURL(originalUrl);
    $("originalPreview").hidden = true;
    $("originalPreview").removeAttribute("src");
    $("originalFacts").textContent = "Original";
    if (!file) return;
    status("Reading image…");
    try {
      const data = await C.readImage(file);
      if (version !== loadRevision) return;
      loaded = { ...data, file };
      originalUrl = URL.createObjectURL(file);
      $("originalPreview").src = originalUrl;
      $("originalPreview").hidden = false;
      $("originalFacts").textContent =
        `${file.name} · ${data.source.width} × ${data.source.height} · ${UsefulTool.bytesLabel(file.size)}`;
      $("compressButton").disabled = false;
      status("Ready. Set a maximum size and compress.");
    } catch (error) {
      if (version === loadRevision) status(error.message, "error");
    }
  });
  for (const id of ["targetSize", "targetUnit", "imageFormat"])
    $(id).addEventListener("input", () => {
      invalidate();
      if (loaded) status("Settings changed. Compress to update the result.");
    });
  $("cancelButton").addEventListener("click", () => {
    invalidate();
    status("Cancelled. Your original image is unchanged.");
  });
  $("compressButton").addEventListener("click", async () => {
    if (!loaded) return;
    invalidate();
    const version = revision,
      data = loaded,
      control = (controller = new AbortController());
    try {
      const limit = C.targetBytes($("targetSize").value, $("targetUnit").value),
        format = $("imageFormat").value;
      $("compressButton").disabled = true;
      $("cancelButton").hidden = false;
      $("progress").hidden = false;
      let found;
      if (
        data.file.size <= limit &&
        (format === "auto" || format === data.type)
      )
        found = {
          blob: data.file,
          type: data.type,
          width: data.source.width,
          height: data.source.height,
          unchanged: true,
        };
      else {
        const types =
          format === "auto"
            ? data.alpha
              ? ["image/webp", "image/png"]
              : ["image/webp", "image/jpeg"]
            : [format];
        const search = await C.fitImage(data.source, limit, {
          types,
          signal: control.signal,
          onProgress(value, text) {
            if (version === revision) {
              $("progress").value = value;
              status(text);
            }
          },
        });
        found = search.best;
        if (!found)
          throw new Error(
            "Cannot reach this limit. Smallest tested image: " +
              UsefulTool.bytesLabel(search.smallest.blob.size) +
              ". Increase the limit.",
          );
      }
      if (version !== revision) return;
      result = found;
      resultUrl = URL.createObjectURL(found.blob);
      $("resultPreview").src = resultUrl;
      $("resultPreview").hidden = false;
      $("resultFacts").textContent =
        `${found.width} × ${found.height} · ${found.type.slice(6).toUpperCase()}\n${found.blob.size.toLocaleString()} bytes / ${limit.toLocaleString()} byte limit\n${found.unchanged ? "Original kept without recompression." : Math.round((1 - found.blob.size / data.file.size) * 100) + "% smaller. Encoded metadata is not retained."}`;
      $("downloadButton").disabled = false;
      status("Ready. Result is within your size limit.");
    } catch (error) {
      if (version === revision && error.name !== "AbortError")
        status(error.message, "error");
    } finally {
      if (version === revision) {
        controller = null;
        $("compressButton").disabled = false;
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
          (result.type === "image/jpeg" ? "jpg" : result.type.slice(6)),
      );
  });
  window.addEventListener("pagehide", () => controller?.abort());
})();
