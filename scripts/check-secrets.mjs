#!/usr/bin/env node
/**
 * Pre-commit secret scan.
 *
 * Runs on the staged diff only (fast, and it's exactly what's about to be
 * committed). Two checks:
 *
 *   1. A real env file (anything matching .env*, except *.example) staged
 *      for commit — belt-and-suspenders in case .gitignore is ever
 *      misconfigured or someone force-adds one.
 *   2. Known secret-token shapes appearing in the added lines of the diff:
 *      cloud-provider key prefixes, private-key PEM headers, and JWTs whose
 *      decoded payload carries a privileged role (service_role — the
 *      Supabase role that bypasses Row Level Security entirely).
 *
 * Not a replacement for real secret-scanning infrastructure (gitleaks,
 * trufflehog) — a deliberately small, dependency-free safety net that runs
 * on every commit with no setup. Exits non-zero and blocks the commit on
 * any hit.
 */
import { execSync } from "node:child_process";

function stagedFiles() {
  return execSync("git diff --cached --name-only --diff-filter=ACM", { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

function stagedDiff() {
  return execSync("git diff --cached -U0", { encoding: "utf8" });
}

const problems = [];

// ── Check 1: a real env file staged ──────────────────────────────────────
const ENV_FILE_RE = /(^|\/)\.env(\.[^.]+)?$/;
for (const file of stagedFiles()) {
  if (ENV_FILE_RE.test(file) && !file.endsWith(".example")) {
    problems.push(
      `Real env file staged: ${file}. Only *.env.example files should ever be committed.`,
    );
  }
}

// ── Check 2: known secret shapes in added lines ──────────────────────────
const addedLines = stagedDiff()
  .split("\n")
  .filter((l) => l.startsWith("+") && !l.startsWith("+++"));

const TOKEN_PATTERNS = [
  [/sk-(ant|proj)-[A-Za-z0-9_-]{10,}/, "an Anthropic/OpenAI-style secret key (sk-...)"],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/, "a Google API key (AIza...)"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "a GitHub token (ghp_/gho_/ghu_/ghs_/ghr_...)"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key ID (AKIA...)"],
  [/\bASIA[0-9A-Z]{16}\b/, "an AWS temporary access key ID (ASIA...)"],
  [/\bsb_secret_[A-Za-z0-9]{10,}\b/, "a Supabase secret key (sb_secret_...)"],
  [/xox[bpar]-[A-Za-z0-9-]{10,}/, "a Slack token (xox...)"],
  [/-----BEGIN (RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/, "a private key (PEM block)"],
];

for (const line of addedLines) {
  for (const [pattern, label] of TOKEN_PATTERNS) {
    if (pattern.test(line)) {
      problems.push(`Line looks like ${label}: ${line.slice(0, 80)}...`);
    }
  }

  // JWT with a privileged role in its payload (e.g. Supabase service_role,
  // which bypasses RLS - the one Supabase key that must never leave the
  // server). Decode rather than pattern-match the role name, since "eyJ..."
  // alone is far too common a false positive (every anon/publishable key
  // starts the same way, and those are meant to be public).
  const jwtMatches = line.matchAll(
    /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  );
  for (const [jwt] of jwtMatches) {
    const payloadSegment = jwt.split(".")[1];
    try {
      const padded = payloadSegment + "=".repeat((4 - (payloadSegment.length % 4)) % 4);
      const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
      const role = payload.role ?? payload.aud;
      if (role && /service_role|admin|root/i.test(String(role))) {
        problems.push(
          `JWT with privileged role "${role}" found in staged diff. Never commit this.`,
        );
      }
    } catch {
      // Not decodable as a JWT payload - not our concern here.
    }
  }
}

if (problems.length > 0) {
  console.error("\n🛑 check-secrets: possible secret(s) found in the staged diff:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\nIf this is a genuine secret: unstage it, rotate it if it was ever committed before, " +
      "and add the right pattern to .gitignore.\n" +
      "If this is a false positive: adjust scripts/check-secrets.mjs rather than bypassing the hook.\n",
  );
  process.exit(1);
}
