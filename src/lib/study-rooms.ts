/**
 * Study Rooms — cozy public/private study spaces with live chat and a chosen
 * Ecliptar per member. Thin client over the SQL in
 * supabase/migrations/20260622010000_study-rooms.sql. New tables aren't in the
 * generated Supabase types, so calls are cast `as any` (same as the rest of the
 * app's newer tables).
 */
import { supabase } from "@/integrations/supabase/client";

export interface StudyRoom {
  id: string;
  name: string;
  topic: string | null;
  is_public: boolean;
  owner_id: string;
  created_at: string;
  member_count: number;
  am_member: boolean;
  join_code: string | null;
  /** Shared Session Clock — room-level, synced to all members. */
  work_minutes: number;
  break_minutes: number;
  phase: "work" | "break";
  phase_started_at: string;
  last_activity_at: string;
  /** Goal/Resource Pin — room-level, synced to all members. */
  goal_text: string | null;
  resource_links: ResourceLink[];
  /** Teach-Back Rotation — room-level, synced to all members. */
  teach_back_enabled: boolean;
  tb_queue: string[];
  tb_position: number;
}

export interface ResourceLink {
  url: string;
  label: string | null;
}

export interface RoomMember {
  room_id: string;
  user_id: string;
  display_name: string | null;
  ecliptar_slug: string | null;
  joined_at: string;
  /** Teach-Back — has this member used their one free skip this session. */
  tb_skip_used?: boolean;
}

export interface RoomMessage {
  id: string;
  room_id: string;
  user_id: string;
  author_name: string | null;
  ecliptar_slug: string | null;
  body: string;
  created_at: string;
  /** `chat` = normal bubble, `system` = log line (pattern change, idle nudge). */
  kind: "chat" | "system";
}

/** Current user's display name + their equipped Ecliptar (the room default). */
export async function getMyRoomIdentity(): Promise<{
  userId: string | null;
  displayName: string;
  equippedSlug: string | null;
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, displayName: "Learner", equippedSlug: null };
  const { data } = await supabase
    .from("user_profiles")
    .select("username,equipped_ecliptar")
    .eq("user_id", user.id)
    .maybeSingle();
  const displayName =
    (data as { username?: string } | null)?.username?.trim() ||
    user.email?.split("@")[0] ||
    "Learner";
  return {
    userId: user.id,
    displayName,
    equippedSlug: (data as { equipped_ecliptar?: string } | null)?.equipped_ecliptar ?? null,
  };
}

export async function listStudyRooms(): Promise<StudyRoom[]> {
  const { data, error } = await supabase.rpc("get_study_rooms" as any);
  if (error) { console.error("listStudyRooms", error); return []; }
  return (data ?? []) as StudyRoom[];
}

export async function createStudyRoom(args: {
  name: string;
  topic: string;
  isPublic: boolean;
  displayName: string;
  ecliptarSlug: string | null;
}): Promise<{ room: StudyRoom | null; error: string | null }> {
  const { data, error } = await supabase.rpc("create_study_room" as any, {
    p_name: args.name,
    p_topic: args.topic,
    p_is_public: args.isPublic,
    p_display_name: args.displayName,
    p_ecliptar_slug: args.ecliptarSlug,
  });
  if (error) return { room: null, error: error.message };
  return { room: (Array.isArray(data) ? data[0] : data) as StudyRoom, error: null };
}

export async function joinStudyRoom(args: {
  roomId?: string;
  code?: string;
  displayName: string;
  ecliptarSlug: string | null;
}): Promise<{ room: StudyRoom | null; error: string | null }> {
  const { data, error } = await supabase.rpc("join_study_room" as any, {
    p_room: args.roomId ?? null,
    p_code: args.code ?? null,
    p_display_name: args.displayName,
    p_ecliptar_slug: args.ecliptarSlug,
  });
  if (error) return { room: null, error: error.message };
  return { room: (Array.isArray(data) ? data[0] : data) as StudyRoom, error: null };
}

