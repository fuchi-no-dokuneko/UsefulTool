const leftText = document.getElementById("leftText");
const rightText = document.getElementById("rightText");
const grid = document.getElementById("diffGrid");
const status = document.getElementById("status");
const patchButton = document.getElementById("patchButton");
const ignoreWhitespace = document.getElementById("ignoreWhitespace");
const inlineWordDiff = document.getElementById("inlineWordDiff");
const storageKeys = {
  left: "usefultool:file-diff:left-text",
  right: "usefultool:file-diff:right-text"
};
let patchText = "";

function storageAvailable() {
  try {
    const key = "usefultool:storage-test";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
}

const canStoreDrafts = storageAvailable();

function saveDrafts() {
  if (!canStoreDrafts) return;
  try {
    localStorage.setItem(storageKeys.left, leftText.value);
    localStorage.setItem(storageKeys.right, rightText.value);
  } catch (error) {
    UsefulTool.status(status, "Browser storage is full. Current text is not saved for reload.", "warn");
  }
}

function restoreDrafts() {
  if (!canStoreDrafts) return false;
  const savedLeft = localStorage.getItem(storageKeys.left);
  const savedRight = localStorage.getItem(storageKeys.right);
  if (savedLeft == null && savedRight == null) return false;
  leftText.value = savedLeft || "";
  rightText.value = savedRight || "";
  return true;
}

async function loadText(file, target) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) throw new Error("Text file exceeds 5 MiB");
  target.value = await file.text();
  saveDrafts();
}

function splitDocument(value) {
  const normalized = String(value).replace(/\r\n?/g, "\n");
  if (!normalized) return { lines: [], hasFinalNewline: false };
  const hasFinalNewline = normalized.endsWith("\n");
  const result = normalized.split("\n");
  if (hasFinalNewline) result.pop();
  return { lines: result, hasFinalNewline };
}

function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}

function lineChanges(left, right, ignore) {
  return Diff.diffArrays(left, right, ignore ? {
    comparator: (a, b) => normalizeWhitespace(a) === normalizeWhitespace(b)
  } : {});
}

function inlineChangeFor(left, right, enabled) {
  if (!enabled || left == null || right == null) return null;
  if (left.length + right.length > 2400) return null;
  const parts = Diff.diffWordsWithSpace(left, right);
  let addedChars = 0;
  let removedChars = 0;
  let unchangedChars = 0;
  for (const part of parts) {
    if (part.added) addedChars += part.value.length;
    else if (part.removed) removedChars += part.value.length;
    else unchangedChars += part.value.length;
  }
  const changedChars = addedChars + removedChars;
  if (!changedChars) return null;
  const longestLine = Math.max(left.length, right.length, 1);
  const retainedRatio = unchangedChars / longestLine;
  const limitedEdit = retainedRatio >= 0.35 || changedChars <= 24;
  if (!limitedEdit) return null;
  const ratio = changedChars / Math.max(left.length + right.length, 1);
  const level = ratio <= 0.22 ? "diff-minor" : ratio <= 0.48 ? "diff-medium" : "diff-heavy";
  return { parts, level };
}

function appendInlineParts(content, parts, side, level) {
  for (const part of parts) {
    if (part.added && side === "right") {
      const span = document.createElement("span");
      span.className = "inline-change inline-added " + level;
      span.textContent = part.value;
      content.append(span);
    } else if (part.removed && side === "left") {
      const span = document.createElement("span");
      span.className = "inline-change inline-removed " + level;
      span.textContent = part.value;
      content.append(span);
    } else if (!part.added && !part.removed) {
      content.append(document.createTextNode(part.value));
    }
  }
}

function appendCell(value, className, number, inlineChange, side) {
  const numberCell = document.createElement("div");
  numberCell.className = "line-number";
  numberCell.textContent = number == null ? "" : number;
  const content = document.createElement("div");
  content.className = className;
  if (inlineChange && value != null && (side === "left" || side === "right")) {
    appendInlineParts(content, inlineChange.parts, side, inlineChange.level);
  } else {
    content.textContent = value == null ? "" : value;
  }
  grid.append(numberCell, content);
}

function appendRow(left, right, leftClass, rightClass, leftNumber, rightNumber, inlineChange) {
  appendCell(left, leftClass, leftNumber, inlineChange, "left");
  appendCell(right, rightClass, rightNumber, inlineChange, "right");
}

function changeClass(kind, inlineChange) {
  return kind + " " + (inlineChange ? inlineChange.level : "diff-heavy");
}

