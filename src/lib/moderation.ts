/**
 * Client wrapper for the `moderate-content` edge function and related
 * moderation RPCs.
 *
 * The forum composer flow is:
 *   1. (Optional) Local pre-check with isCleanForumContent — instant feedback
 *      for the obvious cases.
 *   2. Call moderateContent() before INSERT. If verdict === 'block', refuse
 *      to submit. Otherwise insert the row normally.
 *   3. After INSERT, call moderateContent() again with targetId so the edge
 *      function can update the row's moderation_status (the AI verdict is
 *      what actually drives whether the post shows up publicly).
 *
 * Splitting the call in two means a slow LLM doesn't block the user's
 * "Posted!" confirmation — the post lands immediately, and within a second
 * or two its visibility flips if the AI decides to hide it.
 */
import { supabase } from "@/integrations/supabase/client";

export type ModerationVerdict = "allow" | "hide" | "block" | "pending";
export type ModerationTarget = "thread" | "answer" | "comment" | "username";

export interface ModerationResult {
  verdict: ModerationVerdict;
  category: string;
  score: number;
  reason: string;
  /** Author expressed self-harm/crisis — surface supportive resources. */
  selfHarm?: boolean;
}

const SAFE_FALLBACK: ModerationResult = {
  verdict: "pending",
  category: "unknown",
  score: 50,
  reason: "Moderation service unavailable — your post will be reviewed.",
};

export async function moderateContent(
  text: string,
  targetType: ModerationTarget,
  targetId?: string | null,
): Promise<ModerationResult> {
  try {
    // Pre-insert gate: 'check' mode returns a verdict WITHOUT logging/side
    // effects, so the authoritative record happens once (post-insert / record).
    const { data, error } = await supabase.functions.invoke("moderate-content", {
      body: { text, targetType, targetId: targetId ?? null, mode: "check" },
    });
    if (error) {
      console.error("moderateContent: invoke error", error);
      return SAFE_FALLBACK;
    }
    if (!data || typeof data !== "object" || !("verdict" in data)) {
      console.warn("moderateContent: malformed response", data);
      return SAFE_FALLBACK;
    }
    const result = data as Partial<ModerationResult> & { selfHarm?: boolean };
    return {
      verdict: (result.verdict as ModerationVerdict) ?? "pending",
      category: result.category ?? "unknown",
      score: typeof result.score === "number" ? result.score : 0,
      reason: result.reason ?? "",
      selfHarm: result.selfHarm === true,
    };
  } catch (e) {
    console.error("moderateContent threw", e);
    return SAFE_FALLBACK;
  }
}

/**
 * Run the AI pass *after* insert so the row gets its final moderation_status
 * without blocking the user's UI. Best-effort: any failure is logged but the
 * post stays in whatever state the synchronous pass left it.
 */
