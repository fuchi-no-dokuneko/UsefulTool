#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const threshold = Number(process.env.COVERAGE_THRESHOLD || "95");
const reportDirectory = process.env.UAT_REPORT_DIRECTORY
  ? path.resolve(root, process.env.UAT_REPORT_DIRECTORY)
  : path.join(root, "build", "reports", "browser-uat");
const reportPath = path.join(reportDirectory, "coverage.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const maintained = ["toolkit.js", ...fs.readdirSync(path.join(root, "assets", "pages"), { recursive: true })
  // Match the collector's existing vendor exclusion. Bundled third-party
  // libraries are verified by the media acceptance tests, not maintained-source coverage.
  .filter((name) => name.endsWith(".js") && !name.split(path.sep).includes("vendor"))
  .sort()
  .map((name) => `assets/pages/${name}`)];
const measured = new Map(report.files.map((item) => [item.file, item]));
const missing = maintained.filter((file) => !measured.has(file));
const unmaintained = [...measured.keys()].filter((file) => !maintained.includes(file));
const failures = [];

if (missing.length) failures.push(`Missing maintained source coverage: ${missing.join(", ")}`);
if (unmaintained.length) failures.push(`Unexpected measured sources: ${unmaintained.join(", ")}`);
if (report.linePercent < threshold) failures.push(`Line coverage ${report.linePercent.toFixed(2)}% is below ${threshold}%`);
if (!report.totalBranches) failures.push("No V8 block branch coverage was collected");

const gate = {
  schemaVersion: "usefultool-coverage-gate-1.0.0",
  threshold,
  maintained,
  missing,
  linePercent: report.linePercent,
  branchPercent: report.branchPercent,
  passed: failures.length === 0,
  failures
};
fs.writeFileSync(
  path.join(reportDirectory, "coverage-gate.json"),
  JSON.stringify(gate, null, 2) + "\n"
);

if (failures.length) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}
console.log(`Coverage gate passed: ${report.linePercent.toFixed(2)}% lines; branch data collected (${report.branchPercent.toFixed(2)}%).`);
