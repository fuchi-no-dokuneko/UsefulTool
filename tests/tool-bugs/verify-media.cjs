const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'build/reports/video-studio');
const checks = [];
function decode(file) {
  return execFileSync('ffmpeg', ['-v','error','-xerror','-i',file,'-map','0:v:0',
    '-map','0:a?','-f','framemd5','-'], { maxBuffer: 8 * 1024 * 1024 }).toString();
}
for (const [name, relative] of [['source','tests/video-studio/fixtures/source.mp4'],
  ['video-editor','tests/fixtures/video-editor.mp4']]) {
  const before = decode(path.join(root, relative));
  for (const mode of ['erase','inject']) {
    assert.equal(decode(path.join(directory, `metadata-${name}-${mode}.mp4`)), before);
    checks.push({ name: `${name} ${mode}: every decoded video/audio frame matches its original`, passed: true });
  }
}
fs.writeFileSync(path.join(directory, 'metadata-verification.json'), JSON.stringify({passed:true,checks},null,2));
for (const check of checks) console.log('PASS ' + check.name);
