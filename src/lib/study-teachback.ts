/**
 * Teach-Back Rotation — thin client over the SQL in
 * supabase/migrations/20260626120000_study-room-teach-back.sql.
 *
 * The whole ritual is server-gated: clients race to call `openTeachBackRound`
 * on the clock's work→break flip and the server creates exactly one round per
 * transition. Concept selection (Stuck resolution → recap snippet → goal pin)
 * happens entirely in the RPC — no AI key is ever touched client-side.
 */
import { supabase } from "@/integrations/supabase/client";

export type TbStatus = "claiming" | "pending" | "answered" | "expired" | "skipped";
export type TbReaction = "up" | "kinda" | "lost";

export interface TeachBackRound {
  id: string;
  room_id: string;
  trigger_key: string;
  explainer_id: string | null;
  explainer_name: string | null;
  concept_text: string | null;
  concept_source: "stuck" | "recap" | "goal" | null;
  status: TbStatus;
  up_count: number;
  kinda_count: number;
  lost_count: number;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
}

export async function fetchTeachBackRounds(roomId: string): Promise<TeachBackRound[]> {
  const { data, error } = await supabase
    .from("teach_back_rounds" as never)
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  if (error) { console.error("fetchTeachBackRounds", error); return []; }
  return (data ?? []) as unknown as TeachBackRound[];
}

/** Toggle the ritual on/off (any member). Rebuilds the rotation + resets the
 *  one-skip allowance — a fresh session. Posts a system line. */
export async function setTeachBack(roomId: string, on: boolean): Promise<string | null> {
  const { error } = await supabase.rpc("set_teach_back" as never, { p_room: roomId, p_on: on } as never);
  return error ? error.message : null;
}

/** Fire once at work→break on every client; the server gates so only one round
 *  is created. `triggerKey` is the break phase's start time (unique per flip). */
export async function openTeachBackRound(roomId: string, triggerKey: string): Promise<void> {
  const { error } = await supabase.rpc("tb_open_round" as never,
    { p_room: roomId, p_trigger_key: triggerKey } as never);
  if (error) console.error("openTeachBackRound", error);
}

/** One-tap validation. Informational only — never a per-user score. */
export async function reactTeachBack(roundId: string, reaction: TbReaction): Promise<void> {
  const { error } = await supabase.rpc("react_teach_back" as never,
    { p_round: roundId, p_reaction: reaction } as never);
  if (error) console.error("reactTeachBack", error);
}

/** The explainer passes their turn (one free skip per session). */
export async function skipTeachBack(roundId: string): Promise<string | null> {
  const { error } = await supabase.rpc("skip_teach_back" as never, { p_round: roundId } as never);
  return error ? error.message : null;
}

/** Auto-pass when the explainer has left mid-turn (no skip charged). Safe to
 *  call from several clients — the server collapses concurrent calls. */
export async function passTeachBack(roundId: string): Promise<void> {
  const { error } = await supabase.rpc("pass_teach_back" as never, { p_round: roundId } as never);
  if (error) console.error("passTeachBack", error);
}

/**
 * Who's up next = the first member in queue order (from `position`) who is
 * still in the room. Returns their user id, or null if the queue is unbuilt.
 */
export function nextUpId(queue: string[], position: number, memberIds: Set<string>): string | null {
  const len = queue.length;
  if (len === 0) return null;
  const pos = position >= 0 && position < len ? position : 0;
  for (let i = 0; i < len; i++) {
    const id = queue[(pos + i) % len];
    if (memberIds.has(id)) return id;
  }
  return null;
}
