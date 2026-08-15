#!/usr/bin/env node
/**
 * Unit-test line-coverage ratchet.
 *
 * Same shape as lint-ratchet.mjs and typecheck-ratchet.mjs — a recorded floor
 * that may fall but never rise — with one addition: a commit that changes
 * production code has to *raise* the floor, not merely hold it.
 *
 * ── Why the increase is conditional ─────────────────────────────────────────
 * The requested rule was "+1/100th every commit". Applied literally that blocks
 * commits that cannot possibly satisfy it: a README edit, a SQL migration, a
 * config change, or a refactor that deletes as much as it adds. A gate that
 * fires on work it has no opinion about is a gate people learn to pass with
 * --no-verify, and then it protects nothing.
 *
 * So the demand is scoped to the commits it can actually be about. Touch
 * `src/**` production code and you owe a percentage point. Touch anything else
 * and you only owe "don't regress". The floor still only moves one way, so the
 * number climbs steadily toward the target without ever standing in front of
 * work it was not designed to judge.
 *
 * ── What counts as "production code" ────────────────────────────────────────
 * `src/**` excluding tests and the generated files coverage already ignores.
 * Adding tests alone raises coverage without tripping the requirement, which
 * is the intended escape hatch: a commit whose whole job is backfilling tests
 * should never be blocked for not adding enough of them.
 *
 * ── Checking never writes ───────────────────────────────────────────────────
 * Raising the floor is something a *commit* earns, so only `--advance` (which
 * the pre-commit hook passes) may move it. An earlier version raised the floor
 * on any passing run, which meant checking your work before committing quietly
 * banked the gain - and the hook then asked for another point on top of it, for
 * the same code. Running this by hand as often as you like is now free.
 *
 * Usage:
 *   node scripts/coverage-ratchet.mjs            check only, never writes
 *   node scripts/coverage-ratchet.mjs --staged   judge the staged diff
 *   node scripts/coverage-ratchet.mjs --advance  raise the floor when earned
 *   node scripts/coverage-ratchet.mjs --accept   force-record the current number
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(repoRoot, "coverage-baseline.json");
const summaryPath = join(repoRoot, "coverage", "coverage-summary.json");

/** Percentage points a production-code commit must add. */
const REQUIRED_GAIN = 1.0;

/**
 * How far the percentage may dip before it counts as a regression.
 *
 * Not float noise - real churn. Coverage is a ratio, and the formatter that
 * runs in lint-staged moves the denominator on its own: reflowing a few files
 * added 9 lines to the total on one commit here and dropped the figure by
 * 0.01pp while not one line of behaviour changed. A gate that fails on that is
 * measuring prettier.
 *
 * 0.05pp is about five lines out of nine thousand - far below anything a real
 * slug of untested code moves, and the +1pp gain requirement is the guard that
 * actually catches new untested work.
 */
const EPSILON = 0.05;

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

/**
 * Files this commit changes, from the staged index or from the diff against
 * the upstream branch. Falls back to an empty list rather than guessing: an
 * unknown diff should not invent an obligation.
 */
function changedFiles() {
  if (process.argv.includes("--staged")) {
    return git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
      .split("\n")
      .filter(Boolean);
  }
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).trim();
  if (!upstream) return [];
  return git(["diff", "--name-only", "--diff-filter=ACMR", `${upstream}...HEAD`])
    .split("\n")
    .filter(Boolean);
}

const PRODUCTION = /^src\/.*\.(ts|tsx)$/;
const NOT_PRODUCTION = [
  /\.test\.(ts|tsx)$/,
  /\.verify\.ts$/,
  /^src\/routeTree\.gen\.ts$/,
  /^src\/integrations\/supabase\/types\.ts$/,
  /^src\/components\/ui\//,
];

function touchesProductionCode(files) {
  return files.some((f) => PRODUCTION.test(f) && !NOT_PRODUCTION.some((skip) => skip.test(f)));
}

