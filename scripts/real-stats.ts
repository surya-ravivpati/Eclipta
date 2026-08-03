/**
 * Pull a real learner's figures straight from Postgres, for test emails that
 * show actual numbers instead of invented ones.
 *
 * Reads tables directly rather than calling `get_digest_data`, so it works
 * before the email migration is deployed — and so a failure here is a data
 * problem rather than a deployment one.
 *
 * Needs a service-role key: these are other-people-readable tables under RLS,
 * and the point is to read a specific user's rows by email. That key bypasses
 * RLS entirely, so it belongs in a local shell and nowhere else.
 */
import { createClient } from "@supabase/supabase-js";
import type { DigestData, WeeklyData } from "../supabase/functions/_shared/email/templates.ts";

export interface RealStats {
  username: string;
  digest: DigestData;
  weekly: WeeklyData;
  guardian: {
    studyMinutes: number;
    activeDays: number;
    xpGained: number;
    strongest: { subject: string; confidence: number }[];
    weakest: { concept: string; subject: string }[];
    battles: { played: number; won: number };
  };
  streak: { streakDays: number; hoursLeft: number };
  weakestConcept: string;
  /** Anything that came back empty, so the caller can say so honestly. */
  gaps: string[];
}

export async function fetchRealStats(email: string): Promise<RealStats> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to pull real stats.\n" +
        "Supabase dashboard → Project Settings → API → service_role (secret).",
    );
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const gaps: string[] = [];

  // Find the account. listUsers is paginated; 1000 covers any realistic dev DB.
  const { data: users, error: userErr } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (userErr) throw new Error(`Could not list users: ${userErr.message}`);
  const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No account found for ${email}`);

  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const since1 = new Date(Date.now() - 86_400_000).toISOString();

  const [profile, xpWeek, xpDay, battles7, battles1, mastery, lessons7, lessons1] =
    await Promise.all([
      db
        .from("user_profiles")
        .select("username, xp, daily_streak, best_streak")
        .eq("user_id", user.id)
        .maybeSingle(),
      db
        .from("xp_award_log")
        .select("amount, awarded_at")
        .eq("user_id", user.id)
        .gte("awarded_at", since7),
      db.from("xp_award_log").select("amount").eq("user_id", user.id).gte("awarded_at", since1),
      db
        .from("battle_sessions")
        .select("won, correct_answers, total_questions, best_streak, created_at")
        .eq("user_id", user.id)
        .gte("created_at", since7),
      db
        .from("battle_sessions")
        .select("won, correct_answers, total_questions, best_streak")
        .eq("user_id", user.id)
        .gte("created_at", since1),
      db
        .from("concept_mastery")
        .select("concept, subject, confidence, evidence_count")
        .eq("user_id", user.id),
      db
        .from("learning_history")
        .select("created_at, response_time_ms")
        .eq("user_id", user.id)
        .gte("created_at", since7),
      db.from("learning_history").select("id").eq("user_id", user.id).gte("created_at", since1),
    ]);

  const username = profile.data?.username ?? email.split("@")[0] ?? "there";
  if (!profile.data) gaps.push("no user_profiles row");

  const sum = (rows: { amount: number }[] | null) => (rows ?? []).reduce((a, r) => a + r.amount, 0);
  const xpGainedWeek = sum(xpWeek.data);
  const xpGainedDay = sum(xpDay.data);
  if ((xpWeek.data ?? []).length === 0) gaps.push("no XP awarded in the last 7 days");

  const b7 = battles7.data ?? [];
  const b1 = battles1.data ?? [];
  if (b7.length === 0) gaps.push("no battles in the last 7 days");

  const correct7 = b7.reduce((a, b) => a + b.correct_answers, 0);
  const questions7 = b7.reduce((a, b) => a + b.total_questions, 0);

  // Study minutes per weekday, Mon-first, from question response times. This is
  // the only signal available — there is no session-duration table — so it
  // undercounts reading time. Better an honest floor than an invented figure.
  const studyMinutes = [0, 0, 0, 0, 0, 0, 0];
  for (const row of lessons7.data ?? []) {
    const d = new Date(row.created_at);
    const idx = (d.getDay() + 6) % 7; // JS Sunday=0 → Monday=0
    studyMinutes[idx] = (studyMinutes[idx] ?? 0) + (row.response_time_ms ?? 0) / 60_000;
  }
  const rounded = studyMinutes.map((m) => Math.round(m));
  if (rounded.every((m) => m === 0)) gaps.push("no measurable study time in the last 7 days");

  const m = mastery.data ?? [];
  if (m.length === 0) gaps.push("no concept_mastery rows");

  const bySubject = new Map<string, number[]>();
  for (const c of m) {
    const list = bySubject.get(c.subject) ?? [];
    list.push(c.confidence);
    bySubject.set(c.subject, list);
  }
  const strongest = [...bySubject.entries()]
    .map(([subject, cs]) => ({ subject, confidence: cs.reduce((a, b) => a + b, 0) / cs.length }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  const weakest = m
    .filter((c) => (c.evidence_count ?? 0) >= 2)
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 3)
    .map((c) => ({ concept: c.concept, subject: c.subject }));

  const activeDays = rounded.filter((x) => x > 0).length;

  return {
    username,
    digest: {
      xpGained: xpGainedDay,
      lessonsCompleted: (lessons1.data ?? []).length,
      battles: {
        played: b1.length,
        won: b1.filter((b) => b.won).length,
        correct: b1.reduce((a, b) => a + b.correct_answers, 0),
        questions: b1.reduce((a, b) => a + b.total_questions, 0),
      },
      dailyStreak: profile.data?.daily_streak ?? 0,
      friendActivity: [],
      recommendations: weakest.map((w) => w.concept),
    },
    weekly: {
      studyMinutes: rounded,
      // No historical snapshot exists to diff against, so growth is reported as
      // 0 rather than fabricated from a guess.
      masteryGrowth: 0,
      strongest,
      weakest,
      battles: {
        played: b7.length,
        won: b7.filter((b) => b.won).length,
        accuracy: questions7 > 0 ? Math.round((correct7 / questions7) * 100) : 0,
      },
      achievements: [],
      xpGained: xpGainedWeek,
    },
    guardian: {
      studyMinutes: rounded.reduce((a, b) => a + b, 0),
      activeDays,
      xpGained: xpGainedWeek,
      strongest,
      weakest,
      battles: { played: b7.length, won: b7.filter((b) => b.won).length },
    },
    streak: {
      streakDays: profile.data?.daily_streak ?? 0,
      // Hours until local midnight — when the streak actually lapses.
      hoursLeft: Math.max(1, 24 - new Date().getHours()),
    },
    weakestConcept: weakest[0]?.concept ?? "your weakest topic",
    gaps,
  };
}
