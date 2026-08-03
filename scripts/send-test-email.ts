/**
 * Send one lifecycle email to a real inbox, bypassing all platform plumbing.
 *
 *   RESEND_API_KEY=re_xxx bun scripts/send-test-email.ts you@example.com
 *   RESEND_API_KEY=re_xxx bun scripts/send-test-email.ts you@example.com weekly-report
 *   RESEND_API_KEY=re_xxx bun scripts/send-test-email.ts you@example.com --all
 *
 * Deliberately talks to Resend directly rather than going through the edge
 * function. That skips the migration, the deploy, the secrets and the
 * preference checks, so "does this render in a real mail client" can be
 * answered before any of that exists — and when something looks wrong you know
 * it is the template, not the delivery path.
 *
 * ── About the sender ────────────────────────────────────────────────────────
 * Defaults to `onboarding@resend.dev`, which Resend pre-verifies for every
 * account. It only delivers to the address you signed up with, which is exactly
 * what you want for a test and is why no DNS setup is needed here. For real
 * sending you still need your own verified domain — see the note in
 * supabase/functions/_shared/email/send.ts about why a Gmail From address
 * cannot work.
 */
import * as T from "../supabase/functions/_shared/email/templates.ts";

const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "Eclipta <onboarding@resend.dev>";
const APP_URL = process.env.APP_URL ?? "https://ecliptalearning.com";

const ctx = {
  appUrl: APP_URL,
  name: "Surya",
  unsubscribeUrl: `${APP_URL}/api/unsubscribe?token=preview`,
};

const [to, which = "daily-digest"] = process.argv.slice(2);

if (!API_KEY) {
  console.error(`
Missing RESEND_API_KEY.

  1. Sign up free at https://resend.com (no card, 3k emails/month)
  2. API Keys → Create → copy the re_... value
  3. Re-run:

     RESEND_API_KEY=re_xxx bun scripts/send-test-email.ts you@example.com
`);
  process.exit(1);
}

if (!to || !to.includes("@")) {
  console.error(`
Usage: RESEND_API_KEY=re_xxx bun scripts/send-test-email.ts <your-email> [template]

Templates: ${Object.keys(build()).join(", ")}
Use --all to send every one.

With the default sender, Resend only delivers to the address you registered
with — use that one.
`);
  process.exit(1);
}

function build(): Record<string, T.Rendered> {
  return {
    "daily-digest": T.dailyDigest(ctx, {
      xpGained: 240,
      lessonsCompleted: 3,
      battles: { played: 4, won: 3, correct: 18, questions: 24 },
      dailyStreak: 47,
      leaderboard: { rank: 12, delta: 3 },
      friendActivity: ["ana_derives won 3 battles", "vector_solves hit a 20-day streak"],
      recommendations: ["Integration by parts", "Vectors: dot vs cross product"],
    }),
    "daily-digest-quiet": T.dailyDigest(ctx, {
      xpGained: 0,
      lessonsCompleted: 0,
      battles: { played: 0, won: 0, correct: 0, questions: 0 },
      dailyStreak: 12,
      friendActivity: [],
      recommendations: [],
    }),
    "weekly-report": T.weeklyReport(ctx, {
      studyMinutes: [30, 0, 45, 60, 15, 0, 25],
      masteryGrowth: 0.08,
      strongest: [
        { subject: "Physics", confidence: 0.82 },
        { subject: "Mathematics", confidence: 0.71 },
      ],
      weakest: [
        { concept: "Integration by parts", subject: "Mathematics" },
        { concept: "Redox reactions", subject: "Chemistry" },
      ],
      battles: { played: 9, won: 6, accuracy: 71 },
      achievements: ["Gold Chest", "Flawless Week"],
      xpGained: 1240,
    }),
    "streak-saver": T.streakSaver(ctx, { streakDays: 47, hoursLeft: 2 }),
    "forum-reply": T.eventNotification(ctx, {
      kind: "forum_reply",
      actor: "ana_derives",
      excerpt: "Try substitution first — the sign flips when you move the 2 across.",
      link: "/forum/123",
      category: "forum",
    }),
    "battle-challenge": T.eventNotification(ctx, {
      kind: "battle_challenge",
      actor: "vector_solves",
      link: "/battles",
      category: "battle",
    }),
    "ai-followup": T.aiFollowUp(ctx, { concept: "Integration by parts", attempts: 4 }),
    "guardian-report": T.guardianReport(
      { ...ctx, learnerName: "Surya" },
      {
        studyMinutes: 175,
        activeDays: 5,
        xpGained: 1240,
        strongest: [{ subject: "Physics", confidence: 0.82 }],
        weakest: [{ concept: "Integration by parts", subject: "Mathematics" }],
        battles: { played: 9, won: 6 },
      },
    ),
  };
}

async function send(name: string, r: T.Rendered): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      // Tagged so a run of --all is sortable in the inbox rather than eight
      // messages with unrelated subjects.
      subject: `[${name}] ${r.subject}`,
      html: r.html,
      // Always multipart — the text part is half of what you are testing.
      text: r.text,
    }),
  });

  if (res.ok) {
    const json = (await res.json()) as { id?: string };
    console.log(`  ✓ ${name.padEnd(22)} ${json.id ?? ""}`);
    return true;
  }

  const detail = await res.text();
  console.log(`  ✗ ${name.padEnd(22)} ${res.status} ${detail.slice(0, 200)}`);
  // The two failures that actually happen, and what they mean.
  if (res.status === 403 && detail.includes("testing emails")) {
    console.log(
      `    → The default sender only delivers to the address you registered with Resend.\n` +
        `      Use that address, or verify a domain and set EMAIL_FROM.`,
    );
  }
  if (res.status === 401) console.log(`    → API key rejected. Check RESEND_API_KEY.`);
  return false;
}

const all = build();
const chosen =
  which === "--all" ? Object.entries(all) : [[which, all[which]] as [string, T.Rendered]];

if (!chosen[0]?.[1]) {
  console.error(`Unknown template "${which}". Available: ${Object.keys(all).join(", ")}`);
  process.exit(1);
}

console.log(`Sending to ${to} as ${FROM}\n`);
let ok = 0;
for (const [name, r] of chosen) {
  if (await send(name, r)) ok++;
  // Resend's free tier rate-limits; a short gap keeps --all from tripping it.
  if (chosen.length > 1) await new Promise((r2) => setTimeout(r2, 600));
}
console.log(`\n${ok}/${chosen.length} sent. Check your inbox — and your spam folder.`);
process.exit(ok === chosen.length ? 0 : 1);
