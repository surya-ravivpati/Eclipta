#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(repoRoot, "typecheck-baseline.json");
const strictConfig = "tsconfig.strict.json";

const ERROR_LINE = /^(?<file>[^(]+)\((?<line>\d+),\d+\): error (?<code>TS\d+):/;

function runStrictTypecheck() {
  try {
    execFileSync("npx", ["tsc", "--noEmit", "-p", strictConfig], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    return "";
  } catch (error) {
    // tsc exits non-zero whenever it reports errors, which is the normal path
    // here — the diagnostics we need are on stdout, not stderr.
    if (typeof error.stdout === "string") return error.stdout;
    throw error;
  }
}

function countByCode(output) {
  const counts = {};
  let total = 0;
  for (const line of output.split(/\r?\n/)) {
    const match = ERROR_LINE.exec(line);
    if (!match) continue;
    total += 1;
    counts[match.groups.code] = (counts[match.groups.code] ?? 0) + 1;
  }
  return { total, counts };
}

function readBaseline() {
  if (!existsSync(baselinePath)) return null;
  return JSON.parse(readFileSync(baselinePath, "utf8"));
}

function writeBaseline(total, counts) {
  const contents = { total, counts, updated: new Date().toISOString().slice(0, 10) };
  writeFileSync(baselinePath, `${JSON.stringify(contents, null, 2)}\n`);
}

const accept = process.argv.includes("--accept");
const { total, counts } = countByCode(runStrictTypecheck());
const baseline = readBaseline();

if (accept || baseline === null) {
  writeBaseline(total, counts);
  console.log(`Strict-mode baseline set to ${total} errors. Commit typecheck-baseline.json.`);
  process.exit(0);
}

if (total > baseline.total) {
  const regressed = Object.entries(counts)
    .filter(([code, n]) => n > (baseline.counts[code] ?? 0))
    .map(([code, n]) => `  ${code}: ${baseline.counts[code] ?? 0} -> ${n}`)
    .join("\n");

  console.error(
    `Strict-mode errors rose from ${baseline.total} to ${total}.\n` +
      `New code must satisfy tsconfig.strict.json.\n${regressed}\n\n` +
      `Run "pnpm typecheck:ratchet" locally and fix the new errors.`,
  );
  process.exit(1);
}

if (total < baseline.total) {
  writeBaseline(total, counts);
  console.log(
    `Strict-mode errors fell from ${baseline.total} to ${total}. ` +
      `Baseline tightened — commit typecheck-baseline.json.`,
  );
  process.exit(0);
}

console.log(`Strict-mode errors holding at ${total}.`);
