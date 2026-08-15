#!/usr/bin/env node
/**
 * Pre-commit prose check for public-facing text.
 *
 * Sends the prose a reader will actually see to prose-agent and blocks the
 * commit on any error *or* warning. Nothing below "clean" gets through.
 *
 * ── What "public-facing text" means here ────────────────────────────────────
 * Prose, not every string. prose-agent grades readability: grade level,
 * sentence length, passive voice, wordiness. Those are real measurements of a
 * paragraph and meaningless for a button label - "ATTACK" on its own comes back
 * as a grade-8.4 warning, and a hook that fails on every label is a hook people
 * turn off in a week.
 *
 * So two filters decide what gets sent:
 *
 *   1. PROSE_SOURCES - files that hold text shown to users outside the app's
 *      chrome: legal documents, the emails we send them, the marketing pages.
 *   2. MIN_WORDS - within those files, only strings long enough to be prose.
 *      A heading or a link label is not something a readability grader has an
 *      opinion about.
 *
 * Both are meant to be edited. Widen PROSE_SOURCES as more user-facing copy
 * appears; that list is the whole definition of what this hook governs.
 *
 * ── Honest limits ───────────────────────────────────────────────────────────
 * String literals are found by regex, not by parsing TypeScript. That is
 * deliberate - a full parse buys accuracy this does not need - but it means a
 * template literal with an interpolation in the middle is skipped rather than
 * analysed with a `${}` hole in it, and prose built at runtime is invisible.
 * The check is a floor on the copy we can see, not proof about every word.
 *
 * ── Only what this commit writes ────────────────────────────────────────────
 * The check reads the *added lines* of the staged diff, not whole files. The
 * legal documents alone carry 203 pre-existing issues, and they are drafts
 * awaiting counsel: blocking every unrelated commit until someone has reworded
 * a lawful-basis clause to hit grade 8 would get this hook deleted, not
 * obeyed. It is the same bargain the lint and coverage ratchets already make -
 * new work is held to the standard, existing work is improved deliberately
 * rather than under duress.
 *
 * `--all` still audits everything, for when improving the backlog *is* the job.
 *
 * Usage:
 *   node scripts/check-prose.mjs             prose added by the staged diff
 *   node scripts/check-prose.mjs --all       every source, ignoring git
 *   PROSE_AGENT_OPTIONAL=1 ...               network failure warns instead of
 *                                            blocking (see below)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const ENDPOINT = process.env["PROSE_AGENT_URL"] ?? "https://prose-agent.adityaperswal.workers.dev";

/**
 * Files whose strings are read by users rather than by us. This list *is* the
 * policy - a file not on it is not checked.
 */
const PROSE_SOURCES = [
  /^src\/content\/legal\//, // privacy policy, terms, community guidelines
  /^supabase\/functions\/_shared\/email\/templates\.ts$/, // mail we send people
  /^src\/routes\/about\.tsx$/, // the public about page
  /^src\/components\/landing\//, // marketing copy on the landing page
];

/** Shorter than this is a label, a heading or a fragment, not prose. */
const MIN_WORDS = 12;

/**
 * Matches "…" and '…' only.
 *
 * Template literals are deliberately excluded. They span lines and carry `${}`
 * holes, and a regex that tries to follow one runs off the end of the literal
 * and into the code after it - the first version of this script cheerfully
 * submitted `") : "", paragraph(` for grading. Missing some prose is a much
 * smaller problem than reporting on source code, which teaches people to
 * ignore the tool.
 */
const STRING_LITERAL = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g;

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

const ALL = process.argv.includes("--all");

function targetFiles() {
  const list = ALL
    ? git(["ls-files"])
    : git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  return list
    .split("\n")
    .filter(Boolean)
    .filter((f) => PROSE_SOURCES.some((re) => re.test(f)));
}

