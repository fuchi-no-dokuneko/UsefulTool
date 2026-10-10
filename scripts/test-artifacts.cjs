const fs = require('node:fs');
const path = require('node:path');
module.exports = function saveArtifact(root, request, response) {
  const match = /^\/__video-studio-test__\/(release-standard\.webm|routing-(?:stereo\.webm|fade\.webm|segments\.zip)|metadata-(?:source|video-editor)-(?:erase|inject)\.mp4|unicode-captions\.pdf)$/.exec(request.url);
  if (request.method !== 'POST' || !match) return false;
  const directory = path.join(root, 'build/reports/video-studio');
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, match[1]);
  const output = fs.createWriteStream(destination + '.tmp');
  let bytes = 0;
  request.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > 256 * 1024 * 1024) { request.destroy(); output.destroy(); }
  });
  request.pipe(output);
  output.on('finish', () => {
    fs.renameSync(destination + '.tmp', destination);
    response.writeHead(201).end('Saved local test artifact');
  });
  output.on('error', () => { if (!response.headersSent) response.writeHead(500).end(); });
  return true;
};
