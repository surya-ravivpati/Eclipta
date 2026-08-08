/* eslint-disable @typescript-eslint/no-explicit-any */
// moderate-content — the ONE shared moderation pipeline for all three surfaces
// (forum posts, usernames, study-room chat). Called as moderate(content,
// surface, author_context). Two layers combine into one decision:
//
//   Layer A — deterministic, in-process, zero external dependency:
//             moderation_scan() = dictionary (slurs/hate/sexual/...) + pattern
//             scan (PII, scam links). Always runs, even if everything else is down.
//   Layer B — contextual AI classifier (harassment intent, veiled threats,
//             coded hate, sexual content, and self-harm DETECTION). A distinct,
//             UNBRANDED system call — never "Luna" in any user-facing copy.
//
// Decisions: allow | flag (posts, enters human review queue) | block (rejected
// pre-save). Self-harm is its OWN path: supportive resources to the author +
// a quiet wellbeing alert to a reviewer — never a punitive block (it can co-occur
// with a real violation against someone else, in which case both apply).
//
// Fail-safe: if Layer B is unavailable, fall back to Layer A; if Layer A is
// clean, ALLOW and queue an async re-scan (never block the platform on an AI
// hiccup, never silently skip the re-check).
//
// Modes: 'check' (pre-submit gate — verdict only, no side effects) and 'record'
// (authoritative — logs the decision, queues flags, routes self-harm, applies
// the repeat-offender soft-pause). This same function is the on-demand re-scan
// entry the reporting system will call.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AI_GATEWAY_URL, AI_GATEWAY_API_KEY } from "../_shared/ai.ts";
import { checkAiRateLimit } from "../_shared/ai-rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TargetType = "thread" | "answer" | "comment" | "username" | "chat_message";
type Decision = "allow" | "flag" | "block";

const SURFACE_OF: Record<TargetType, string> = {
  thread: "forum",
  answer: "forum",
  comment: "forum",
  username: "username",
  chat_message: "chat",
};

// Unbranded moderation classifier. Deliberately NOT "Luna" — moderation must
// never be attributed to the product's assistant persona.
const SYSTEM_PROMPT = `You are an automated content-safety classifier for a learning community (forums, usernames, study-room chat). You judge ONLY genuine harm — never normal off-topic banter, frustration, debate, or technical jargon ("kill the process", "abort", "execute" are safe).

Return ONLY one JSON object, no prose:
{"verdict":"allow|flag|block","category":"hate|harassment|sexual|violence|scam|spam|pii|doxxing|impersonation|self_harm|none","confidence":0-100,"self_harm":true|false}

Definitions:
- "block": clearly harmful, must never be public — slurs/hate vs a protected group, credible threats, sexual content involving minors, explicit sexual content, doxxing (sharing someone's private info), scams/phishing, targeted harassment telling a person to harm/kill themselves.
- "flag": borderline / needs a human — possible harassment intent, veiled threat, coded hate, suggestive-not-explicit, aggressive profanity at a person. Posts but is queued for review.
- "allow": safe.

self_harm: set TRUE when the AUTHOR expresses suicidal thoughts or self-harm about THEMSELVES (e.g. "I want to end it", "I can't go on"). This is NOT a violation by them — usually verdict "allow" UNLESS the same text also harasses/targets someone else (then judge the violation normally and still set self_harm true). Telling ANOTHER person to kill themselves is harassment (block), not self_harm.

Usernames (short context-free strings): bias toward block for any slur, sexual term, or impersonation of staff/official accounts.`;

interface AiVerdict {
  decision: Decision;
  category: string;
  confidence: number;
  self_harm: boolean;
  available: boolean; // false when the classifier could not be reached
}