function appendEofMarker(leftHasFinalNewline, rightHasFinalNewline) {
  const marker = "\\ No newline at end of file";
  appendRow(
    leftHasFinalNewline ? null : marker,
    rightHasFinalNewline ? null : marker,
    leftHasFinalNewline ? "empty" : "eof-marker",
    rightHasFinalNewline ? "empty" : "eof-marker",
    null,
    null,
    null
  );
}

function compare() {
  saveDrafts();
  const inlineEnabled = inlineWordDiff.checked;
  const leftDocument = splitDocument(leftText.value);
  const rightDocument = splitDocument(rightText.value);
  const changes = lineChanges(leftDocument.lines, rightDocument.lines, ignoreWhitespace.checked);
  grid.replaceChildren();
  let leftNumber = 1;
  let rightNumber = 1;
  let leftIndex = 0;
  let rightIndex = 0;
  let additions = 0;
  let removals = 0;
  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index];
    if (change.removed && changes[index + 1] && changes[index + 1].added) {
      const removedCount = change.count ?? change.value.length;
      const addedCount = changes[index + 1].count ?? changes[index + 1].value.length;
      const count = Math.max(removedCount, addedCount);
      for (let line = 0; line < count; line += 1) {
        const removed = line < removedCount ? leftDocument.lines[leftIndex + line] : undefined;
        const added = line < addedCount ? rightDocument.lines[rightIndex + line] : undefined;
        const inlineChange = inlineChangeFor(removed, added, inlineEnabled);
        appendRow(
          removed, added,
          removed == null ? "empty" : changeClass("removed", inlineChange),
          added == null ? "empty" : changeClass("added", inlineChange),
          removed == null ? null : leftNumber++,
          added == null ? null : rightNumber++,
          inlineChange
        );
      }
      leftIndex += removedCount;
      rightIndex += addedCount;
      removals += removedCount;
      additions += addedCount;
      index += 1;
    } else if (change.removed) {
      const count = change.count ?? change.value.length;
      for (let line = 0; line < count; line += 1) {
        appendRow(leftDocument.lines[leftIndex++], null, "removed diff-heavy", "empty", leftNumber++, null);
        removals += 1;
      }
    } else if (change.added) {
      const count = change.count ?? change.value.length;
      for (let line = 0; line < count; line += 1) {
        appendRow(null, rightDocument.lines[rightIndex++], "empty", "added diff-heavy", null, rightNumber++);
        additions += 1;
      }
    } else {
      const count = change.count ?? change.value.length;
      for (let line = 0; line < count; line += 1) {
        appendRow(leftDocument.lines[leftIndex++], rightDocument.lines[rightIndex++], "same", "same", leftNumber++, rightNumber++);
      }
    }
  }
  const eofNewlineDiffers = leftDocument.lines.length > 0 && rightDocument.lines.length > 0 &&
    leftDocument.hasFinalNewline !== rightDocument.hasFinalNewline;
  if (eofNewlineDiffers) appendEofMarker(leftDocument.hasFinalNewline, rightDocument.hasFinalNewline);
  patchText = Diff.createTwoFilesPatch("left", "right", leftText.value, rightText.value, "", "", { context: 3 });
  patchButton.disabled = false;
  UsefulTool.status(status, additions + " added line(s), " + removals + " removed line(s). Word highlighting " + (inlineEnabled ? "on." : "off.") + (eofNewlineDiffers ? " End-of-file newline differs." : ""), additions || removals || eofNewlineDiffers ? "warn" : "");
}

leftText.addEventListener("input", saveDrafts);
rightText.addEventListener("input", saveDrafts);
document.getElementById("leftFile").addEventListener("change", async (event) => { try { await loadText(event.target.files[0], leftText); compare(); } catch (error) { UsefulTool.status(status, error.message, "error"); } });
document.getElementById("rightFile").addEventListener("change", async (event) => { try { await loadText(event.target.files[0], rightText); compare(); } catch (error) { UsefulTool.status(status, error.message, "error"); } });
document.getElementById("compareButton").addEventListener("click", compare);
document.getElementById("swapButton").addEventListener("click", () => { const value = leftText.value; leftText.value = rightText.value; rightText.value = value; saveDrafts(); compare(); });
patchButton.addEventListener("click", () => UsefulTool.download(new Blob([patchText], { type: "text/x-diff" }), "comparison.patch"));
if (!restoreDrafts()) {
  leftText.value = "line one\nline two\nshared line\n";
  rightText.value = "line one\nline 2 edited\nshared line\nnew line\n";
}
compare();
window.UsefulToolDiff = { compare, inlineChangeFor, lineChanges, normalizeWhitespace, saveDrafts, splitDocument, restoreDrafts, storageKeys };
