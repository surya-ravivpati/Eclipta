#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(repoRoot, "lint-baseline.json");

function runLint() {
  try {
    return execFileSync("npx", ["eslint", ".", "-f", "json"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
  } catch (error) {
    // eslint exits non-zero when it reports errors; the JSON report is still
    // on stdout and is what we need.
    if (typeof error.stdout === "string" && error.stdout.trim()) return error.stdout;
    throw error;
  }
}

function summarise(reportJson) {
  const report = JSON.parse(reportJson);
  const counts = {};
  let errors = 0;
  let warnings = 0;

  for (const file of report) {
    for (const message of file.messages) {
      const rule = message.ruleId ?? "parse-error";
      if (message.severity === 2) errors += 1;
      else {
        warnings += 1;
        counts[rule] = (counts[rule] ?? 0) + 1;
      }
    }
  }
  return { errors, warnings, counts };
}

const accept = process.argv.includes("--accept");
const { errors, warnings, counts } = summarise(runLint());

// Errors are never tolerated, baseline or not — only warnings are ratcheted.
if (errors > 0) {
  console.error(`ESLint reported ${errors} error(s). Run "pnpm lint" to see them.`);
  process.exit(1);
}

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;

function write() {
  const contents = { warnings, counts, updated: new Date().toISOString().slice(0, 10) };
  writeFileSync(baselinePath, `${JSON.stringify(contents, null, 2)}\n`);
}

if (accept || baseline === null) {
  write();
  console.log(`Lint warning baseline set to ${warnings}. Commit lint-baseline.json.`);
  process.exit(0);
}

if (warnings > baseline.warnings) {
  const regressed = Object.entries(counts)
    .filter(([rule, n]) => n > (baseline.counts[rule] ?? 0))
    .map(([rule, n]) => `  ${rule}: ${baseline.counts[rule] ?? 0} -> ${n}`)
    .join("\n");

  console.error(
    `Lint warnings rose from ${baseline.warnings} to ${warnings}.\n${regressed}\n\n` +
      `New code must be warning-free. See AGENTS.md.`,
  );
  process.exit(1);
}

if (warnings < baseline.warnings) {
  write();
  console.log(
    `Lint warnings fell from ${baseline.warnings} to ${warnings}. ` +
      `Baseline tightened — commit lint-baseline.json.`,
  );
  process.exit(0);
}

console.log(`Lint warnings holding at ${warnings}.`);
