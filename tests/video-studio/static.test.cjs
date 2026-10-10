const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'../..');

test('button creation is confined to the help factory and literal help IDs are registered', () => {
  const context={UTStudio:{},document:{addEventListener(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/pages/video-studio/help.js'),'utf8'),context);
  const registry=context.UTStudio.Help.HELP_CONTENT;
  const controller=fs.readFileSync(path.join(root,'assets/pages/video-editor.js'),'utf8');
  assert.doesNotMatch(controller, /(?:createElement|\bel)\(\s*['"]button['"]/);
  assert.doesNotMatch(controller,/\bB\(\s*[,)]/);
  for(const match of controller.matchAll(/(?:\bB|H\.(?:attach|label))\(\s*['"]([^'"]+)['"]/g)) assert.ok(registry[match[1]],'Missing help '+match[1]);
  for(const [id,entry] of Object.entries(registry)) assert.ok(entry[0]&&entry[1],id+' must explain name and result');
});

test('offline artifact contains the current video sources with no runtime dependency', () => {
  const offline=fs.readFileSync(path.join(root,'offline/video-editor.html'),'utf8');
  assert.doesNotMatch(offline,/<script\s+[^>]*src=|<link\s+[^>]*rel="stylesheet"/);
  assert.match(offline,/connect-src 'none'/);
  for(const match of offline.matchAll(/<script data-inlined-from="([^"]+)">\n([\s\S]*?)\n<\/script>/g)) {
    assert.equal(match[2],fs.readFileSync(path.join(root,match[1]),'utf8').replace(/<\/script/gi,'<\\/script'));
  }
  const entry=JSON.parse(fs.readFileSync(path.join(root,'offline/manifest.json'))).pages.find(p=>p.file==='video-editor.html');
  assert.equal(entry.bytes,Buffer.byteLength(offline));
  assert.equal(entry.sha256,crypto.createHash('sha256').update(offline).digest('hex'));
});
