/**
 * Render every lifecycle email to a local HTML file for eyeballing.
 *
 *   bun scripts/preview-emails.ts        # writes .output/emails/*.html
 *   open .output/emails/index.html
 *
 * This answers "do the emails look right" with no Supabase, no Resend, no
 * network and no deploy — which is worth separating from "does delivery work",
 * because they fail for completely different reasons and you want to debug them
 * one at a time.
 *
 * The plain-text alternative is written alongside each .html as a .txt, because
 * that part is what spam filters read and what a watch renders, and it is the
 * half nobody ever looks at.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = ".output/emails";

const T =
  (await import("../supabase/functions/_shared/email/templates.ts")) as typeof import("../supabase/functions/_shared/email/templates.ts");

const ctx = {
  appUrl: "https://ecliptalearning.com",
  name: "Surya",
  unsubscribeUrl: "https://ecliptalearning.com/api/unsubscribe?token=preview",
};

// Realistic sample data. Deliberately not all-zeroes and not all-maxed: the
// interesting rendering bugs live in the middle, and in the empty states below.
const samples: Record<string, { subject: string; html: string; text: string }> = {
  "daily-digest": T.dailyDigest(ctx, {
    xpGained: 240,
    lessonsCompleted: 3,
    battles: { played: 4, won: 3, correct: 18, questions: 24 },
    dailyStreak: 47,
    leaderboard: { rank: 12, delta: 3 },
    friendActivity: ["ana_derives won 3 battles", "vector_solves hit a 20-day streak"],
    recommendations: ["Integration by parts", "Vectors: dot vs cross product"],
  }),

  // The empty state matters more than the full one — most digests are quiet.
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

mkdirSync(OUT, { recursive: true });

const rows: string[] = [];
for (const [name, r] of Object.entries(samples)) {
  writeFileSync(join(OUT, `${name}.html`), r.html);
  writeFileSync(join(OUT, `${name}.txt`), `Subject: ${r.subject}\n\n${r.text}`);
  rows.push(
    `<li><a href="${name}.html">${name}</a> — <code>${r.subject.replace(/</g, "&lt;")}</code> · <a href="${name}.txt">text</a></li>`,
  );
  console.log(`${name.padEnd(22)} ${r.subject}`);
}

writeFileSync(
  join(OUT, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Eclipta email previews</title>
<body style="font-family:system-ui;max-width:52rem;margin:3rem auto;padding:0 1rem;line-height:1.7">
<h1>Eclipta email previews</h1>
<p>Rendered locally. These are the exact bytes the send function would hand to the provider.</p>
<ul>${rows.join("")}</ul>
<p style="color:#666;font-size:.9rem">Dark by default — set your OS to light mode to check the light variant.
Gmail on Android ignores <code>prefers-color-scheme</code> entirely, so the dark version is what most people see.</p>
</body>`,
);

console.log(`\n${Object.keys(samples).length} previews → ${OUT}/index.html`);
