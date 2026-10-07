/* Shared local image encoding and measured size search. No network requests. */
(function () {
  "use strict";
  const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
  function canvas(width, height) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(width));
    c.height = Math.max(1, Math.round(height));
    c.getContext("2d", { willReadFrequently: true });
    return c;
  }
  function targetBytes(value, unit) {
    const amount = Number(value),
      multiplier = unit === "MiB" ? 1048576 : 1024;
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount * multiplier > 1073741824
    )
      throw new Error("Enter a positive size limit of at most 1 GiB.");
    return Math.max(1, Math.floor(amount * multiplier));
  }
  function encode(source, type, quality) {
    return new Promise((resolve, reject) =>
      source.toBlob(
        (blob) => {
          if (!blob || blob.type !== type)
            reject(new Error("This browser cannot encode " + type + "."));
          else resolve(blob);
        },
        type,
        quality,
      ),
    );
  }
  async function decode(blob) {
    const url = URL.createObjectURL(blob),
      img = new Image();
    try {
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function readImage(file) {
    if (file.size > 100 * 1048576)
      throw new Error("Choose an image no larger than 100 MiB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = (at, n) => String.fromCharCode(...bytes.subarray(at, at + n));
    const png = bytes[0] === 137 && text(1, 3) === "PNG";
    const webp = text(0, 4) === "RIFF" && text(8, 4) === "WEBP";
    const jpeg = bytes[0] === 255 && bytes[1] === 216;
    if (!png && !webp && !jpeg)
      throw new Error("Choose a still PNG, JPEG or WebP image.");
    const view = new DataView(bytes.buffer);
    if (png)
      for (let p = 8; p + 12 <= bytes.length; ) {
        if (text(p + 4, 4) === "acTL")
          throw new Error(
            "Animated PNG is not supported; its animation would be lost.",
          );
        p += view.getUint32(p) + 12;
      }
    if (webp)
      for (let p = 12; p + 8 <= bytes.length; ) {
        if (text(p, 4) === "ANIM")
          throw new Error(
            "Animated WebP is not supported; its animation would be lost.",
          );
        const n = view.getUint32(p + 4, true);
        p += 8 + n + (n % 2);
      }
    const image = await decode(file);
    if (image.naturalWidth * image.naturalHeight > 40000000)
      throw new Error("Choose an image of at most 40 megapixels.");
    const source = canvas(image.naturalWidth, image.naturalHeight);
    source.getContext("2d").drawImage(image, 0, 0);
    const pixels = source
      .getContext("2d")
      .getImageData(0, 0, source.width, source.height).data;
    let alpha = false;
    for (let i = 3; i < pixels.length; i += 4)
      if (pixels[i] !== 255) {
        alpha = true;
        break;
      }
    return {
      source,
      alpha,
      type: png ? "image/png" : webp ? "image/webp" : "image/jpeg",
    };
  }
  function scaled(source, scale, opaque = false) {
    const c = canvas(source.width * scale, source.height * scale),
      ctx = c.getContext("2d");
    if (opaque) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return c;
  }
  function sample(source, width, height) {
    const c = canvas(width, height),
      ctx = c.getContext("2d");
    ctx.fillStyle = "#888";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  }
  // Local structural similarity plus colour error. Compare every candidate at
  // the same dimensions, so quality numbers from different codecs aren't ranked.
  function similarity(a, b) {
    let total = 0,
      count = 0;
    for (let offset = 0; offset < a.length; offset += 256) {
      let x = 0,
        y = 0,
        xx = 0,
        yy = 0,
        xy = 0,
        error = 0,
        n = 0;
      for (let i = offset; i < Math.min(offset + 256, a.length); i += 4) {
        const l = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2],
          r = 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
        x += l;
        y += r;
        xx += l * l;
        yy += r * r;
        xy += l * r;
        n++;
        for (let k = 0; k < 3; k++) error += Math.abs(a[i + k] - b[i + k]);
      }
      x /= n;
      y /= n;
      const s =
        ((2 * x * y + 6.5025) * (2 * (xy / n - x * y) + 58.5225)) /
        ((x * x + y * y + 6.5025) *
          (xx / n - x * x + yy / n - y * y + 58.5225));
      total += 0.9 * s + 0.1 * (1 - error / (n * 3 * 255));
      count++;
    }
    return total / count;
  }
  async function fitImage(
    source,
    limit,
    { types, signal, onProgress = () => {} },
  ) {
    const sampleScale = Math.min(
      1,
      512 / Math.max(source.width, source.height),
    );
    const sw = Math.max(1, Math.round(source.width * sampleScale)),
      sh = Math.max(1, Math.round(source.height * sampleScale));
    const reference = sample(source, sw, sh);
    let best = null,
      smallest = null,
      step = 0;
    const scales = [1, 0.85, 0.7, 0.55, 0.4, 0.28, 0.18, 0.1, 0.05, 0.025];
    const minimumScale = 1 / Math.max(source.width, source.height);
    while (scales.at(-1) > minimumScale)
      scales.push(Math.max(minimumScale, scales.at(-1) / 2));
    let pngUpper = 1,
      pngDone = false;
    for (const scale of scales) {
      signal?.throwIfAborted();
      for (const type of types) {
        if (type === "image/png" && pngDone) continue;
        signal?.throwIfAborted();
        onProgress(
          ++step / (scales.length * types.length),
          "Testing " +
            Math.round(source.width * scale) +
            " × " +
            Math.round(source.height * scale) +
            " " +
            type.slice(6),
        );
        let c = scaled(source, scale, type === "image/jpeg");
        let candidate = null;
        const attempt = async (quality) => {
          signal?.throwIfAborted();
          const blob = await encode(c, type, quality);
          const item = {
            blob,
            type,
            quality,
            width: c.width,
            height: c.height,
          };
          if (!smallest || blob.size < smallest.blob.size) smallest = item;
          if (
            blob.size <= limit &&
            (!candidate ||
              quality > candidate.quality ||
              (quality === candidate.quality &&
                c.width * c.height > candidate.width * candidate.height))
          )
            candidate = item;
          return blob.size <= limit;
        };
        const fullQualityFits = await attempt(1);
        if (type === "image/png") {
          if (!fullQualityFits) pngUpper = scale;
          else {
            // PNG has no quality knob. Refine dimensions to use the available
            // bytes instead of stopping at a coarse resize step.
            let low = scale,
              high = pngUpper;
            for (let n = 0; n < 8 && high - low > minimumScale; n++) {
              const mid = (low + high) / 2;
              c.width = c.height = 1;
              c = scaled(source, mid);
              if (await attempt(1)) low = mid;
              else high = mid;
            }
            pngDone = true;
          }
        } else if (!fullQualityFits) {
          let low = 0.25,
            high = 1;
          if (await attempt(low))
            for (let n = 0; n < 7; n++) {
              const mid = (low + high) / 2;
              if (await attempt(mid)) low = mid;
              else high = mid;
            }
        }
        if (candidate) {
          const decoded = await decode(candidate.blob);
          candidate.score = similarity(reference, sample(decoded, sw, sh));
          if (
            !best ||
            candidate.score > best.score + 0.00001 ||
            (Math.abs(candidate.score - best.score) <= 0.00001 &&
              candidate.width > best.width)
          )
            best = candidate;
        }
        c.width = c.height = 1;
        await pause();
      }
      // A smaller image cannot improve on a lossless, full-resolution match.
      if (scale === 1 && best?.score >= 0.999999) break;
      if (types.length === 1 && types[0] === "image/png" && best) break;
      if (best && scale < 0.4) break;
    }
    signal?.throwIfAborted();
    return { best, smallest };
  }
  window.UsefulToolCompression = {
    canvas,
    targetBytes,
    encode,
    decode,
    readImage,
    scaled,
    fitImage,
    pause,
  };
})();
