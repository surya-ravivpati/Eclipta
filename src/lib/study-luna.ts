/**
 * Study-room Luna helpers — the "Stuck" escalation records and the "Recap"
 * generator. Both reuse the Lovable AI gateway via the luna-room edge function
 * (same engine as luna-chat). Ask is handled directly in the UI via
 * streamLunaChat (private, client-only) — no storage, so it can never leak into
 * Recap. Recap is fed ONLY structured events, never chat.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TeachBackRound } from "./study-teachback";

const ROOM_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/luna-room`;

async function callRoom(payload: Record<string, unknown>): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return fetch(ROOM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(payload),
  });
}

export interface StuckRequest {
  id: string;
  room_id: string;
  user_id: string;
  author_name: string | null;
  note: string | null;
  status: "open" | "resolving" | "resolved";
  resolved_by: string | null;            // null | 'ai' | '<user uuid>'
  resolver_name: string | null;
  resolution_summary: string | null;
  ai_due_at: string;
  created_at: string;
  resolved_at: string | null;
}

export async function fetchStuckRequests(roomId: string): Promise<StuckRequest[]> {
  const { data, error } = await supabase
    .from("stuck_requests" as never)
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  if (error) { console.error("fetchStuckRequests", error); return []; }
  return (data ?? []) as unknown as StuckRequest[];
}

export async function createStuckRequest(roomId: string, note: string): Promise<string | null> {
  const { error } = await supabase.rpc("create_stuck_request" as never, { p_room: roomId, p_note: note } as never);
  return error ? error.message : null;
}

/** A human picks it up — first action wins (server-guarded), cancels AI fallback. */
export async function resolveStuckHuman(stuckId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("resolve_stuck_human" as never, { p_stuck: stuckId } as never);
  if (error) { console.error("resolveStuckHuman", error); return false; }
  return !!data;
}

/** Fire the AI fallback. Server claims atomically, so calling this from several
 *  clients at once still yields exactly one AI answer. */
export async function triggerStuckAi(stuckId: string): Promise<void> {
  try { await callRoom({ mode: "stuck", stuck_id: stuckId }); }
  catch (e) { console.error("triggerStuckAi", e); }
}

// ─── Recap ───────────────────────────────────────────────────────────────────

export interface RecapEvent { type: string; text: string; }

/**
 * Build the structured-event list Recap is allowed to see. Two event types
 * exist today: resolved Stuck cards and completed teach-back outcomes. Chat is
 * NEVER included. (Both share the {type, text} shape Recap reads.)
 */
export function gatherRecapEvents(stuck: StuckRequest[], rounds: TeachBackRound[] = []): RecapEvent[] {
  const stuckEvents: RecapEvent[] = stuck
    .filter((s) => s.status === "resolved")
    .map((s) => ({
      type: "stuck_resolved",
      text:
        `${s.author_name || "A member"} was stuck${s.note ? ` on "${s.note}"` : ""} — ` +
        (s.resolved_by === "ai" ? "Luna stepped in" : `${s.resolver_name || "a member"} helped`) +
        (s.resolved_by === "ai" && s.resolution_summary ? `. Luna's hint: ${s.resolution_summary.slice(0, 300)}` : "."),
    }));

  const teachBackEvents: RecapEvent[] = rounds
    .filter((r) => r.status === "answered" || r.status === "skipped" || r.status === "expired")
    .map((r) => {
      const who = r.explainer_name || "A member";
      const concept = r.concept_text ? `"${r.concept_text}"` : "a concept";
      if (r.status === "answered") {
        const tally = `👍${r.up_count} 🤔${r.kinda_count} ❓${r.lost_count}`;
        return { type: "teach_back", text: `${who} taught back ${concept} — the room reacted ${tally}.` };
      }
      if (r.status === "skipped") {
        return { type: "teach_back", text: `${who} passed their teach-back turn on ${concept}.` };
      }
      return { type: "teach_back", text: `A teach-back on ${concept} went unanswered.` };
    });

  return [...stuckEvents, ...teachBackEvents];
}

/**
 * Generate the recap. Caller MUST pass at least one event — with zero events we
 * never call the model (that's exactly when it would hallucinate). Same logic
 * powers both "Recap so far" and end-of-session.
 */
export async function generateRecap(events: RecapEvent[], goalText: string | null): Promise<{ text?: string; error?: string }> {
  if (events.length === 0) return { error: "no-events" };
  try {
    const r = await callRoom({ mode: "recap", events, goal_text: goalText });
    if (!r.ok) return { error: r.status === 404 ? "Recap isn't set up on the server yet (deploy the luna-room function)." : `Recap failed (${r.status}).` };
    const d = await r.json();
    return { text: typeof d?.text === "string" ? d.text : "" };
  } catch {
    return { error: "Recap request failed. Check your connection." };
  }
}
