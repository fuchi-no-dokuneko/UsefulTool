(function blockOutbound() {
  const deny = function () { throw new Error("Outbound network calls are disabled in UsefulTool."); };
  window.fetch = deny;
  window.XMLHttpRequest = deny;
  window.WebSocket = deny;
  window.EventSource = deny;
  if (navigator.sendBeacon) navigator.sendBeacon = function () { return false; };
})();

const fileInput = document.getElementById("fileInput");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const emptyState = document.getElementById("emptyState");
const statusText = document.getElementById("statusText");
const sizeText = document.getElementById("sizeText");
const threshold = document.getElementById("threshold");
const softness = document.getElementById("softness");
const thresholdValue = document.getElementById("thresholdValue");
const softnessValue = document.getElementById("softnessValue");
const brushSize = document.getElementById("brushSize");
const brushStrength = document.getElementById("brushStrength");
const brushValue = document.getElementById("brushValue");
const strengthValue = document.getElementById("strengthValue");
const removeButton = document.getElementById("removeButton");
const downloadButton = document.getElementById("downloadButton");
const resetButton = document.getElementById("resetButton");
const eraseMode = document.getElementById("eraseMode");
const restoreMode = document.getElementById("restoreMode");
const sampleMode = document.getElementById("sampleMode");
const sampleText = document.getElementById("sampleText");
const swatch = document.getElementById("swatch");
const format = document.getElementById("format");
const quality = document.getElementById("quality");
const sourceButton = document.getElementById("sourceButton");

const MAX_FILE_BYTES = 24 * 1024 * 1024;
const MAX_DIMENSION = 2400;
let original = null;
let mask = null;
let sample = { r: 255, g: 255, b: 255 };
let mode = "erase";
let sampling = false;
let drawing = false;
let lastPoint = null;

function setStatus(text) {
  statusText.textContent = text;
}

function updateReadouts() {
  thresholdValue.textContent = threshold.value;
  softnessValue.textContent = softness.value;
  brushValue.textContent = brushSize.value;
  strengthValue.textContent = brushStrength.value;
}

function updateSample(next) {
  sample = next;
  swatch.style.background = "rgb(" + sample.r + " " + sample.g + " " + sample.b + ")";
  sampleText.textContent = "Sample rgb(" + sample.r + ", " + sample.g + ", " + sample.b + ")";
}

function setMode(next) {
  mode = next;
  eraseMode.setAttribute("aria-pressed", String(next === "erase"));
  restoreMode.setAttribute("aria-pressed", String(next === "restore"));
}

function imagePoint(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((evt.clientX - rect.left) * canvas.width / rect.width)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((evt.clientY - rect.top) * canvas.height / rect.height)));
  return { x, y };
}

function drawCurrent() {
  if (!original || !mask) return;
  const out = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
  for (let i = 0; i < mask.length; i += 1) out.data[i * 4 + 3] = original.data[i * 4 + 3] * mask[i] / 255;
  ctx.putImageData(out, 0, 0);
}

function chooseCornerSample(data, width, height) {
  const points = [
    [1, 1],
    [width - 2, 1],
    [1, height - 2],
    [width - 2, height - 2]
  ];
  const total = { r: 0, g: 0, b: 0 };
  points.forEach(([x, y]) => {
    const i = (y * width + x) * 4;
    total.r += data[i];
    total.g += data[i + 1];
    total.b += data[i + 2];
  });
  return {
    r: Math.round(total.r / points.length),
    g: Math.round(total.g / points.length),
    b: Math.round(total.b / points.length)
  };
}

function removeBackground() {
  if (!original || !mask) return;
  const t = Number(threshold.value);
  const s = Number(softness.value);
  const data = original.data;
  for (let i = 0; i < mask.length; i += 1) {
    const p = i * 4;
    const dr = data[p] - sample.r;
    const dg = data[p + 1] - sample.g;
    const db = data[p + 2] - sample.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    let alpha = 255;
    if (distance <= t) {
      alpha = 0;
    } else if (distance < t + s) {
      alpha = Math.round(255 * (distance - t) / s);
    }
    mask[i] = Math.min(mask[i], alpha);
  }
  drawCurrent();
  setStatus("Background removal applied. Paint the mask to refine edges.");
}

function resetMask() {
  if (!original) return;
  mask = new Uint8ClampedArray(original.width * original.height);
  mask.fill(255);
  drawCurrent();
  setStatus("Mask reset.");
}

