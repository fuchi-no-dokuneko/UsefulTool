/* Preserve finite durations in locally recorded WebM files. */
(function (root) {
  "use strict";
  function readEbmlVint(bytes, offset, identifier = false) {
    const first = bytes[offset];
    if (!first) return null;
    let width = 1;
    let marker = 0x80;
    while (!(first & marker) && width < 8) {
      width += 1;
      marker >>= 1;
    }
    if (!marker || offset + width > bytes.length) return null;
    let value = BigInt(identifier ? first : first & (marker - 1));
    for (let index = 1; index < width; index += 1)
      value = value * 256n + BigInt(bytes[offset + index]);
    const unknown = !identifier && value === (1n << BigInt(width * 7)) - 1n;
    return { value, width, unknown };
  }

  function readEbmlElement(bytes, offset) {
    const identifier = readEbmlVint(bytes, offset, true);
    if (!identifier) return null;
    const size = readEbmlVint(bytes, offset + identifier.width);
    if (!size) return null;
    const dataOffset = offset + identifier.width + size.width;
    const byteLength = size.unknown ? null : Number(size.value);
    if (
      byteLength !== null &&
      (!Number.isSafeInteger(byteLength) ||
        dataOffset + byteLength > bytes.length)
    )
      return null;
    return {
      id: Number(identifier.value),
      offset,
      dataOffset,
      size: byteLength,
      endOffset: byteLength === null ? null : dataOffset + byteLength,
    };
  }

  function encodeEbmlSize(value) {
    const size = BigInt(value);
    for (let width = 1; width <= 8; width += 1) {
      if (size >= (1n << BigInt(width * 7)) - 1n) continue;
      let encoded = (1n << BigInt(width * 7)) | size;
      const result = new Uint8Array(width);
      for (let index = width - 1; index >= 0; index -= 1) {
        result[index] = Number(encoded & 255n);
        encoded >>= 8n;
      }
      return result;
    }
    throw new Error("WebM header is too large.");
  }

  async function finalizeWebmDuration(blob, seconds) {
    if (
      !blob.type.includes("webm") ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    )
      return blob;
    const bytes = new Uint8Array(
      await blob.slice(0, Math.min(blob.size, 65536)).arrayBuffer(),
    );
    let offset = 0;
    let segment = null;
    while (offset < bytes.length) {
      const element = readEbmlElement(bytes, offset);
      if (!element) return blob;
      if (element.id === 0x18538067) {
        segment = element;
        break;
      }
      if (element.endOffset === null) return blob;
      offset = element.endOffset;
    }
    if (!segment || segment.size !== null) return blob;
    let info = null;
    offset = segment.dataOffset;
    while (offset < bytes.length) {
      const element = readEbmlElement(bytes, offset);
      if (!element) return blob;
      if (element.id === 0x114d9b74) return blob; // SeekHead offsets would need updating.
      if (element.id === 0x1549a966) {
        info = element;
        break;
      }
      if (element.endOffset === null) return blob;
      offset = element.endOffset;
    }
    if (!info || info.endOffset === null) return blob;
    let timestampScale = 1_000_000;
    offset = info.dataOffset;
    while (offset < info.endOffset) {
      const element = readEbmlElement(bytes, offset);
      if (
        !element ||
        element.endOffset === null ||
        element.endOffset > info.endOffset
      )
        return blob;
      if (element.id === 0x4489) return blob;
      if (element.id === 0x2ad7b1) {
        let value = 0;
        for (
          let index = element.dataOffset;
          index < element.endOffset;
          index += 1
        )
          value = value * 256 + bytes[index];
        if (Number.isSafeInteger(value) && value > 0) timestampScale = value;
      }
      offset = element.endOffset;
    }
    offset = info.endOffset;
    while (offset < bytes.length) {
      const element = readEbmlElement(bytes, offset);
      if (!element || element.id === 0x1f43b675) break;
      if (element.id === 0x114d9b74) return blob;
      if (element.endOffset === null) break;
      offset = element.endOffset;
    }
    const duration = new Uint8Array(11);
    duration.set([0x44, 0x89, 0x88]);
    new DataView(duration.buffer).setFloat64(
      3,
      (seconds * 1_000_000_000) / timestampScale,
      false,
    );
    const identifierLength = readEbmlVint(bytes, info.offset, true).width;
    return new Blob(
      [
        blob.slice(0, info.offset),
        bytes.slice(info.offset, info.offset + identifierLength),
        encodeEbmlSize(info.size + duration.length),
        blob.slice(info.dataOffset, info.endOffset),
        duration,
        blob.slice(info.endOffset),
      ],
      { type: blob.type },
    );
  }

  root.UTStudio.finalizeWebmDuration = finalizeWebmDuration;
})(globalThis);
