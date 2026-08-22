const peers = new Set();
const channels = new Set();
const incomingImages = new Map();
const seenMessages = new Map();
const clientId = crypto.randomUUID();
const limits = Object.freeze({
  packetCharacters: 16000,
  messageCharacters: 4000,
  chunkCharacters: 12000,
  imageCharacters: 7 * 1024 * 1024,
  globalImageCharacters: 12 * 1024 * 1024,
  imageChunks: 700,
  pendingImages: 8,
  seenMessages: 2000,
  retentionMs: 60000
});
const signalInput = document.getElementById("signalInput");
const signalOutput = document.getElementById("signalOutput");
const status = document.getElementById("connectionStatus");
const chatLog = document.getElementById("chatLog");
let pendingHost = null;

function waitForIce(peer) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const handler = () => {
      if (peer.iceGatheringState === "complete") { peer.removeEventListener("icegatheringstatechange", handler); resolve(); }
    };
    peer.addEventListener("icegatheringstatechange", handler);
    setTimeout(resolve, 5000);
  });
}

function renderMessage(name, text, own) {
  const item = document.createElement("article");
  item.className = "message" + (own ? " self" : "");
  const heading = document.createElement("strong");
  heading.textContent = name;
  const body = document.createElement("div");
  body.textContent = text;
  item.append(heading, body);
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
  return item;
}

function openChannel(channel, peer) {
  channel.binaryType = "arraybuffer";
  channel.addEventListener("open", () => {
    channels.add(channel);
    UsefulTool.status(status, channels.size + " connected peer(s).", "");
    sendPacket({ type: "system", name: displayName(), text: "joined the room" });
  });
  channel.addEventListener("close", () => { channels.delete(channel); UsefulTool.status(status, channels.size + " connected peer(s).", channels.size ? "" : "warn"); });
  channel.addEventListener("message", (event) => receivePacket(event.data, channel));
  channel.addEventListener("error", () => UsefulTool.status(status, "A data channel failed.", "error"));
  peer.channel = channel;
}

function createPeer() {
  const peer = new RTCPeerConnection({ iceServers: [] });
  peers.add(peer);
  peer.addEventListener("connectionstatechange", () => {
    if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
      if (peer.channel) channels.delete(peer.channel);
      if (peer.connectionState !== "disconnected") peers.delete(peer);
      UsefulTool.status(status, channels.size + " connected peer(s).", channels.size ? "" : "warn");
    }
  });
  peer.addEventListener("datachannel", (event) => openChannel(event.channel, peer));
  return peer;
}

function displayName() { return document.getElementById("displayName").value.trim() || "Guest"; }

function sendRaw(serialized, except) {
  for (const channel of channels) if (channel !== except && channel.readyState === "open") channel.send(serialized);
}

function cleanupState(now = Date.now()) {
  for (const [id, seenAt] of seenMessages) if (now - seenAt > limits.retentionMs) seenMessages.delete(id);
  for (const [id, record] of incomingImages) if (now > record.expiresAt) incomingImages.delete(id);
  while (seenMessages.size > limits.seenMessages) seenMessages.delete(seenMessages.keys().next().value);
}

function rememberMessage(id) {
  cleanupState();
  if (seenMessages.has(id)) return false;
  seenMessages.set(id, Date.now());
  return true;
}

