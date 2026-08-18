#!/usr/bin/env node
/**
 * Unit-test line-coverage ratchet, per file.
 *
 * Same shape as lint-ratchet.mjs and typecheck-ratchet.mjs — recorded numbers
 * that may improve but never regress — applied to each production file rather
 * than only to the project total.
 *
 * ── Why this replaced "every code commit adds a point" ──────────────────────
 * The original rule was a flat +1.00pp on the project total for any commit
 * touching src/. It worked, and it took coverage from 11.83% to 24.50%. Then it
 * stopped measuring what it was for.
 *
 * At 24.50% of 9,408 lines, a point costs 95 newly-covered lines. But 89% of
 * what remains uncovered is React components and route pages — JSX that a unit
 * test can only reach by rendering a whole screen with its data layer mocked.
 * Only 557 uncovered lines were pure logic, and ~104 of those are Web Audio
 * synthesis that cannot run in Node at all.
 *
 * That produced a perverse incentive, and it is worth naming plainly: the
 * cheapest way to satisfy a global gain is to write tests for a module you are
 * *not* changing. The gate asked for a number, and the number was easiest to
 * get somewhere other than the code under review — so it stopped being about
 * the commit in front of it.
 *
 * Worse, it was not actually strict where it counted. A commit could add a
 * hundred untested lines to a well-tested file and sail through, as long as it
 * bought its point elsewhere.
 *
 * ── The rule now ────────────────────────────────────────────────────────────
 *   1. **No file you touch may lose coverage.** Recorded per file. This is the
 *      guard the old rule was missing: adding untested code to a covered file
 *      now fails, and no amount of unrelated testing can buy it off.
 *   2. **A new production file must clear NEW_FILE_BAR.** New code is the code
 *      you can still cheaply choose to make testable.
 *   3. **The project total may never fall.** Unchanged, and still the backstop.
 *
 * Nothing demands a gain any more. Coverage climbs because (1) and (2) make it
 * the path of least resistance for the code actually being written, not because
 * a counter has to move.
 *
 * ── Checking never writes ───────────────────────────────────────────────────
 * Only `--advance` (which the pre-commit hook passes) records anything. An
 * earlier version banked improvements on any passing run, so checking your work
 * before committing quietly moved the goalposts. Running this by hand is free.
 *
 * Usage:
 *   node scripts/coverage-ratchet.mjs            check only, never writes
 *   node scripts/coverage-ratchet.mjs --staged   judge the staged diff
 *   node scripts/coverage-ratchet.mjs --advance  record improvements
 *   node scripts/coverage-ratchet.mjs --accept   force-record the current state
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(repoRoot, "coverage-baseline.json");
const summaryPath = join(repoRoot, "coverage", "coverage-summary.json");

/**
 * Line coverage a brand-new production file must reach.
 *
 * Deliberately not applied to existing files: 131 of 189 production files sit
 * below this today, almost all of them components, and a gate that fails on
 * every edit to them is one that gets bypassed. New files are where the choice
 * to write testable code is still free.
 */
const NEW_FILE_BAR = 60;

/**
 * How far a number may dip before it counts as a regression.
 *
 * Not float noise — real churn. Coverage is a ratio, and the formatter that
 * runs in lint-staged moves the denominator on its own: reflowing a few files
 * added 9 lines to one total here and dropped the figure by 0.01pp while not
 * one line of behaviour changed. A gate that fails on that is measuring
 * prettier.
 */
const EPSILON = 0.5;

/**
 * Executable lines a file needs before its *percentage* is worth judging.
 *
 * On a six-line file one line is sixteen points, so deleting a covered line -
 * or the formatter reflowing an import - swings the figure further than any
 * real change would. Below this, the honest question is not "did the ratio
 * fall" but "did this commit stop covering something", so the count is used
 * instead. Caught the first time this gate ran: removing two dead one-line
 * consts from battles/archetypes.ts read as 50% -> 33%.
 */
const MIN_LINES_FOR_PCT = 20;

/** The project total is a much larger denominator, so it needs far less slack. */
const TOTAL_EPSILON = 0.05;

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
 * Files this commit changes, from the staged index or from the diff against the
 * upstream branch. Falls back to an empty list rather than guessing: an unknown
 * diff should not invent an obligation.
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
  // shadcn owns these and regenerates them wholesale - see eslint.config.js.
  /^src\/components\/ui\//,
];

function isProduction(file) {
  return PRODUCTION.test(file) && !NOT_PRODUCTION.some((skip) => skip.test(file));
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

/** Coverage keys are absolute and platform-shaped; git paths are not. */
function toRepoPath(key) {
  const parts = key.split(/Eclipta[\\/]/);
  return (parts.length > 1 ? parts[parts.length - 1] : key).split("\\").join("/");
}

function readCoverage() {
  if (!existsSync(summaryPath)) {
    console.error(
      `No coverage summary at ${summaryPath}.\n` +
        `Ensure "json-summary" is in vitest.config.ts's coverage.reporter list.`,
    );
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(summaryPath, "utf8"));
  const files = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (key === "total") continue;
    const path = toRepoPath(key);
    // A file with no executable lines has nothing to say about coverage.
    if (isProduction(path) && entry.lines.total > 0) {
      files[path] = {
        pct: entry.lines.pct,
        covered: entry.lines.covered,
        total: entry.lines.total,
      };
    }
  }
  return {
    total: raw.total.lines.pct,
    covered: raw.total.lines.covered,
    totalLines: raw.total.lines.total,
    files,
  };
}