/**
 * The lines this commit adds to one file, as a blob to mine for literals.
 *
 * `-U0` so only genuinely added lines appear, never the surrounding context
 * that happens to sit near an edit - otherwise touching one line would
 * re-litigate every paragraph around it.
 */
function addedLines(file) {
  return git(["diff", "--cached", "-U0", "--", file])
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .join("\n");
}

const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Prose blocks from one file, as markdown paragraphs.
 *
 * Escapes are unfolded so `\"` and `\n` are graded as the reader sees them,
 * not as backslashes.
 */
function extractProse(path) {
  const src = ALL ? readFileSync(path, "utf8") : addedLines(path);
  const out = [];
  for (const m of src.matchAll(STRING_LITERAL)) {
    const raw = m[1] ?? m[2];
    if (!raw) continue;
    const text = raw
      .replace(/\\n/g, " ")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    // Anything still carrying markup, code punctuation or a placeholder is not
    // clean prose to grade; sending it produces noise about syntax rather than
    // about writing. Prose does use parentheses and semicolons, so this drops a
    // little real copy - the alternative is reporting on source code, which
    // trains people to ignore the tool.
    if (/[<>{}[\]]|\$\{|https?:\/\/|\/\/|=>|;|\w+:\s|\|/.test(text)) continue;
    if (wordCount(text) < MIN_WORDS) continue;
    out.push(text);
  }
  return out;
}

async function analyse(markdown) {
  const res = await fetch(`${ENDPOINT}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown }),
  });
  if (!res.ok) throw new Error(`prose-agent returned ${res.status}`);
  return res.json();
}

const files = targetFiles().filter((f) => existsSync(f));
if (files.length === 0) {
  console.log("check-prose: no public-facing copy in this commit.");
  process.exit(0);
}

let blocked = false;

for (const file of files) {
  const blocks = extractProse(file);
  if (blocks.length === 0) continue;

  let report;
  try {
    report = await analyse(blocks.join("\n\n"));
  } catch (error) {
    // A cold worker or a plane is not the same thing as bad writing, but
    // defaulting to "let it through" would mean the check quietly stops
    // existing the first time the network hiccups. Fail closed, and say
    // exactly how to proceed when that is genuinely the right call.
    const message =
      `check-prose: could not reach prose-agent (${error.message}).\n` +
      `  Blocking, because a check that silently skips itself is not a check.\n` +
      `  If you are offline and the copy is unchanged: PROSE_AGENT_OPTIONAL=1 git commit ...`;
    if (process.env["PROSE_AGENT_OPTIONAL"] === "1") {
      console.warn(`${message}\n  PROSE_AGENT_OPTIONAL=1 set - continuing.`);
      continue;
    }
    console.error(message);
    process.exit(1);
  }

  const { verdict, issues = [] } = report;
  // "No warnings allowed either" - so the gate is both counts at zero, not the
  // service's own `clean` flag, which tolerates some categories.
  const failing = issues.filter((i) => i.severity === "error" || i.severity === "warning");
  if (failing.length === 0) continue;

  blocked = true;
  console.error(
    `\ncheck-prose: ${file} - ${verdict.errorCount} error(s), ${verdict.warningCount} warning(s), ` +
      `reading at grade ${verdict.grade} (target ${verdict.targetGrade}):\n`,
  );
  for (const issue of failing.slice(0, 12)) {
    console.error(`  [${issue.severity}] ${issue.category}: ${issue.message}`);
    if (issue.excerpt) console.error(`      "${issue.excerpt.slice(0, 110)}"`);
    if (issue.fixHint) console.error(`      fix: ${issue.fixHint}`);
  }
  if (failing.length > 12) console.error(`  ...and ${failing.length - 12} more.`);
}

if (blocked) {
  console.error(
    `\nRewrite the copy above and commit again. To see everything at once:\n` +
      `  node scripts/check-prose.mjs --all\n`,
  );
  process.exit(1);
}

console.log(`check-prose: ${files.length} file(s) clean.`);
