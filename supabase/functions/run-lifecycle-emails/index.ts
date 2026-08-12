// run-lifecycle-emails — the hourly sweep, triggered by pg_cron.
//
// Three jobs, in order:
//   1. Page through the users who could receive lifecycle mail.
//   2. Ask the pure decision module which one email each of them should get.
//   3. Hand each decision to send-lifecycle-email, which is still the only
//      thing that sends — so the preference check, the idempotency claim and
//      the log entry all keep happening in exactly one place.
//
// Nothing here decides *whether* to send: that is schedule.ts, which is unit
// tested. Nothing here sends: that is send-lifecycle-email. This function only
// moves work between them, which is why it can be interrupted safely — a sweep
// that dies halfway leaves the remaining users for the next hour, and the ones
// already handled are protected by their idempotency keys.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decideLifecycleEmails,
  type LifecycleCandidate,
  type LifecycleDecision,
} from "../_shared/email/schedule.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Bounds, so one sweep cannot outlive the edge runtime's wall clock. */
const PAGE_SIZE = 500;
const MAX_PAGES = 40;
const MAX_SENDS_PER_RUN = 300;
/** Resend rate-limits, and each send is a separate function invocation. */
const SEND_CONCURRENCY = 4;

interface CandidateRow {
  user_id: string;
  daily_streak: number | null;
  last_practice_date: string | null;
  last_activity_at: string | null;
  local_hour: number;
  local_weekday: number;
  digest_hour: number;
  muted: string[] | null;
  last_sent: Record<string, string> | null;
  last_topic: string | null;
}

interface WeeklyRow {
  xp_gained: number;
  study_minutes: number[];
  battles: { played: number; won: number; accuracy: number };
  strongest: { subject: string; confidence: number }[];
  weakest: { concept: string; subject: string }[];
}

interface SweepSummary {
  scanned: number;
  decided: number;
  sent: number;
  skipped: number;
  failed: number;
  byKind: Record<string, number>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // Same gate as send-lifecycle-email: only something that already holds the
  // service-role key may start a sweep. A public sweep endpoint would let a
  // stranger burn the whole send quota.
  if (serviceRoleKey === "" || req.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return json({ error: "not authorized" }, 401);
  }

  const svc = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
    const dryRun = body.dryRun === true;
    const now = new Date();

    const summary: SweepSummary = {
      scanned: 0,
      decided: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      byKind: {},
    };
    const decisions: LifecycleDecision[] = [];

    let after = "00000000-0000-0000-0000-000000000000";
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await svc.rpc("get_lifecycle_email_candidates", {
        p_now: now.toISOString(),
        p_limit: PAGE_SIZE,
        p_after: after,
      });
      if (error) return json({ error: error.message }, 500);

      const rows = (data ?? []) as CandidateRow[];
      if (rows.length === 0) break;

      summary.scanned += rows.length;
      decisions.push(...decideLifecycleEmails(rows.map(toCandidate), now));

      after = rows[rows.length - 1].user_id;
      if (rows.length < PAGE_SIZE) break;
      if (decisions.length >= MAX_SENDS_PER_RUN) break;
    }

    const due = decisions.slice(0, MAX_SENDS_PER_RUN);
    summary.decided = due.length;
    for (const d of due) summary.byKind[d.kind] = (summary.byKind[d.kind] ?? 0) + 1;

    if (dryRun) {
      return json({ dryRun: true, ...summary, decisions: due.map((d) => ({ ...d })) });
    }

    for (let i = 0; i < due.length; i += SEND_CONCURRENCY) {
      const batch = due.slice(i, i + SEND_CONCURRENCY);
      const results = await Promise.all(
        batch.map((d) => dispatch(svc, supabaseUrl, serviceRoleKey, d)),
      );
      for (const r of results) summary[r] += 1;
    }

    return json(summary);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "unhandled error" }, 500);
  }
});

function toCandidate(row: CandidateRow): LifecycleCandidate {
  return {
    userId: row.user_id,
    dailyStreak: row.daily_streak ?? 0,
    lastPracticeDate: row.last_practice_date,
    lastActivityAt: row.last_activity_at,
    localHour: row.local_hour,
    localWeekday: row.local_weekday,
    digestHour: row.digest_hour,
    muted: row.muted ?? [],
    lastSentAt: row.last_sent ?? {},
    lastTopic: row.last_topic,
  };
}

/** Send one decision through the gate. Never throws: one bad user must not end the sweep. */
async function dispatch(
  svc: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  decision: LifecycleDecision,
): Promise<"sent" | "skipped" | "failed"> {
  try {
    const data = await payloadFor(svc, decision);
    if (!data) return "failed";

    const res = await fetch(`${supabaseUrl}/functions/v1/send-lifecycle-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category: decision.kind,
        userId: decision.userId,
        idempotencyKey: decision.idempotencyKey,
        data,
      }),
    });

    if (!res.ok) return "failed";
    const result = (await res.json()) as { sent?: boolean; skipped?: boolean };
    if (result.sent) return "sent";
    return result.skipped ? "skipped" : "failed";
  } catch {
    return "failed";
  }
}

/** The template data for one decision, or null if the figures could not be read. */
async function payloadFor(
  svc: SupabaseClient,
  decision: LifecycleDecision,
): Promise<Record<string, unknown> | null> {
  if (decision.kind === "streak_saver") {
    return { streakDays: decision.streakDays, hoursLeft: decision.hoursLeft };
  }
  if (decision.kind === "re_engagement") {
    return { daysAway: decision.daysAway, topic: decision.topic };
  }

  const { data, error } = await svc.rpc("get_weekly_report_data", {
    p_user: decision.userId,
    p_since: decision.since,
  });
  if (error || !data) return null;

  const w = data as WeeklyRow;
  return {
    studyMinutes: w.study_minutes ?? [0, 0, 0, 0, 0, 0, 0],
    // No historical mastery snapshot exists to diff against, so growth is
    // reported as zero rather than fabricated — the same call scripts/real-stats.ts makes.
    masteryGrowth: 0,
    strongest: w.strongest ?? [],
    weakest: w.weakest ?? [],
    battles: w.battles ?? { played: 0, won: 0, accuracy: 0 },
    // Achievements are not modelled as a queryable per-week list; an empty
    // section is honest, an invented one is not.
    achievements: [],
    xpGained: w.xp_gained ?? 0,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