async function classifyWithAi(
  text: string,
  targetType: TargetType,
  apiKey: string,
  note?: string,
): Promise<AiVerdict> {
  const trimmed = text.slice(0, 4000);
  // A reporter's note is EXTRA CONTEXT for ambiguous cases only — never
  // authoritative. The classifier still judges the content on its own.
  const reporterContext =
    note && note.trim()
      ? `\n\nA user reported this with the note (treat as a possibly-biased hint, judge the content independently): "${note.trim().slice(0, 400)}"`
      : "";
  try {
    const response = await fetch(`${AI_GATEWAY_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `surface: ${SURFACE_OF[targetType]}\ntargetType: ${targetType}\n---\n${trimmed}${reporterContext}`,
          },
        ],
        temperature: 0,
      }),
    });
    if (!response.ok) {
      console.error("moderate: AI gateway", response.status);
      return {
        decision: "allow",
        category: "none",
        confidence: 0,
        self_harm: false,
        available: false,
      };
    }
    const data = await response.json();
    const raw = String(data?.choices?.[0]?.message?.content ?? "");
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match)
      return {
        decision: "allow",
        category: "none",
        confidence: 0,
        self_harm: false,
        available: false,
      };
    const parsed = JSON.parse(match[0]) as any;
    const v = parsed.verdict;
    const decision: Decision = v === "block" ? "block" : v === "flag" ? "flag" : "allow";
    return {
      decision,
      category: typeof parsed.category === "string" ? parsed.category : "none",
      confidence:
        typeof parsed.confidence === "number" ? Math.min(100, Math.max(0, parsed.confidence)) : 50,
      self_harm: parsed.self_harm === true,
      available: true,
    };
  } catch (e) {
    console.error("moderate: AI threw", e);
    return {
      decision: "allow",
      category: "none",
      confidence: 0,
      self_harm: false,
      available: false,
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData } = await sb.auth.getUser(token);
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;
    if (!(await checkAiRateLimit(sb, userId))) {
      return json(
        {
          error: "You've hit the AI limit for now — try again in a few minutes.",
          code: "rate_limited",
        },
        429,
      );
    }

    const raw = await req.text();
    if (raw.length > 32 * 1024) return json({ error: "Request too large" }, 413);
    let payload: {
      text?: string;
      targetType?: TargetType;
      targetId?: string | null;
      mode?: "check" | "record";
      note?: string;
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const text = (payload.text ?? "").toString();
    const targetType: TargetType = (payload.targetType as TargetType) ?? "thread";
    const targetId = payload.targetId ?? null;
    const mode = payload.mode === "check" ? "check" : "record";
    const note = typeof payload.note === "string" ? payload.note : undefined; // reporter context (re-scan)
    if (!Object.keys(SURFACE_OF).includes(targetType))
      return json({ error: "Invalid targetType" }, 400);
    const surface = SURFACE_OF[targetType];

    if (!text.trim()) {
      return json({
        verdict: "allow",
        decision: "allow",
        category: "none",
        score: 0,
        confidence: 0,
        selfHarm: false,
        reason: "Empty",
      });
    }

    // Thresholds from the single config location (fallbacks if unreadable).
    const { data: thr } = await sb.rpc("moderation_cfg" as any, { p_key: "thresholds" });
    const T = (thr ?? {}) as any;
    const BLOCK_SEV = Number(T.block_severity ?? 8);
    const FLAG_SEV = Number(T.flag_severity ?? 5);
    const AI_BLOCK_CONF = Number(T.ai_block_confidence ?? 80);
    const AI_FLAG_CONF = Number(T.ai_flag_confidence ?? 45);

    // ── Layer A: deterministic dictionary + pattern scan (no external dep). ──
    const { data: scanRows } = await sb.rpc("moderation_scan" as any, { p_text: text });
    const hits = (Array.isArray(scanRows) ? scanRows : []) as {
      category: string;
      severity: number;
      layer: string;
    }[];
    const isUsername = targetType === "username";
    // Self-harm is never a deterministic action. Casual profanity is NOT
    // policed in forum/chat (the non-goal: don't filter normal banter) — the AI
    // judges whether it's directed harassment. Usernames stay strict (a profane
    // handle is a public identity), so they keep generic_profanity.
    const considered = hits.filter(
      (h) => h.category !== "self_harm" && (isUsername || h.category !== "generic_profanity"),
    );
    const top = considered.sort((a, b) => b.severity - a.severity)[0] ?? null;
    const layersFired = new Set<string>();
    let aDecision: Decision = "allow";
    let aCategory = "none";
    let aSeverity = 0;
    if (top) {
      layersFired.add(top.layer);
      aCategory = top.category;
      aSeverity = top.severity;
      aDecision = isUsername
        ? top.severity >= FLAG_SEV
          ? "block"
          : "allow" // usernames: deterministic-weighted, any hit blocks
        : top.severity >= BLOCK_SEV
          ? "block"
          : top.severity >= FLAG_SEV
            ? "flag"
            : "allow";
    }

    // ── Layer B: contextual AI classifier (lighter weight for usernames). ──
    const apiKey = AI_GATEWAY_API_KEY;
    let ai: AiVerdict = {
      decision: "allow",
      category: "none",
      confidence: 0,
      self_harm: false,
      available: false,
    };
    if (apiKey) ai = await classifyWithAi(text, targetType, apiKey, note);
    if (ai.available) layersFired.add("ai");

    // Map AI confidence → decision strength.
    let bDecision: Decision = "allow";
    if (ai.available) {
      if (ai.decision === "block") bDecision = ai.confidence >= AI_BLOCK_CONF ? "block" : "flag";
      else if (ai.decision === "flag" || ai.confidence >= AI_FLAG_CONF) bDecision = "flag";
    }

    // ── Combine: strongest decision wins; self-harm is detection-only. ──
    const rank: Record<Decision, number> = { allow: 0, flag: 1, block: 2 };
    let decision: Decision = rank[aDecision] >= rank[bDecision] ? aDecision : bDecision;
    let category =
      decision === aDecision && aCategory !== "none"
        ? aCategory
        : ai.category !== "none"
          ? ai.category
          : aCategory;
    const confidence =
      decision === aDecision ? Math.max(aSeverity * 10, ai.confidence) : ai.confidence;
    const selfHarm = ai.self_harm === true;

    // Fail-safe: classifier unavailable AND Layer A clean → allow, but queue a
    // re-scan so the AI pass happens once it recovers (never silently skipped).
    const needsRescan = !ai.available && aDecision === "allow" && surface !== "username"; // usernames are deterministic-weighted

    // Self-harm never produces a punitive block on its own.
    if (selfHarm && decision === "block" && category === "self_harm") {
      decision = "allow";
      category = "none";
    }

    let paused = false;
    let decisionId: string | null = null;
    if (mode === "record") {
      const { data: outcome } = await sb.rpc("apply_moderation_outcome" as any, {
        p_surface: surface,
        p_target_type: targetType,
        p_content_ref: targetId,
        p_author: userId,
        p_decision: decision,
        p_category: category === "none" ? null : category,
        p_confidence: Math.round(confidence),
        p_layers: Array.from(layersFired),
        p_self_harm: selfHarm,
        p_severity: Math.max(aSeverity, Math.round(confidence / 10)),
        p_snapshot: text,
        p_needs_rescan: needsRescan,
      });
      paused = !!(outcome as any)?.paused;
      decisionId = (outcome as any)?.decision_id ?? null;

      // Forum rows: push the visibility verdict onto the existing row.
      if (targetId && surface === "forum") {
        await sb.rpc("apply_ai_moderation_result" as any, {
          p_target_type: targetType,
          p_target_id: targetId,
          p_verdict: decision === "flag" ? "hide" : decision, // allow|hide|block
          p_category: category,
          p_score: Math.round(confidence),
          p_reason: `Auto: ${category}`,
        });
      }
    }

    // Back-compat verdict field (existing forum callers read .verdict/.reason).
    const verdict = decision === "flag" ? "hide" : decision;
    return json({
      verdict,
      decision,
      category,
      confidence: Math.round(confidence),
      score: Math.round(confidence),
      selfHarm,
      paused,
      needsRescan,
      decisionId,
      reason: decision === "block" ? `This was flagged as ${category}.` : "",
    });
  } catch (e) {
    console.error("moderate fatal:", e);
    // Fail-safe: on an unexpected error, do NOT block the user platform-wide.
    return json({
      verdict: "allow",
      decision: "allow",
      category: "none",
      confidence: 0,
      score: 0,
      selfHarm: false,
      paused: false,
      reason: "",
    });
  }
});