export async function moderateAfterInsert(
  text: string,
  targetType: Exclude<ModerationTarget, "username">,
  targetId: string,
): Promise<void> {
  try {
    await supabase.functions.invoke("moderate-content", {
      body: { text, targetType, targetId, mode: "record" },
    });
  } catch (e) {
    // Don't surface to the user — the trigger already gated obvious bad
    // content; this is the contextual second pass.
    console.warn("moderateAfterInsert failed", e);
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 * Unified pipeline entry — moderate(content, surface, author_context).
 * One call for usernames and chat (single, authoritative 'record' pass). Forum
 * keeps its two-step check→record flow above. Also the on-demand re-scan entry.
 * ─────────────────────────────────────────────────────────────────────────── */
export type ModerationDecision = "allow" | "flag" | "block";

export interface ModerationOutcome {
  decision: ModerationDecision;
  category: string;
  confidence: number;
  /** Author expressed self-harm/crisis about themselves — surface supportive
   *  resources. NOT a moderation consequence; can co-occur with a violation. */
  selfHarm: boolean;
  /** Repeat-offender soft pause applied (temporary, pending human review). */
  paused: boolean;
  /** True when decision === 'block' — content must not be saved/sent. */
  blocked: boolean;
}

const SAFE_OUTCOME: ModerationOutcome = {
  decision: "allow", category: "none", confidence: 0, selfHarm: false, paused: false, blocked: false,
};

/**
 * Run the unified pipeline for a piece of content. `mode: "record"` (default)
 * logs the decision and applies side effects (queue, wellbeing, repeat-offender
 * pause); `mode: "check"` is a pure pre-submit gate.
 */
/**
 * Wire shape of the `moderate-content` edge function's response.
 *
 * Every field is optional because this crosses a network boundary the
 * schema types don't cover — the caller must guard each one rather than
 * trust the payload.
 */
interface ModerationResponsePayload {
  decision?: string;
  category?: string;
  confidence?: number;
  selfHarm?: boolean;
  paused?: boolean;
}

export async function moderate(
  text: string,
  targetType: ModerationTarget | "chat_message",
  opts?: { mode?: "check" | "record"; targetId?: string | null },
): Promise<ModerationOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke<ModerationResponsePayload>(
      "moderate-content",
      { body: { text, targetType, targetId: opts?.targetId ?? null, mode: opts?.mode ?? "record" } },
    );
    if (error || !data || typeof data !== "object") return SAFE_OUTCOME;
    const decision: ModerationDecision =
      data.decision === "block" ? "block" : data.decision === "flag" ? "flag" : "allow";
    return {
      decision,
      category: typeof data.category === "string" ? data.category : "none",
      confidence: typeof data.confidence === "number" ? data.confidence : 0,
      selfHarm: data.selfHarm === true,
      paused: data.paused === true,
      blocked: decision === "block",
    };
  } catch (e) {
    // Fail-safe: never block the user on a moderation transport error.
    console.error("moderate threw", e);
    return SAFE_OUTCOME;
  }
}

/** Calm, non-accusatory block copy — states the category, nothing more.
 *  Never attributed to Luna or any persona. */
export function calmBlockMessage(category: string): string {
  const c = (category && category !== "none") ? category.replace(/_/g, " ") : "our guidelines";
  return `This couldn't be posted — it was flagged as ${c}.`;
}

/** Supportive crisis resources surfaced to a user whose own content reads as
 *  self-harm/distress. Supportive tone — this is NOT a moderation action. */
export const SELF_HARM_RESOURCES: { label: string; detail: string; href?: string }[] = [
  { label: "988 Suicide & Crisis Lifeline", detail: "Call or text 988 (US, 24/7)", href: "tel:988" },
  { label: "Crisis Text Line", detail: "Text HOME to 741741 (US/Canada)", href: "sms:741741" },
  { label: "Find a helpline", detail: "International directory of crisis lines", href: "https://findahelpline.com" },
];

/**
 * Submit a report through the authoritative RPC (which enforces dedup,
 * rate limiting, and auto-hide thresholds).
 */
export async function submitForumReport(
  targetType: "thread" | "answer" | "comment",
  targetId: string,
  reason: string,
): Promise<{ ok: true; deduplicated?: boolean; autoHidden?: boolean; reportCount?: number } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("submit_forum_report", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    deduplicated: !!data?.deduplicated,
    autoHidden: !!data?.auto_hidden,
    reportCount: data?.report_count ?? undefined,
  };
}

/**
 * Moderator-only: change visibility of a forum item. Always logs.
 */
export async function setModerationStatus(
  targetType: "thread" | "answer" | "comment",
  targetId: string,
  status: "visible" | "hidden" | "removed",
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("set_moderation_status", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_status: status,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Human-friendly placeholder rendered in place of removed content. Centralised
 * so every surface (thread list, thread detail, comments, search) uses the
 * exact same string — making it obvious to users that the system is active.
 */
export const REMOVED_PLACEHOLDER = "Removed by moderator";

export function isContentVisible(
  status: string | null | undefined,
  isOwnContent: boolean,
  isModerator: boolean,
): boolean {
  if (!status || status === "visible") return true;
  // Authors and moderators can always see their hidden content (with a banner)
  // so they understand what happened and can edit / restore.
  return isOwnContent || isModerator;
}
