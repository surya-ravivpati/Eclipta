import {
  barChart,
  button,
  divider,
  esc,
  heading,
  insight,
  list,
  paragraph,
  renderEmail,
  spacer,
  stats,
  type Stat,
} from "./design.ts";

/**
 * Lifecycle email templates.
 *
 * Every template returns a subject, an HTML body and a plain-text alternative.
 * The text part is not optional: a multipart message without one is scored as
 * spam by most filters, and it is what a watch or a screen reader in plain-text
 * mode actually reads.
 */

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

export interface Ctx {
  appUrl: string;
  name: string;
  unsubscribeUrl?: string;
}

const pluralDays = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

// ─── Daily digest ────────────────────────────────────────────────────────────

export interface DigestData {
  xpGained: number;
  lessonsCompleted: number;
  battles: { played: number; won: number; correct: number; questions: number };
  dailyStreak: number;
  leaderboard?: { rank: number; delta: number };
  friendActivity: string[];
  recommendations: string[];
}

export function dailyDigest(ctx: Ctx, d: DigestData): Rendered {
  const accuracy =
    d.battles.questions > 0 ? Math.round((d.battles.correct / d.battles.questions) * 100) : null;

  const figures: Stat[] = [
    { label: "XP gained", value: `+${d.xpGained}` },
    { label: "Lessons", value: String(d.lessonsCompleted) },
    {
      label: "Battles",
      value: d.battles.played > 0 ? `${d.battles.won}/${d.battles.played}` : "—",
    },
    { label: "Streak", value: `${d.dailyStreak}d` },
  ];
  if (d.leaderboard) {
    figures.push({
      label: "Rank",
      value: `#${d.leaderboard.rank}`,
      delta: {
        text:
          d.leaderboard.delta === 0
            ? "no change"
            : `${Math.abs(d.leaderboard.delta)} ${Math.abs(d.leaderboard.delta) === 1 ? "place" : "places"}`,
        direction: d.leaderboard.delta > 0 ? "up" : d.leaderboard.delta < 0 ? "down" : "flat",
      },
    });
  }

  // A digest with nothing in it should say so plainly rather than present a
  // wall of zeroes as if it were progress.
  const quiet = d.xpGained === 0 && d.lessonsCompleted === 0 && d.battles.played === 0;

  const body = [
    heading(
      quiet ? "A quiet day" : "Yesterday on Eclipta",
      quiet
        ? "Nothing logged yesterday — a single lesson is enough to pick the thread back up."
        : `Here's how ${ctx.name} did.`,
    ),
    quiet ? "" : stats(figures),
    accuracy !== null
      ? paragraph(`You answered <strong>${accuracy}%</strong> of battle questions correctly.`)
      : "",
    d.friendActivity.length > 0 ? list("From people you follow", d.friendActivity) : "",
    d.recommendations.length > 0 ? list("Suggested next", d.recommendations) : "",
    button("Continue learning", `${ctx.appUrl}/courses`),
    spacer(),
  ].join("");

  return {
    subject: quiet
      ? "Pick your streak back up"
      : `+${d.xpGained} XP yesterday${d.battles.played > 0 ? ` · ${d.battles.won}/${d.battles.played} battles` : ""}`,
    html: renderEmail({
      preheader: quiet
        ? "One lesson is enough to keep going."
        : `${d.xpGained} XP, ${d.lessonsCompleted} lessons, ${d.dailyStreak}-day streak.`,
      title: "Your daily digest",
      bodyHtml: body,
      unsubscribeUrl: ctx.unsubscribeUrl,
      categoryLabel: "daily digests",
      appUrl: ctx.appUrl,
    }),
    text: [
      quiet ? "A quiet day on Eclipta." : "Yesterday on Eclipta",
      "",
      `XP gained: +${d.xpGained}`,
      `Lessons completed: ${d.lessonsCompleted}`,
      `Battles: ${d.battles.won} won of ${d.battles.played}`,
      `Streak: ${pluralDays(d.dailyStreak)}`,
      d.leaderboard ? `Leaderboard: #${d.leaderboard.rank} (${d.leaderboard.delta >= 0 ? "+" : ""}${d.leaderboard.delta})` : "",
      "",
      ...d.friendActivity.map((f) => `- ${f}`),
      ...d.recommendations.map((r) => `- ${r}`),
      "",
      `Continue learning: ${ctx.appUrl}/courses`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ─── Weekly report ───────────────────────────────────────────────────────────

export interface WeeklyData {
  studyMinutes: number[];
  masteryGrowth: number;
  strongest: { subject: string; confidence: number }[];
  weakest: { concept: string; subject: string }[];
  battles: { played: number; won: number; accuracy: number };
  achievements: string[];
  xpGained: number;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function weeklyReport(ctx: Ctx, d: WeeklyData): Rendered {
  const totalMin = d.studyMinutes.reduce((a, b) => a + b, 0);
  const peak = Math.max(1, ...d.studyMinutes);
  const hours = (totalMin / 60).toFixed(1);

  // The insight is derived, not random: it names the specific thing the data
  // says. A generic "keep going!" is noise, and users learn to ignore it.
  const bestDayIdx = d.studyMinutes.indexOf(peak);
  const activeDays = d.studyMinutes.filter((m) => m > 0).length;
  const insightText =
    totalMin === 0
      ? "No study time logged this week. The hardest part is the first ten minutes — everything after that is easier."
      : activeDays >= 5
        ? `You studied on ${activeDays} of 7 days. Consistency like that is what moves mastery, not marathon sessions.`
        : d.masteryGrowth > 0
          ? `Mastery rose ${Math.round(d.masteryGrowth * 100)}% across your subjects — steady progress on ${activeDays} active ${activeDays === 1 ? "day" : "days"}.`
          : `${DAY_LABELS[bestDayIdx] ?? "One day"} was your strongest day. Repeating that slot next week is the cheapest way to build a habit.`;

  const body = [
    heading("Your week in review", `${hours} hours of study · +${d.xpGained} XP`),
    barChart(
      d.studyMinutes.map((m, i) => ({
        label: DAY_LABELS[i] ?? `Day ${i + 1}`,
        value: m,
        max: peak,
        note: m === 0 ? "—" : `${m} min`,
      })),
    ),
    divider(),
    stats([
      { label: "Study time", value: `${hours}h` },
      { label: "Battles won", value: `${d.battles.won}/${d.battles.played}` },
      { label: "Accuracy", value: `${d.battles.accuracy}%` },
      {
        label: "Mastery",
        value: `${d.masteryGrowth >= 0 ? "+" : ""}${Math.round(d.masteryGrowth * 100)}%`,
        delta: {
          text: "this week",
          direction: d.masteryGrowth > 0 ? "up" : d.masteryGrowth < 0 ? "down" : "flat",
        },
      },
    ]),
    d.strongest.length > 0
      ? barChart(
          d.strongest.map((s) => ({
            label: s.subject,
            value: Math.round(s.confidence * 100),
            max: 100,
            note: `${Math.round(s.confidence * 100)}% confidence`,
          })),
        )
      : "",
    d.weakest.length > 0
      ? list(
          "Worth revisiting",
          d.weakest.map((w) => `${w.concept} (${w.subject})`),
        )
      : "",
    d.achievements.length > 0 ? list("Unlocked this week", d.achievements) : "",
    insight(insightText),
    button("Open your progress", `${ctx.appUrl}/progress`),
    spacer(),
  ].join("");

  return {
    subject: `Your week: ${hours}h studied, ${d.battles.won} battles won`,
    html: renderEmail({
      preheader: `${hours} hours, +${d.xpGained} XP, ${d.battles.won} wins.`,
      title: "Your weekly progress report",
      bodyHtml: body,
      unsubscribeUrl: ctx.unsubscribeUrl,
      categoryLabel: "weekly reports",
      appUrl: ctx.appUrl,
    }),
    text: [
      "Your week in review",
      "",
      `Study time: ${hours} hours`,
      ...d.studyMinutes.map((m, i) => `  ${DAY_LABELS[i]}: ${m} min`),
      `XP gained: +${d.xpGained}`,
      `Battles: ${d.battles.won} of ${d.battles.played} won, ${d.battles.accuracy}% accuracy`,
      `Mastery growth: ${Math.round(d.masteryGrowth * 100)}%`,
      "",
      d.strongest.length ? `Strongest: ${d.strongest.map((s) => s.subject).join(", ")}` : "",
      d.weakest.length ? `Worth revisiting: ${d.weakest.map((w) => w.concept).join(", ")}` : "",
      d.achievements.length ? `Unlocked: ${d.achievements.join(", ")}` : "",
      "",
      insightText,
      "",
      `${ctx.appUrl}/progress`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ─── Streak saver ────────────────────────────────────────────────────────────

/**
 * The one email where urgency is honest: the streak really does end, and the
 * user really can prevent it. Deliberately short — a long email defeats a
 * message whose entire point is "do one small thing now".
 */
export function streakSaver(
  ctx: Ctx,
  d: { streakDays: number; hoursLeft: number },
): Rendered {
  const body = [
    heading(
      `Your ${pluralDays(d.streakDays)} streak ends soon`,
      `You've maintained your streak for ${pluralDays(d.streakDays)}. Complete one lesson in the next ${d.hoursLeft} ${d.hoursLeft === 1 ? "hour" : "hours"} to keep it alive.`,
    ),
    // Straight into the app on the shortest possible path — a streak-saver that
    // lands on a dashboard has already lost.
    button("Continue learning", `${ctx.appUrl}/courses?resume=1`),
    paragraph(
      `One lesson is enough. It usually takes about five minutes.`,
    ),
    spacer(),
  ].join("");

  return {
    subject: `${d.hoursLeft}h left to save your ${d.streakDays}-day streak`,
    html: renderEmail({
      preheader: `One lesson keeps your ${pluralDays(d.streakDays)} streak alive.`,
      title: "Save your streak",
      bodyHtml: body,
      unsubscribeUrl: ctx.unsubscribeUrl,
      categoryLabel: "streak reminders",
      appUrl: ctx.appUrl,
    }),
    text: `You've maintained your streak for ${pluralDays(d.streakDays)}.\n\nComplete one lesson in the next ${d.hoursLeft} hours to keep it alive.\n\n${ctx.appUrl}/courses?resume=1`,
  };
}

// ─── Event notifications (battle / forum / group) ─────────────────────────────

export type EventKind =
  | "battle_challenge"
  | "battle_promotion"
  | "forum_reply"
  | "forum_mention"
  | "forum_accepted"
  | "forum_vote"
  | "group_announcement"
  | "group_resource";

const EVENT_COPY: Record<EventKind, { title: (a: string) => string; cta: string }> = {
  battle_challenge: { title: (a) => `${a} challenged you to a battle`, cta: "Accept the challenge" },
  battle_promotion: { title: () => "You're one win from promotion", cta: "Play a ranked battle" },
  forum_reply: { title: (a) => `${a} replied to your thread`, cta: "Read the reply" },
  forum_mention: { title: (a) => `${a} mentioned you`, cta: "See the mention" },
  forum_accepted: { title: () => "Your answer was accepted", cta: "View the thread" },
  forum_vote: { title: (a) => `${a} upvoted your answer`, cta: "View the thread" },
  group_announcement: { title: (a) => `New announcement in ${a}`, cta: "Open the group" },
  group_resource: { title: (a) => `New resource shared in ${a}`, cta: "Open the group" },
};

export function eventNotification(
  ctx: Ctx,
  d: { kind: EventKind; actor: string; excerpt?: string; link: string; category: string },
): Rendered {
  const copy = EVENT_COPY[d.kind];
  const title = copy.title(d.actor);
  const body = [
    heading(title),
    d.excerpt ? insight(d.excerpt) : "",
    button(copy.cta, `${ctx.appUrl}${d.link}`),
    spacer(),
  ].join("");

  return {
    subject: title,
    html: renderEmail({
      preheader: d.excerpt ?? title,
      title,
      bodyHtml: body,
      unsubscribeUrl: ctx.unsubscribeUrl,
      categoryLabel: `${d.category} notifications`,
      appUrl: ctx.appUrl,
    }),
    text: `${title}\n\n${d.excerpt ? `"${d.excerpt}"\n\n` : ""}${ctx.appUrl}${d.link}`,
  };
}

// ─── AI follow-up ────────────────────────────────────────────────────────────

/**
 * Sent when a learner has missed the same concept repeatedly. Framed as an offer
 * rather than a correction — "you got this wrong four times" is accurate and
 * demotivating, which makes it useless.
 */
export function aiFollowUp(
  ctx: Ctx,
  d: { concept: string; attempts: number; threadLink?: string },
): Rendered {
  const body = [
    heading("Need another explanation?", `${d.concept} has come up a few times.`),
    paragraph(
      `Sometimes a concept just needs a different angle. Luna can walk through ${esc(d.concept)} again — a fresh explanation, at your pace, as many times as you want.`,
    ),
    button("Ask Luna about this", `${ctx.appUrl}${d.threadLink ?? `/luna?topic=${encodeURIComponent(d.concept)}`}`),
    spacer(),
  ].join("");

  return {
    subject: `Another look at ${d.concept}?`,
    html: renderEmail({
      preheader: `A fresh explanation of ${d.concept}, whenever you want it.`,
      title: "Need another explanation?",
      bodyHtml: body,
      unsubscribeUrl: ctx.unsubscribeUrl,
      categoryLabel: "study follow-ups",
      appUrl: ctx.appUrl,
    }),
    text: `Need another explanation?\n\n${d.concept} has come up a few times. Luna can walk through it again, at your pace.\n\n${ctx.appUrl}/luna?topic=${encodeURIComponent(d.concept)}`,
  };
}

// ─── Guardian / teacher report ───────────────────────────────────────────────

/**
 * Weekly summary for a consent-verified guardian or teacher.
 *
 * Reports what the platform actually measures. Attendance and assignments were
 * requested but Eclipta has no class-roster or assignment model, so inventing
 * those figures would be worse than omitting them — a guardian would act on
 * numbers that mean nothing.
 */
export function guardianReport(
  ctx: Ctx & { learnerName: string },
  d: {
    studyMinutes: number;
    activeDays: number;
    xpGained: number;
    strongest: { subject: string; confidence: number }[];
    weakest: { concept: string; subject: string }[];
    battles: { played: number; won: number };
  },
): Rendered {
  const hours = (d.studyMinutes / 60).toFixed(1);
  const body = [
    heading(
      `${ctx.learnerName}'s week`,
      `${hours} hours of study across ${d.activeDays} ${d.activeDays === 1 ? "day" : "days"}.`,
    ),
    stats([
      { label: "Study time", value: `${hours}h` },
      { label: "Active days", value: `${d.activeDays}/7` },
      { label: "XP earned", value: `+${d.xpGained}` },
      { label: "Battles", value: `${d.battles.won}/${d.battles.played}` },
    ]),
    d.strongest.length > 0
      ? barChart(
          d.strongest.map((s) => ({
            label: s.subject,
            value: Math.round(s.confidence * 100),
            max: 100,
            note: `${Math.round(s.confidence * 100)}% mastery`,
          })),
        )
      : "",
    d.weakest.length > 0
      ? list(
          "Where support would help most",
          d.weakest.map((w) => `${w.concept} (${w.subject})`),
        )
      : "",
    divider(),
    paragraph(
      `This summary is shared with you by ${esc(ctx.learnerName)}. They can stop it at any time, and so can you using the link below.`,
    ),
    spacer(),
  ].join("");

  return {
    subject: `${ctx.learnerName}'s weekly progress`,
    html: renderEmail({
      preheader: `${hours} hours studied across ${d.activeDays} days.`,
      title: `${ctx.learnerName}'s weekly progress`,
      bodyHtml: body,
      unsubscribeUrl: ctx.unsubscribeUrl,
      categoryLabel: "progress reports",
      appUrl: ctx.appUrl,
    }),
    text: [
      `${ctx.learnerName}'s week`,
      "",
      `Study time: ${hours} hours across ${d.activeDays} of 7 days`,
      `XP earned: +${d.xpGained}`,
      `Battles: ${d.battles.won} of ${d.battles.played} won`,
      d.strongest.length ? `Strongest: ${d.strongest.map((s) => s.subject).join(", ")}` : "",
      d.weakest.length ? `Needs support: ${d.weakest.map((w) => w.concept).join(", ")}` : "",
      "",
      `Shared with you by ${ctx.learnerName}, who can stop it at any time.`,
      "",
      `View the full report: ${ctx.appUrl}/progress`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
