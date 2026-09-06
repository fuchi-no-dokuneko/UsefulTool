const input = document.getElementById("input");
const output = document.getElementById("output");
const fileInput = document.getElementById("fileInput");
const status = document.getElementById("status");
const byteView = document.getElementById("byteView");
const dataUri = document.getElementById("dataUri");
const urlSafe = document.getElementById("urlSafe");
const downloadButton = document.getElementById("downloadButton");
let selectedBytes = null;
let selectedMime = "application/octet-stream";
let decodedBytes = null;

function bytesToBase64(bytes) {
  let binary = "";
  const size = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += size) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + size, bytes.length)));
  }
  return btoa(binary);
}

function normalizeBase64(value) {
  let text = value.trim();
  let mime = "application/octet-stream";
  const dataMatch = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.*)$/is.exec(text);
  if (dataMatch) {
    mime = dataMatch[1] || mime;
    text = dataMatch[2];
  }
  text = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 === 1) throw new Error("Invalid Base64 characters or length");
  text = text.replace(/=+$/, "");
  text += "=".repeat((4 - text.length % 4) % 4);
  return { text, mime };
}

function base64ToBytes(value) {
  const normalized = normalizeBase64(value);
  const binary = atob(normalized.text);
  return { bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)), mime: normalized.mime };
}

function showBytes(bytes, mime) {
  const preview = Array.from(bytes.slice(0, 256), (byte) => byte.toString(16).padStart(2, "0"));
  const rows = [];
  for (let i = 0; i < preview.length; i += 16) rows.push(preview.slice(i, i + 16).join(" "));
  let textPreview;
  try { textPreview = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, 4096)); }
  catch (_) { textPreview = "Binary data is not valid UTF-8."; }
  byteView.textContent = "MIME: " + mime + "\nSize: " + UsefulTool.bytesLabel(bytes.length) +
    "\n\nHex preview\n" + (rows.join("\n") || "(empty)") + "\n\nUTF-8 preview\n" + textPreview;
}

async function encode() {
  try {
    const bytes = selectedBytes || new TextEncoder().encode(input.value);
    let encoded = bytesToBase64(bytes);
    if (urlSafe.checked) encoded = encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    output.value = dataUri.checked ? "data:" + selectedMime + ";base64," + encoded : encoded;
    decodedBytes = null;
    downloadButton.disabled = true;
    UsefulTool.status(status, "Encoded " + UsefulTool.bytesLabel(bytes.length) + ".");
  } catch (error) { UsefulTool.status(status, error.message, "error"); }
}

function decode() {
  try {
    const result = base64ToBytes(input.value);
    decodedBytes = result.bytes;
    selectedMime = result.mime;
    let decodedText;
    try { decodedText = new TextDecoder("utf-8", { fatal: true }).decode(result.bytes); }
    catch (_) { decodedText = "[binary output - use Download decoded bytes]"; }
    output.value = decodedText;
    showBytes(result.bytes, result.mime);
    downloadButton.disabled = false;
    UsefulTool.status(status, "Decoded " + UsefulTool.bytesLabel(result.bytes.length) + ".");
  } catch (error) { UsefulTool.status(status, error.message, "error"); }
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  selectedBytes = new Uint8Array(await file.arrayBuffer());
  selectedMime = file.type || "application/octet-stream";
  input.value = "";
  UsefulTool.status(status, "Loaded " + file.name + " (" + UsefulTool.bytesLabel(file.size) + ").");
});
input.addEventListener("input", () => { selectedBytes = null; selectedMime = "text/plain;charset=utf-8"; });
document.getElementById("encodeButton").addEventListener("click", encode);
document.getElementById("decodeButton").addEventListener("click", decode);
document.getElementById("copyButton").addEventListener("click", async () => {
  await navigator.clipboard.writeText(output.value);
  UsefulTool.status(status, "Output copied.");
});
document.getElementById("useOutputButton").addEventListener("click", () => {
  input.value = output.value; selectedBytes = null; output.value = ""; UsefulTool.status(status, "Output moved to input.");
});
downloadButton.addEventListener("click", () => {
  if (decodedBytes) UsefulTool.download(new Blob([decodedBytes], { type: selectedMime }), "base64-decoded.bin");
});
document.getElementById("clearButton").addEventListener("click", () => {
  input.value = ""; output.value = ""; fileInput.value = ""; selectedBytes = null; decodedBytes = null;
  byteView.textContent = "No decoded bytes."; downloadButton.disabled = true; UsefulTool.status(status, "Cleared.");
});
window.UsefulToolBase64 = { base64ToBytes, bytesToBase64, decode, encode, normalizeBase64, showBytes };
