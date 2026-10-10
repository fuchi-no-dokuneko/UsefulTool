const textInput = document.getElementById("transferText");
const filenameInput = document.getElementById("filename");
const status = document.getElementById("status");
const storageKeys = {
  text: "usefultool:text-transfer:text",
  filename: "usefultool:text-transfer:filename",
  editorDrafts: "usefultool:text-editor:drafts",
  editorActive: "usefultool:text-editor:active",
  editorLegacy: "usefultool:word-count:text",
  diffLeft: "usefultool:file-diff:left-text",
  diffRight: "usefultool:file-diff:right-text"
};

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    UsefulTool.status(status, "Browser storage is full. Current text is not saved for reload.", "warn");
    return false;
  }
}

function safeName() {
  return (filenameInput.value.trim() || "usefultool-text.txt").replace(/[\\/:*?"<>|]+/g, "-");
}

function renderStats() {
  const text = textInput.value;
  document.getElementById("bytes").textContent = UsefulTool.bytesLabel(new TextEncoder().encode(text).length);
  document.getElementById("characters").textContent = [...text].length;
  document.getElementById("lines").textContent = text ? text.split(/\r\n?|\n/u).length : 0;
}

function saveDraft() {
  writeStorage(storageKeys.text, textInput.value);
  writeStorage(storageKeys.filename, filenameInput.value);
  renderStats();
}

function createId() {
  return "draft-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function sendToEditor() {
  let drafts = [];
  try {
    const saved = readStorage(storageKeys.editorDrafts);
    drafts = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(drafts)) drafts = [];
  } catch (error) {
    drafts = [];
  }
  const draft = {
    id: createId(),
    name: safeName().replace(/\.[^.]+$/, "") || "Uploaded text",
    text: textInput.value,
    mode: "auto",
    updatedAt: Date.now()
  };
  drafts.unshift(draft);
  writeStorage(storageKeys.editorDrafts + ":" + draft.id, JSON.stringify(draft));
  writeStorage(storageKeys.editorDrafts, JSON.stringify(drafts));
  writeStorage(storageKeys.editorActive, draft.id);
  writeStorage(storageKeys.editorLegacy, textInput.value);
  window.open("word-count.html", "_blank");
  UsefulTool.status(status, "Sent text to editor.", "success");
}

function sendToDiff(side) {
  writeStorage(side === "right" ? storageKeys.diffRight : storageKeys.diffLeft, textInput.value);
  window.open("file-diff.html", "_blank");
  UsefulTool.status(status, "Sent text to diff " + side + ".", "success");
}

textInput.value = readStorage(storageKeys.text) || "";
filenameInput.value = readStorage(storageKeys.filename) || filenameInput.value;
renderStats();
textInput.addEventListener("input", saveDraft);
filenameInput.addEventListener("input", saveDraft);
document.getElementById("file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  textInput.value = await file.text();
  filenameInput.value = file.name || filenameInput.value;
  saveDraft();
  UsefulTool.status(status, "Loaded " + file.name + ".", "success");
  event.target.value = "";
});
document.getElementById("download").addEventListener("click", () => {
  UsefulTool.download(new Blob([textInput.value], { type: "text/plain;charset=utf-8" }), safeName());
  UsefulTool.status(status, "Text downloaded.", "success");
});
document.getElementById("openEditor").addEventListener("click", sendToEditor);
document.getElementById("sendLeft").addEventListener("click", () => sendToDiff("left"));
document.getElementById("sendRight").addEventListener("click", () => sendToDiff("right"));
document.getElementById("clear").addEventListener("click", () => {
  textInput.value = "";
  saveDraft();
  textInput.focus();
  UsefulTool.status(status, "Cleared.", "success");
});

window.UsefulToolTextTransfer = { renderStats, safeName, saveDraft, sendToEditor, sendToDiff, storageKeys };
