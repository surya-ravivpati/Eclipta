// send-lifecycle-email — the single gate every non-auth email passes through.
//
// Consolidating sends here means the rules that must never be skipped live in
// exactly one place:
//   1. Preference check (muted category / unsubscribed entirely).
//   2. Idempotency (an `idempotency_key` collision is a no-op, so a cron retry
//      or two overlapping workers cannot double-send).
//   3. Logging of every outcome, including skips — "why didn't it arrive?" has
//      to be answerable.
//
// Callers are trusted server-side jobs (cron) or the app itself; either way the
// caller supplies *what* to send and this function decides *whether* to.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deliver, unsubscribeUrl } from "../_shared/email/send.ts";
import {
  aiFollowUp,
  dailyDigest,
  eventNotification,
  guardianReport,
  reEngagement,
  streakSaver,
  weeklyReport,
  type Rendered,
} from "../_shared/email/templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Category =
  | "daily_digest"
  | "weekly_report"
  | "streak_saver"
  | "re_engagement"
  | "battle"
  | "forum"
  | "group"
  | "ai_followup"
  | "guardian_report";

interface Payload {
  category: Category;
  userId: string;
  /** Overrides the user's own address — used only for guardian reports. */
  toAddress?: string;
  /** Makes the send idempotent. Required: without it a retry double-sends. */
  idempotencyKey: string;
  data: Record<string, unknown>;
}

const APP_URL = Deno.env.get("APP_URL") ?? "https://ecliptalearning.vercel.app";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceRoleKey === "" || req.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return json({ error: "not authorized" }, 401);
  }

  const svc = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  try {
    const payload = (await req.json()) as Payload;
    const { category, userId, idempotencyKey } = payload;

    if (!category || !userId || !idempotencyKey) {
      return json({ error: "category, userId and idempotencyKey are required" }, 400);
    }

    // ── 1. Idempotency ──────────────────────────────────────────────────────
    // Claim the key first. Doing this before any work means a duplicate request
    // loses the race cheaply instead of rendering and sending a second copy.
    const { error: claimError } = await svc.from("email_log").insert({
      user_id: userId,
      category,
      to_address: payload.toAddress ?? "",
      subject: "",
      idempotency_key: idempotencyKey,
      status: "queued",
    });
    if (claimError) {
      // 23505 = unique violation ⇒ already handled by another run.
      if ((claimError as { code?: string }).code === "23505") {
        return json({ skipped: true, reason: "duplicate" });
      }
      return json({ error: claimError.message }, 500);
    }

    const finish = async (
      status: "sent" | "failed" | "skipped",
      detail: string | null,
      subject: string,
      providerId?: string,
    ) => {
      await svc
        .from("email_log")
        .update({
          status,
          detail,
          subject,
          provider_id: providerId ?? null,
          sent_at: status === "sent" ? new Date().toISOString() : null,
        })
        .eq("idempotency_key", idempotencyKey);
    };

    // ── 2. Preferences ──────────────────────────────────────────────────────
    const { data: prefs, error: prefError } = await svc.rpc("ensure_email_preferences", {
      p_user: userId,
    });
    const pref = prefs as {
      muted: string[];
      unsubscribed_all: boolean;
      unsubscribe_token: string;
    } | null;

    // Fail closed. An unreadable preferences row means we cannot know the user
    // consented, and cannot mint the token the unsubscribe footer needs — so
    // sending anyway would produce mail nobody can opt out of. Every other
    // failure here is recoverable; that one is not.
    if (prefError || !pref) {
      await finish("skipped", `preferences unavailable: ${prefError?.message ?? "no row"}`, "");
      return json({ skipped: true, reason: "preferences_unavailable" }, 503);
    }

    if (pref.unsubscribed_all) {
      await finish("skipped", "unsubscribed from all", "");
      return json({ skipped: true, reason: "unsubscribed" });
    }
    if (pref.muted?.includes(category)) {
      await finish("skipped", `muted: ${category}`, "");
      return json({ skipped: true, reason: "muted" });
    }

    // ── 3. Recipient ────────────────────────────────────────────────────────
    let to = payload.toAddress ?? "";
    let learnerName = "there";

    const { data: profile } = await svc
      .from("user_profiles")
      .select("username")
      .eq("user_id", userId)
      .maybeSingle();
    learnerName = profile?.username ?? "there";

    if (category === "guardian_report") {
      // Guardian mail goes only to a verified, unrevoked recipient. An
      // unverified address is a consent failure, not a delivery failure.
      const { data: recipient } = await svc
        .from("email_recipients")
        .select("email, verified_at, revoked_at")
        .eq("user_id", userId)
        .eq("email", to)
        .maybeSingle();
      if (!recipient?.verified_at || recipient.revoked_at) {
        await finish("skipped", "recipient not verified or revoked", "");
        return json({ skipped: true, reason: "unverified_recipient" });
      }
    } else if (!to) {
      const { data: authUser } = await svc.auth.admin.getUserById(userId);
      to = authUser?.user?.email ?? "";
    }

    if (!to) {
      await finish("skipped", "no destination address", "");
      return json({ skipped: true, reason: "no_address" });
    }

    // ── 4. Render ───────────────────────────────────────────────────────────
    const unsub = pref.unsubscribe_token
      ? unsubscribeUrl(APP_URL, pref.unsubscribe_token, category)
      : undefined;
    const ctx = { appUrl: APP_URL, name: learnerName, unsubscribeUrl: unsub };
    const d = payload.data as never;

    let rendered: Rendered;
    switch (category) {
      case "daily_digest":
        rendered = dailyDigest(ctx, d);
        break;
      case "weekly_report":
        rendered = weeklyReport(ctx, d);
        break;
      case "streak_saver":
        rendered = streakSaver(ctx, d);
        break;
      case "re_engagement":
        rendered = reEngagement(ctx, d);
        break;
      case "ai_followup":
        rendered = aiFollowUp(ctx, d);
        break;
      case "guardian_report":
        rendered = guardianReport({ ...ctx, learnerName }, d);
        break;
      case "battle":
      case "forum":
      case "group":
        rendered = eventNotification(ctx, { ...(d as object), category } as never);
        break;
      default:
        await finish("failed", `unknown category ${String(category)}`, "");
        return json({ error: "unknown category" }, 400);
    }

    // ── 5. Send ─────────────────────────────────────────────────────────────
    const result = await deliver({
      to,
      rendered,
      unsubscribeUrl: unsub,
      threadKey: category === "forum" ? `forum-${userId}` : undefined,
    });

    await finish(
      result.ok ? "sent" : "failed",
      result.detail ?? null,
      rendered.subject,
      result.providerId,
    );
    return json({ sent: result.ok, detail: result.detail });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "unhandled error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