const accept = process.argv.includes("--accept");
/** Only a real commit may record anything - see "Checking never writes" above. */
const advance = process.argv.includes("--advance");

runCoverage();
const { total, covered, totalLines, files } = readCoverage();
const shown = total.toFixed(2);

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;

function write(nextTotal, nextFiles) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify(
      {
        lines: Number(nextTotal.toFixed(2)),
        covered,
        total: totalLines,
        newFileBar: NEW_FILE_BAR,
        files: Object.fromEntries(
          Object.entries(nextFiles)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([f, e]) => [f, { pct: Number(e.pct.toFixed(2)), covered: e.covered }]),
        ),
        updated: new Date().toISOString().slice(0, 10),
      },
      null,
      2,
    )}\n`,
  );

  // Stage it during a commit. The pre-commit hook runs after lint-staged, so a
  // file written here is not in the index yet: without this the record lands in
  // the working tree, the commit that earned it does not contain it, and every
  // commit afterwards starts with a dirty tree it did not create.
  if (advance) {
    try {
      execFileSync("git", ["add", "--", baselinePath], { stdio: "ignore" });
    } catch {
      // Not a commit, or nothing to stage. The record on disk is what matters.
    }
  }
}

if (accept || baseline === null || !baseline.files) {
  // No per-file record yet: adopt the current state as the starting point.
  write(total, files);
  const why = baseline && !baseline.files ? " (migrated to per-file tracking)" : "";
  console.log(`Coverage baseline set to ${shown}%${why}. Commit coverage-baseline.json.`);
  process.exit(0);
}

const floor = baseline.lines;
const recorded = baseline.files;
const changed = changedFiles().filter(isProduction);

// -- 1. No file this commit touched may lose coverage ------------------------
const regressed = [];
const belowBar = [];

for (const file of changed) {
  const now = files[file];
  // Deleted, or with nothing executable left in it - nothing to judge.
  if (now === undefined) continue;

  const before = recorded[file];
  if (before === undefined) {
    if (now.pct < NEW_FILE_BAR) belowBar.push({ file, now: now.pct });
    continue;
  }

  // On a small file the ratio is too coarse to mean anything, so ask whether
  // this commit stopped covering something instead.
  const lost =
    now.total < MIN_LINES_FOR_PCT ? now.covered < before.covered : now.pct < before.pct - EPSILON;

  if (lost) regressed.push({ file, before: before.pct, now: now.pct });
}

if (regressed.length > 0) {
  console.error(
    `Coverage fell in ${regressed.length} file(s) this commit changed:\n\n` +
      regressed
        .map(
          ({ file, before, now }) => `  ${file}\n      ${before.toFixed(1)}% -> ${now.toFixed(1)}%`,
        )
        .join("\n") +
      `\n\nCover what this commit added to them, or take the untested code back out.\n` +
      `Testing something else does not offset this - the rule is about the files\n` +
      `in front of you.`,
  );
  process.exit(1);
}

if (belowBar.length > 0) {
  console.error(
    `New production file(s) below the ${NEW_FILE_BAR}% bar:\n\n` +
      belowBar.map(({ file, now }) => `  ${file}\n      ${now.toFixed(1)}%`).join("\n") +
      `\n\nA new file is where making the code testable is still cheap. If this one\n` +
      `genuinely cannot be unit-tested - a screen, a canvas, a realtime wrapper -\n` +
      `keep the untestable part thin and put the logic somewhere that can be.`,
  );
  process.exit(1);
}

// -- 2. The project total may never fall -------------------------------------
if (total < floor - TOTAL_EPSILON) {
  console.error(
    `Line coverage fell from ${floor.toFixed(2)}% to ${shown}% ` +
      `(${covered}/${totalLines} lines).\n\n` +
      `No file this commit changed regressed, so this is the total moving on its\n` +
      `own - usually deleted tests, or a large untested file arriving. Check what\n` +
      `landed.`,
  );
  process.exit(1);
}

// -- 3. Record the improvements a commit earned ------------------------------
if (advance) {
  const merged = { ...recorded };
  let raised = 0;
  for (const [file, entry] of Object.entries(files)) {
    const before = merged[file];
    // Record the new state whenever it is not worse, so a deletion that moves
    // the denominator does not leave a floor the file can never meet again.
    if (before === undefined || entry.pct >= before.pct || entry.covered >= before.covered) {
      if (before !== undefined && entry.pct > before.pct + EPSILON) raised++;
      merged[file] = entry;
    }
  }
  // Drop files that no longer exist, so the baseline cannot rot.
  for (const file of Object.keys(merged)) {
    if (!(file in files)) delete merged[file];
  }

  const nextTotal = Math.max(floor, total);
  write(nextTotal, merged);

  const totalNote =
    total > floor + TOTAL_EPSILON
      ? `Total ${floor.toFixed(2)}% -> ${shown}%.`
      : `Total holding at ${shown}%.`;
  console.log(
    `${totalNote}${raised > 0 ? ` ${raised} file(s) improved.` : ""} ` +
      `Baseline recorded - commit coverage-baseline.json.`,
  );
  process.exit(0);
}

console.log(
  `Coverage holding at ${shown}% (${covered}/${totalLines} lines).` +
    (changed.length > 0 ? ` ${changed.length} production file(s) changed, none regressed.` : ""),
);