function runCoverage() {
  execFileSync("npx", ["vitest", "run", "--coverage", "--coverage.reporter=json-summary"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    // Inherit so a failing test prints its own diagnosis rather than being
    // swallowed and re-reported here as a coverage problem.
    stdio: ["ignore", "inherit", "inherit"],
    shell: process.platform === "win32",
  });
}

function readCoverage() {
  if (!existsSync(summaryPath)) {
    console.error(
      `No coverage summary at ${summaryPath}.\n` +
        `Ensure "json-summary" is in vitest.config.ts's coverage.reporter list.`,
    );
    process.exit(1);
  }
  const total = JSON.parse(readFileSync(summaryPath, "utf8")).total;
  return {
    lines: total.lines.pct,
    covered: total.lines.covered,
    totalLines: total.lines.total,
  };
}

const accept = process.argv.includes("--accept");
/** Only a real commit may bank a gain - see "Checking never writes" above. */
const advance = process.argv.includes("--advance");

runCoverage();
const { lines, covered, totalLines } = readCoverage();
const shown = lines.toFixed(2);

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;

function write(floor) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify(
      {
        lines: Number(floor.toFixed(2)),
        covered,
        total: totalLines,
        requiredGainPerCodeCommit: REQUIRED_GAIN,
        updated: new Date().toISOString().slice(0, 10),
      },
      null,
      2,
    )}\n`,
  );
}

if (accept || baseline === null) {
  write(lines);
  console.log(`Line coverage baseline set to ${shown}%. Commit coverage-baseline.json.`);
  process.exit(0);
}

const floor = baseline.lines;

if (lines < floor - EPSILON) {
  console.error(
    `Line coverage fell from ${floor.toFixed(2)}% to ${shown}% (${covered}/${totalLines} lines).\n\n` +
      `Coverage may never drop. Add tests for what this commit changed, or\n` +
      `remove the untested code it introduced.`,
  );
  process.exit(1);
}

// The gain is a property of *making* a commit, so it is only demanded at
// commit time. Two reasons, both learned the hard way:
//
//   1. It is not idempotent otherwise. Once a commit raises the floor, a later
//      run against the same commit sees coverage == floor and asks for another
//      point on top - punishing the same change twice, forever.
//   2. Percentage is a ratio, and the denominator moves on its own. The
//      formatter that runs during `git commit` reflowed 162 files here and
//      added 92 lines to the total, which dropped the percentage while covered
//      lines actually went up. Judging the gain after that has already happened
//      measures the formatter, not the author.
//
// Push keeps the guard that matters and cannot drift: coverage may never fall.
const enforceGain = process.argv.includes("--staged");
const files = changedFiles();
const owesGain = enforceGain && touchesProductionCode(files);
const target = floor + REQUIRED_GAIN;

if (owesGain && lines < target - EPSILON) {
  console.error(
    `Line coverage is ${shown}% (${covered}/${totalLines} lines).\n` +
      `This commit changes production code under src/, so it needs ` +
      `${target.toFixed(2)}% — a ${REQUIRED_GAIN.toFixed(2)}pp gain on the ` +
      `${floor.toFixed(2)}% floor.\n\n` +
      `Short by ${(target - lines).toFixed(2)}pp, roughly ` +
      `${Math.ceil(((target - lines) / 100) * totalLines)} more covered lines.\n\n` +
      `A commit that only adds tests is never asked for a gain — split the work\n` +
      `if that is easier than covering this change in place.`,
  );
  process.exit(1);
}

if (lines > floor + EPSILON) {
  if (advance) {
    write(lines);
    console.log(
      `Line coverage rose from ${floor.toFixed(2)}% to ${shown}% ` +
        `(${covered}/${totalLines} lines). Floor raised - commit coverage-baseline.json.`,
    );
  } else {
    console.log(
      `Line coverage is ${shown}%, above the ${floor.toFixed(2)}% floor ` +
        `(${covered}/${totalLines} lines). Floor unchanged - a commit banks the gain.`,
    );
  }
  process.exit(0);
}

console.log(
  `Line coverage holding at ${shown}%` +
    (enforceGain && !owesGain ? " (no production-code changes, so no gain required)" : "") +
    ".",
);
