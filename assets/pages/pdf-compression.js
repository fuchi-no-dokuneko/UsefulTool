/* Optimize supported image streams in place. Page content and annotations stay intact. */
(function () {
  "use strict";
  const P = PDFLib,
    C = UsefulToolCompression,
    N = (key) => P.PDFName.of(key);
  const get = (dict, key) => dict.lookup(N(key));
  const number = (dict, key, fallback) =>
    get(dict, key)?.asNumber?.() ?? fallback;
  const name = (dict, key) => get(dict, key)?.asString?.();
  function rawPixels(stream, width, height, channels) {
    const dict = stream.dict,
      bits = number(dict, "BitsPerComponent", 8);
    if (bits !== 8) throw new Error("Unsupported image bit depth");
    let bytes = P.decodePDFRawStream(stream).decode();
    const params = get(dict, "DecodeParms");
    if (params instanceof P.PDFArray)
      throw new Error("Multiple image predictors");
    const predictor = params ? number(params, "Predictor", 1) : 1,
      stride = width * channels;
    if (
      params &&
      (number(params, "Columns", width) !== width ||
        number(params, "Colors", channels) !== channels ||
        number(params, "BitsPerComponent", 8) !== 8)
    )
      throw new Error("Unsupported predictor dimensions");
    if (predictor === 2) {
      bytes = bytes.slice();
      for (let row = 0; row < height; row++)
        for (let n = channels; n < stride; n++)
          bytes[row * stride + n] =
            (bytes[row * stride + n] + bytes[row * stride + n - channels]) &
            255;
    } else if (predictor >= 10 && predictor <= 15) {
      if (bytes.length !== (stride + 1) * height)
        throw new Error("Invalid PNG predictor");
      const result = new Uint8Array(stride * height);
      for (let row = 0; row < height; row++) {
        const mode = bytes[row * (stride + 1)];
        if (mode > 4) throw new Error("Invalid PNG filter");
        for (let col = 0; col < stride; col++) {
          const i = row * stride + col,
            a = col >= channels ? result[i - channels] : 0,
            b = row ? result[i - stride] : 0,
            c = row && col >= channels ? result[i - stride - channels] : 0;
          let prediction = 0;
          if (mode === 1) prediction = a;
          if (mode === 2) prediction = b;
          if (mode === 3) prediction = Math.floor((a + b) / 2);
          if (mode === 4) {
            const p = a + b - c,
              pa = Math.abs(p - a),
              pb = Math.abs(p - b),
              pc = Math.abs(p - c);
            prediction = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          }
          result[i] = (bytes[row * (stride + 1) + col + 1] + prediction) & 255;
        }
      }
      bytes = result;
    } else if (predictor !== 1) throw new Error("Unsupported image predictor");
    if (bytes.length !== stride * height)
      throw new Error("Invalid image byte count");
    return bytes;
  }
  function identityDecode(dict, channels) {
    const decode = get(dict, "Decode");
    if (!decode) return true;
    return (
      decode instanceof P.PDFArray &&
      decode.size() === channels * 2 &&
      Array.from({ length: decode.size() }, (_, i) =>
        decode.lookup(i).asNumber(),
      ).every((n, i) => n === i % 2)
    );
  }
  async function images(bytes, signal, onProgress = () => {}) {
    const doc = await P.PDFDocument.load(bytes),
      entries = doc.context.enumerateIndirectObjects(),
      masks = new Set();
    for (const [, obj] of entries)
      if (obj instanceof P.PDFRawStream) {
        const mask = obj.dict.get(N("SMask"));
        if (mask instanceof P.PDFRef) masks.add(mask.toString());
      }
    const found = [];
    let skipped = 0,
      totalPixels = 0;
    for (const [ref, obj] of entries) {
      signal?.throwIfAborted();
      if (
        !(obj instanceof P.PDFRawStream) ||
        name(obj.dict, "Subtype") !== "/Image" ||
        masks.has(ref.toString())
      )
        continue;
      try {
        const d = obj.dict,
          w = number(d, "Width", 0),
          h = number(d, "Height", 0),
          space = name(d, "ColorSpace"),
          channels =
            space === "/DeviceRGB" ? 3 : space === "/DeviceGray" ? 1 : 0;
        if (
          !w ||
          !h ||
          w * h > 40000000 ||
          totalPixels + w * h > 60000000 ||
          !channels ||
          get(d, "ImageMask")?.asBoolean?.() ||
          get(d, "Mask") ||
          get(d, "SMaskInData") ||
          !identityDecode(d, channels)
        )
          throw new Error("Unsupported image representation");
        const source = C.canvas(w, h),
          ctx = source.getContext("2d");
        if (name(d, "Filter") === "/DCTDecode") {
          const img = await C.decode(
            new Blob([obj.contents], { type: "image/jpeg" }),
          );
          if (img.naturalWidth !== w || img.naturalHeight !== h)
            throw new Error("Image dimensions differ");
          ctx.drawImage(img, 0, 0);
        } else {
          const pixels = rawPixels(obj, w, h, channels),
            rgba = new Uint8ClampedArray(w * h * 4);
          for (let n = 0; n < w * h; n++) {
            rgba[n * 4] = pixels[n * channels];
            rgba[n * 4 + 1] = pixels[n * channels + (channels === 3 ? 1 : 0)];
            rgba[n * 4 + 2] = pixels[n * channels + (channels === 3 ? 2 : 0)];
            rgba[n * 4 + 3] = 255;
          }
          ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
        }
        let alpha = null,
          maskRef = null;
        const mask = get(d, "SMask");
        if (mask && !(mask instanceof P.PDFName)) {
          maskRef = d.get(N("SMask"));
          if (
            !(mask instanceof P.PDFRawStream) ||
            !(maskRef instanceof P.PDFRef) ||
            number(mask.dict, "Width", 0) !== w ||
            number(mask.dict, "Height", 0) !== h ||
            name(mask.dict, "ColorSpace") !== "/DeviceGray" ||
            get(mask.dict, "Matte") ||
            !identityDecode(mask.dict, 1)
          )
            throw new Error("Unsupported transparency mask");
          const pixels = rawPixels(mask, w, h, 1),
            rgba = new Uint8ClampedArray(w * h * 4);
          alpha = C.canvas(w, h);
          for (let n = 0; n < w * h; n++) {
            rgba[n * 4] = rgba[n * 4 + 1] = rgba[n * 4 + 2] = pixels[n];
            rgba[n * 4 + 3] = 255;
          }
          alpha.getContext("2d").putImageData(new ImageData(rgba, w, h), 0, 0);
        }
        totalPixels += w * h;
        found.push({
          ref,
          source,
          alpha,
          maskRef,
          originalSize: obj.contents.length + (mask?.contents?.length || 0),
        });
        onProgress(found.length);
        await C.pause();
      } catch (error) {
        if (error.name === "AbortError") throw error;
        skipped++;
      }
    }
    return { found, skipped, pages: doc.getPageCount() };
  }
  async function candidate(bytes, entries, quality, scale, signal) {
    const doc = await P.PDFDocument.load(bytes);
    for (const entry of entries) {
      signal?.throwIfAborted();
      const source = C.scaled(entry.source, scale),
        blob = await C.encode(source, "image/jpeg", quality),
        data = new Uint8Array(await blob.arrayBuffer());
      const original = doc.context.lookup(entry.ref),
        dict = original.dict.clone(doc.context);
      dict.set(N("Width"), P.PDFNumber.of(source.width));
      dict.set(N("Height"), P.PDFNumber.of(source.height));
      dict.set(N("ColorSpace"), N("DeviceRGB"));
      dict.set(N("BitsPerComponent"), P.PDFNumber.of(8));
      dict.set(N("Filter"), N("DCTDecode"));
      dict.delete(N("DecodeParms"));
      dict.delete(N("Decode"));
      dict.set(N("Length"), P.PDFNumber.of(data.length));
      let mask;
      if (entry.alpha) {
        const a = C.scaled(entry.alpha, scale),
          rgba = a.getContext("2d").getImageData(0, 0, a.width, a.height).data,
          gray = new Uint8Array(a.width * a.height);
        for (let i = 0; i < gray.length; i++) gray[i] = rgba[i * 4];
        mask = doc.context.flateStream(gray, {
          Type: "XObject",
          Subtype: "Image",
          Width: a.width,
          Height: a.height,
          ColorSpace: "DeviceGray",
          BitsPerComponent: 8,
        });
        a.width = a.height = 1;
      }
      if (data.length + (mask?.contents.length || 0) < entry.originalSize) {
        // Give resized alpha its own reference; an existing mask can be shared
        // by another image which is deliberately left unchanged.
        if (mask) dict.set(N("SMask"), doc.context.register(mask));
        doc.context.assign(entry.ref, P.PDFRawStream.of(dict, data));
      }
      source.width = source.height = 1;
      await C.pause();
    }
    return doc.save({ useObjectStreams: true });
  }
  async function compress(
    bytes,
    limit,
    { signal, onProgress = () => {} } = {},
  ) {
    if (bytes.length <= limit)
      return { bytes, unchanged: true, images: 0, skipped: 0 };
    const inventory = await images(bytes, signal, (n) =>
      onProgress(0, "Reading image " + n + "…"),
    );
    try {
      let baseline = await candidate(bytes, [], 1, 1, signal),
        smallest = baseline.length < bytes.length ? baseline : bytes,
        best = null;
      if (baseline.length <= limit)
        return { bytes: baseline, images: 0, skipped: inventory.skipped };
      const scales = [1, 0.85, 0.7, 0.5, 0.35, 0.2, 0.1];
      let attempts = 0;
      for (const scale of scales) {
        if (!inventory.found.length) break;
        let accepted = null,
          low = 0.2,
          high = 0.98;
        async function attempt(q) {
          signal?.throwIfAborted();
          onProgress(
            Math.min(0.98, ++attempts / 56),
            `Optimizing ${inventory.found.length} image(s) · ${Math.round(scale * 100)}% dimensions · ${Math.round(q * 100)}% quality`,
          );
          const result = await candidate(
            bytes,
            inventory.found,
            q,
            scale,
            signal,
          );
          if (result.length < smallest.length) smallest = result;
          if (result.length <= limit) {
            accepted = { bytes: result, quality: q, scale };
            return true;
          }
          return false;
        }
        if (!(await attempt(high)) && (await attempt(low)))
          for (let n = 0; n < 7; n++) {
            const mid = (low + high) / 2;
            if (await attempt(mid)) low = mid;
            else high = mid;
          }
        if (
          accepted &&
          (!best ||
            accepted.quality * Math.pow(scale, 0.35) >
              best.quality * Math.pow(best.scale, 0.35))
        )
          best = accepted;
        if (accepted?.quality >= 0.7) break;
      }
      signal?.throwIfAborted();
      return {
        ...(best || { bytes: smallest }),
        images: inventory.found.length,
        skipped: inventory.skipped,
        met: !!best,
      };
    } finally {
      for (const i of inventory.found) {
        i.source.width = i.source.height = 1;
        if (i.alpha) i.alpha.width = i.alpha.height = 1;
      }
    }
  }
  window.UsefulToolPdfCompression = { compress, images, rawPixels };
})();