function packetId(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function rejectPacket(message) {
  UsefulTool.status(status, "Peer data rejected: " + message, "error");
  return false;
}

function incomingImageCharacters() {
  let total = 0;
  for (const record of incomingImages.values()) total += record.characters;
  return total;
}

function sendPacket(packet, except) {
  const outgoing = {
    ...packet,
    messageId: packet.messageId || crypto.randomUUID(),
    origin: packet.origin || clientId
  };
  rememberMessage(outgoing.messageId);
  sendRaw(JSON.stringify(outgoing), except);
  return outgoing;
}

function receivePacket(serialized, source) {
  if (typeof serialized !== "string" || serialized.length > limits.packetCharacters) return rejectPacket("packet size is invalid");
  let packet;
  try { packet = JSON.parse(serialized); } catch (_) { return rejectPacket("packet is not valid JSON"); }
  if (!packet || typeof packet !== "object" || !packetId(packet.messageId)) return rejectPacket("message identifier is invalid");
  if (seenMessages.has(packet.messageId)) return false;
  if (packet.type === "chat" || packet.type === "system") {
    if (typeof packet.text !== "string" || packet.text.length > limits.messageCharacters) return rejectPacket("message text is invalid");
    if (packet.name != null && (typeof packet.name !== "string" || packet.name.length > 80)) return rejectPacket("sender name is invalid");
    rememberMessage(packet.messageId);
    renderMessage(packet.name || "Peer", packet.text, false);
    sendRaw(serialized, source);
    return true;
  } else if (packet.type === "image") {
    if (!packetId(packet.id)) return rejectPacket("image identifier is invalid");
    if (!Number.isSafeInteger(packet.total) || packet.total < 1 || packet.total > limits.imageChunks) return rejectPacket("image chunk total is invalid");
    if (!Number.isSafeInteger(packet.index) || packet.index < 0 || packet.index >= packet.total) return rejectPacket("image chunk index is invalid");
    if (typeof packet.data !== "string" || !packet.data.length || packet.data.length > limits.chunkCharacters) return rejectPacket("image chunk size is invalid");
    if (typeof packet.mime !== "string" || !packet.mime.startsWith("image/") || packet.mime.length > 100) return rejectPacket("image type is invalid");
    if (typeof packet.name !== "string" || !packet.name || packet.name.length > 200) return rejectPacket("image name is invalid");
    let record = incomingImages.get(packet.id);
    if (!record) {
      if (packet.index !== 0) return rejectPacket("sparse image chunks are not accepted");
      if (incomingImages.size >= limits.pendingImages) return rejectPacket("too many images are pending");
      record = { chunks: new Map(), total: packet.total, name: packet.name, mime: packet.mime, sender: packet.sender, characters: 0, expiresAt: Date.now() + limits.retentionMs };
      incomingImages.set(packet.id, record);
    }
    if (record.total !== packet.total || record.name !== packet.name || record.mime !== packet.mime || record.sender !== packet.sender) return rejectPacket("image chunk metadata changed");
    if (record.chunks.has(packet.index)) return rejectPacket("image chunk is duplicated");
    if (packet.index !== record.chunks.size) return rejectPacket("image chunks must arrive in order");
    if (record.characters + packet.data.length > limits.imageCharacters || incomingImageCharacters() + packet.data.length > limits.globalImageCharacters) return rejectPacket("image data limit exceeded");
    rememberMessage(packet.messageId);
    record.chunks.set(packet.index, packet.data);
    record.characters += packet.data.length;
    record.expiresAt = Date.now() + limits.retentionMs;
    if (record.chunks.size === record.total) {
      const item = renderMessage(record.sender || "Peer", record.name || "image", false);
      const image = document.createElement("img");
      image.alt = record.name || "Shared image";
      image.src = Array.from({ length: record.total }, (_, index) => record.chunks.get(index)).join("");
      item.appendChild(image);
      incomingImages.delete(packet.id);
    }
    sendRaw(serialized, source);
    return true;
  }
  return rejectPacket("packet type is unsupported");
}

document.getElementById("hostButton").addEventListener("click", async () => {
  try {
    const peer = createPeer();
    const channel = peer.createDataChannel("usefultool-chat", { ordered: true });
    openChannel(channel, peer);
    await peer.setLocalDescription(await peer.createOffer());
    await waitForIce(peer);
    pendingHost = peer;
    signalOutput.value = JSON.stringify(peer.localDescription);
    UsefulTool.status(status, "Invite ready. Send it to one peer, then paste their answer.", "warn");
  } catch (error) { UsefulTool.status(status, error.message, "error"); }
});

document.getElementById("joinButton").addEventListener("click", async () => {
  try {
    const offer = JSON.parse(signalInput.value);
    const peer = createPeer();
    await peer.setRemoteDescription(offer);
    await peer.setLocalDescription(await peer.createAnswer());
    await waitForIce(peer);
    signalOutput.value = JSON.stringify(peer.localDescription);
    UsefulTool.status(status, "Answer ready. Send it back to the host.", "warn");
  } catch (error) { UsefulTool.status(status, "Invite error: " + error.message, "error"); }
});

document.getElementById("applyAnswerButton").addEventListener("click", async () => {
  try {
    if (!pendingHost) throw new Error("Create a host invite first");
    await pendingHost.setRemoteDescription(JSON.parse(signalInput.value));
    pendingHost = null;
    signalInput.value = "";
    UsefulTool.status(status, "Answer applied; waiting for the channel to open.");
  } catch (error) { UsefulTool.status(status, "Answer error: " + error.message, "error"); }
});

document.getElementById("sendButton").addEventListener("click", () => {
  const field = document.getElementById("messageInput");
  const text = field.value.trim();
  if (!text || !channels.size) return;
  const packet = { type: "chat", name: displayName(), text };
  sendPacket(packet); renderMessage(packet.name, packet.text, true); field.value = "";
});

document.getElementById("sendImageButton").addEventListener("click", async () => {
  const file = document.getElementById("imageInput").files[0];
  if (!file || !channels.size) return;
  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
    UsefulTool.status(status, "Choose an image no larger than 5 MiB.", "error"); return;
  }
  const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const size = 12000;
  const total = Math.ceil(data.length / size);
  const id = crypto.randomUUID();
  renderMessage(displayName(), file.name, true).appendChild(Object.assign(document.createElement("img"), { src: data, alt: file.name }));
  for (let index = 0; index < total; index += 1) {
    sendPacket({ type: "image", id, index, total, data: data.slice(index * size, (index + 1) * size), name: file.name, mime: file.type, sender: displayName() });
    if (index % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

document.getElementById("copySignalButton").addEventListener("click", () => navigator.clipboard.writeText(signalOutput.value));
document.getElementById("disconnectButton").addEventListener("click", () => {
  for (const channel of channels) channel.close();
  for (const peer of peers) peer.close();
  channels.clear(); peers.clear(); pendingHost = null; signalInput.value = ""; signalOutput.value = "";
  UsefulTool.status(status, "Disconnected all peers.", "warn");
});
document.getElementById("messageInput").addEventListener("keydown", (event) => { if (event.key === "Enter") document.getElementById("sendButton").click(); });
window.UsefulToolLan = { channels, incomingImages, limits, receivePacket, sendPacket, cleanupState };
