/**
 * Study-room safety & infrastructure helpers — thin client over the SQL in
 * supabase/migrations/20260626140000_study-room-safety.sql.
 *
 *   - Host powers: regenerate code, remove member (+ un-remove).
 *   - Report a message (human or AI-authored) — silent, durable, moderator-read.
 *   - Block a user — account-level, personal; hides their chat everywhere.
 *   - Opportunistic abandoned-room cleanup (check-on-access).
 */
import { supabase } from "@/integrations/supabase/client";

// ── Host powers ─────────────────────────────────────────────────────────────
export async function regenerateRoomCode(
  roomId: string,
): Promise<{ code?: string; error?: string }> {
  const { data, error } = await supabase.rpc(
    "regenerate_room_code" as never,
    { p_room: roomId } as never,
  );
  if (error) return { error: error.message };
  return { code: data as unknown as string };
}

export async function removeRoomMember(roomId: string, userId: string): Promise<string | null> {
  const { error } = await supabase.rpc(
    "remove_room_member" as never,
    { p_room: roomId, p_user: userId } as never,
  );
  return error ? error.message : null;
}

export async function allowRoomMember(roomId: string, userId: string): Promise<string | null> {
  const { error } = await supabase.rpc(
    "allow_room_member" as never,
    { p_room: roomId, p_user: userId } as never,
  );
  return error ? error.message : null;
}

// ── Report ──────────────────────────────────────────────────────────────────
export type ReportAuthorKind = "human" | "ai" | "system";

/** Silent report. The reported user is never notified. Works for AI content
 *  too (pass authorKind:"ai" and a null reportedUserId). */
export async function reportRoomMessage(args: {
  roomId: string;
  reportedUserId: string | null;
  authorKind: ReportAuthorKind;
  snapshot: string;
  reason: string;
}): Promise<string | null> {
  const { error } = await supabase.rpc(
    "report_room_message" as never,
    {
      p_room: args.roomId,
      p_reported_user: args.reportedUserId,
      p_author_kind: args.authorKind,
      p_snapshot: args.snapshot,
      p_reason: args.reason,
    } as never,
  );
  return error ? error.message : null;
}

// ── Block (account-level) ────────────────────────────────────────────────────
export async function fetchBlockedUserIds(): Promise<Set<string>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data, error } = await supabase
    .from("blocked_users" as never)
    .select("blocked_id")
    .eq("blocker_id", user.id);
  if (error) {
    console.error("fetchBlockedUserIds", error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => (r as { blocked_id: string }).blocked_id));
}

export async function blockUser(blockedId: string): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "You need to be signed in.";
  const { error } = await supabase
    .from("blocked_users" as never)
    .upsert({ blocker_id: user.id, blocked_id: blockedId } as never, {
      onConflict: "blocker_id,blocked_id",
    });
  return error ? error.message : null;
}

export async function unblockUser(blockedId: string): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "You need to be signed in.";
  const { error } = await supabase
    .from("blocked_users" as never)
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", blockedId);
  return error ? error.message : null;
}

// ── Abandoned-room cleanup (best-effort, check-on-access) ─────────────────────
export async function cleanupAbandonedRooms(): Promise<void> {
  // Fire-and-forget; the server enforces the "empty AND stale" guard.
  const { error } = await supabase.rpc("cleanup_abandoned_rooms" as never);
  if (error) console.error("cleanupAbandonedRooms", error);
}
