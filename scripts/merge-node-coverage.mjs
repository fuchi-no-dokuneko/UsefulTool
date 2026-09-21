// Combine measured DOM-free unit coverage with browser coverage by source line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = process.cwd();
const directory = path.resolve(process.env.UAT_REPORT_DIRECTORY || 'build/reports/browser-uat');
const report = JSON.parse(fs.readFileSync(path.join(directory, 'coverage.json')));
const covered = new Map();
for (const file of fs.readdirSync(path.join(directory, 'node'))) {
  if (!file.endsWith('.json')) continue;
  const data = JSON.parse(fs.readFileSync(path.join(directory, 'node', file)));
  for (const entry of data.result) {
    if (!entry.url.startsWith('file:')) continue;
    const absolute = fileURLToPath(entry.url);
    const relative = path.relative(root, absolute);
    if (!report.files.some(f => f.file === relative)) continue;
    const ranges = entry.functions.flatMap(f => f.ranges);
    const lines = fs.readFileSync(absolute, 'utf8').split('\n');
    const hits = covered.get(relative) || new Set();
    let offset = 0;
    lines.forEach((line, index) => {
      const position = offset + Math.max(0, line.search(/\S/));
      const inside = ranges.filter(r => r.startOffset <= position && position < r.endOffset)
        .sort((a,b) => (a.endOffset-a.startOffset)-(b.endOffset-b.startOffset));
      if (inside[0]?.count > 0) hits.add(index + 1);
      offset += line.length + 1;
    });
    covered.set(relative, hits);
  }
}
let current;
const counts = new Map();
const lcov = fs.readFileSync(path.join(directory, 'lcov.info'), 'utf8').split('\n').map(line => {
  if (line.startsWith('SF:')) { current = line.slice(3); counts.set(current, 0); }
  const data = /^DA:(\d+),(\d+)$/.exec(line);
  if (data) {
    const hit = Number(data[2]) > 0 || covered.get(current)?.has(Number(data[1]));
    if (hit) counts.set(current, counts.get(current) + 1);
    return `DA:${data[1]},${hit ? 1 : 0}`;
  }
  return line.startsWith('LH:') ? 'LH:' + counts.get(current) : line;
});
for (const file of report.files) file.coveredLines = counts.get(file.file) ?? file.coveredLines;
report.coveredLines = report.files.reduce((sum, file) => sum + file.coveredLines, 0);
report.browserLinePercent ??= report.linePercent;
report.linePercent = report.coveredLines / report.totalLines * 100;
report.lineCoverageSources = ['browser V8', 'Node V8 unit tests'];
fs.writeFileSync(path.join(directory, 'lcov.info'), lcov.join('\n'));
fs.writeFileSync(path.join(directory, 'coverage.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Combined measured line coverage: ${report.coveredLines}/${report.totalLines} (${report.linePercent.toFixed(2)}%)`);
const note = `\nCombined browser/Node line coverage: ${report.linePercent.toFixed(2)}%. Branch coverage above is browser-only.\n`;
fs.appendFileSync(path.join(directory, 'summary.md'), note);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, note);