function applyBrush(point) {
  if (!mask || !original) return;
  const radius = Number(brushSize.value) / 2;
  const strength = Number(brushStrength.value) / 100;
  const minX = Math.max(0, Math.floor(point.x - radius));
  const maxX = Math.min(canvas.width - 1, Math.ceil(point.x + radius));
  const minY = Math.max(0, Math.floor(point.y - radius));
  const maxY = Math.min(canvas.height - 1, Math.ceil(point.y + radius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - point.x;
      const dy = y - point.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) continue;
      const feather = 1 - d / radius;
      const delta = 255 * strength * feather;
      const idx = y * canvas.width + x;
      if (mode === "erase") {
        mask[idx] = Math.max(0, mask[idx] - delta);
      } else {
        mask[idx] = Math.min(255, mask[idx] + delta);
      }
    }
  }
}

function brushLine(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / 4));
  for (let i = 0; i <= steps; i += 1) {
    applyBrush({ x: from.x + dx * i / steps, y: from.y + dy * i / steps });
  }
  drawCurrent();
}

async function loadImage(file) {
  if (!file) return;
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    setStatus("Only JPG and PNG files are accepted.");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    setStatus("File is too large. Keep it under 24 MB.");
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    original = ctx.getImageData(0, 0, canvas.width, canvas.height);
    mask = new Uint8ClampedArray(canvas.width * canvas.height);
    mask.fill(255);
    updateSample(chooseCornerSample(original.data, canvas.width, canvas.height));
    emptyState.hidden = true;
    canvas.hidden = false;
    sizeText.textContent = canvas.width + " x " + canvas.height;
    setStatus(scale < 1 ? "Image loaded and downscaled for browser safety." : "Image loaded.");
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    setStatus("The image could not be decoded.");
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function exportImage() {
  if (!original || !mask) {
    setStatus("Load an image before exporting.");
    return;
  }
  const type = format.value;
  let exportCanvas = canvas;
  if (type === "image/jpeg") {
    exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext("2d");
    exportCtx.fillStyle = "#ffffff";
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    exportCtx.drawImage(canvas, 0, 0);
  }
  exportCanvas.toBlob((blob) => {
    if (!blob) {
      setStatus("Export failed.");
      return;
    }
    const a = document.createElement("a");
    const extension = type === "image/png" ? "png" : "jpg";
    a.href = URL.createObjectURL(blob);
    a.download = "usefultool-image." + extension;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus("Image exported.");
  }, type, Number(quality.value) / 100);
}

fileInput.addEventListener("change", () => loadImage(fileInput.files[0]));
removeButton.addEventListener("click", removeBackground);
resetButton.addEventListener("click", resetMask);
downloadButton.addEventListener("click", exportImage);
eraseMode.addEventListener("click", () => setMode("erase"));
restoreMode.addEventListener("click", () => setMode("restore"));
sampleMode.addEventListener("click", () => {
  sampling = !sampling;
  sampleMode.setAttribute("aria-pressed", String(sampling));
  setStatus(sampling ? "Click the canvas to sample the background color." : "Sample mode off.");
});
sourceButton.addEventListener("click", () => {
  window.open("view-source:" + location.href, "_blank", "noopener,noreferrer");
});
[threshold, softness, brushSize, brushStrength].forEach((control) => control.addEventListener("input", updateReadouts));

canvas.addEventListener("pointerdown", (evt) => {
  if (!original) return;
  const point = imagePoint(evt);
  if (sampling) {
    const i = (point.y * canvas.width + point.x) * 4;
    updateSample({ r: original.data[i], g: original.data[i + 1], b: original.data[i + 2] });
    sampling = false;
    sampleMode.setAttribute("aria-pressed", "false");
    setStatus("Background sample updated.");
    return;
  }
  drawing = true;
  lastPoint = point;
  canvas.setPointerCapture(evt.pointerId);
  applyBrush(point);
  drawCurrent();
});
canvas.addEventListener("pointermove", (evt) => {
  if (!drawing || !lastPoint) return;
  const point = imagePoint(evt);
  brushLine(lastPoint, point);
  lastPoint = point;
});
canvas.addEventListener("pointerup", (evt) => {
  drawing = false;
  lastPoint = null;
  if (canvas.hasPointerCapture(evt.pointerId)) canvas.releasePointerCapture(evt.pointerId);
});
canvas.addEventListener("pointercancel", () => {
  drawing = false;
  lastPoint = null;
});

updateReadouts();
window.UsefulToolImageConverter = { applyBrush, brushLine, chooseCornerSample, drawCurrent, exportImage, imagePoint, loadImage, removeBackground, resetMask, setMode, updateSample };