export async function leaveStudyRoom(roomId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_study_room" as any, { p_room: roomId });
  if (error) console.error("leaveStudyRoom", error);
}

export async function getRoom(roomId: string): Promise<StudyRoom | null> {
  const rooms = await listStudyRooms();
  return rooms.find((r) => r.id === roomId) ?? null;
}

export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from("study_room_members" as any)
    .select("room_id,user_id,display_name,ecliptar_slug,joined_at,tb_skip_used")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (error) { console.error("getRoomMembers", error); return []; }
  return (data ?? []) as unknown as RoomMember[];
}

export async function getRoomMessages(roomId: string, limit = 100): Promise<RoomMessage[]> {
  const { data, error } = await supabase
    .from("study_room_messages" as any)
    .select("id,room_id,user_id,author_name,ecliptar_slug,body,created_at,kind")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) { console.error("getRoomMessages", error); return []; }
  return (data ?? []) as unknown as RoomMessage[];
}

export async function sendRoomMessage(args: {
  roomId: string;
  body: string;
  authorName: string;
  ecliptarSlug: string | null;
}): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "You need to be signed in.";
  const body = args.body.trim();
  if (!body) return null;
  const { error } = await supabase.from("study_room_messages" as any).insert({
    room_id: args.roomId,
    user_id: user.id,
    author_name: args.authorName,
    ecliptar_slug: args.ecliptarSlug,
    body: body.slice(0, 1000),
  });
  return error ? error.message : null;
}

/** Update the Ecliptar that represents you inside a room. */
export async function setRoomEcliptar(roomId: string, slug: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("study_room_members" as any)
    .update({ ecliptar_slug: slug })
    .eq("room_id", roomId)
    .eq("user_id", user.id);
  if (error) console.error("setRoomEcliptar", error);
}

// ── Shared Session Clock ────────────────────────────────────────────────────

/** Change the work/break pattern for the room. Posts a system line in chat. */
export async function setRoomPattern(
  roomId: string, workMinutes: number, breakMinutes: number,
): Promise<string | null> {
  const { error } = await supabase.rpc("set_room_pattern" as any, {
    p_room: roomId, p_work: workMinutes, p_break: breakMinutes,
  });
  return error ? error.message : null;
}

/** Idempotent phase flip — racing clients collapse to one update on the server. */
export async function advanceRoomPhase(
  roomId: string, fromPhase: "work" | "break", fromStartedAt: string,
): Promise<void> {
  const { error } = await supabase.rpc("advance_room_phase" as any, {
    p_room: roomId, p_from_phase: fromPhase, p_from_started_at: fromStartedAt,
  });
  if (error) console.error("advanceRoomPhase", error);
}

/** Ask the server to post the "still working?" nudge. Server enforces gating. */
export async function postIdleNudge(roomId: string): Promise<void> {
  const { error } = await supabase.rpc("post_idle_nudge" as any, { p_room: roomId });
  if (error && !/Not a room member/i.test(error.message)) console.error("postIdleNudge", error);
}

/** Re-fetch a single room's current state (clock columns live on `get_study_rooms`). */
export async function refetchRoom(roomId: string): Promise<StudyRoom | null> {
  return await getRoom(roomId);
}

// ─── Goal/Resource Pin ──────────────────────────────────────────────────────

/** Set the room's single goal line (any member; null/empty clears it). */
export async function setRoomGoal(roomId: string, goal: string | null): Promise<string | null> {
  const { error } = await supabase.rpc("set_room_goal" as any, { p_room: roomId, p_goal: goal });
  return error ? error.message : null;
}

/** Replace the room's resource links (the full list, max 3 — server enforces). */
export async function setRoomLinks(roomId: string, links: ResourceLink[]): Promise<string | null> {
  const { error } = await supabase.rpc("set_room_links" as any, { p_room: roomId, p_links: links });
  return error ? error.message : null;
}
