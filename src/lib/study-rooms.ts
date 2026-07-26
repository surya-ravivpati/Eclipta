/**
 * Study Rooms — cozy public/private study spaces with live chat and a chosen
 * Ecliptar per member. Thin client over the SQL in
 * supabase/migrations/20260622010000_study-rooms.sql.
 *
 * The RPCs hand back raw rows, where `phase` is `text` and `resource_links`
 * is `jsonb`. The adapters at the bottom of this file are the single place
 * those widen-to-narrow conversions happen, so the rest of the app only
 * ever sees the domain types declared here.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/database";

/**
 * A room's own state — everything stored on the row itself.
 *
 * Split out from `StudyRoom` because the create/join RPCs return the room
 * row alone: they know nothing about how many members it has or whether
 * some particular viewer is one of them.
 */
export interface StudyRoomDetails {
  id: string;
  name: string;
  topic: string | null;
  is_public: boolean;
  owner_id: string;
  created_at: string;
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
  /** Host (creator initially; succeeds to longest-present member on leave). */
  host_id: string | null;
}

/** A room as the lobby shows it: its own state plus the viewer's relationship to it. */
export interface StudyRoom extends StudyRoomDetails {
  member_count: number;
  am_member: boolean;
}

/**
 * Declared as a type alias, not an interface: it is passed straight into the
 * `p_links` jsonb argument, and only aliases get the implicit index
 * signature that assignment to `Json` requires.
 */
export type ResourceLink = {
  url: string;
  label: string | null;
};

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
  /** Unified moderation status (a moderator can hide/remove after the fact). */
  moderation_status?: "visible" | "hidden" | "removed";
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
    data?.username?.trim() ||
    user.email?.split("@")[0] ||
    "Learner";
  return {
    userId: user.id,
    displayName,
    equippedSlug: data?.equipped_ecliptar ?? null,
  };
}

// ── Row adapters ────────────────────────────────────────────────────────────

/** Unknown statuses are treated as visible — the same default the column carries. */
function toModerationStatus(value: string): NonNullable<RoomMessage["moderation_status"]> {
  return value === "hidden" || value === "removed" ? value : "visible";
}

/** Anything wider than `"work" | "break"` means a room we can't interpret; work is the safe default. */
function toPhase(value: string): StudyRoomDetails["phase"] {
  return value === "break" ? "break" : "work";
}

/**
 * `resource_links` is a free-form `jsonb` column, so entries are dropped
 * rather than trusted: a link without a string `url` cannot be rendered.
 */
function toResourceLinks(value: Json): ResourceLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ResourceLink[] => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const { url, label } = entry;
    if (typeof url !== "string") return [];
    return [{ url, label: typeof label === "string" ? label : null }];
  });
}

/** The room columns every study-room RPC returns, before narrowing. */
interface StudyRoomRow {
  id: string;
  name: string;
  topic: string | null;
  is_public: boolean;
  owner_id: string;
  created_at: string;
  join_code: string | null;
  work_minutes: number;
  break_minutes: number;
  phase: string;
  phase_started_at: string;
  last_activity_at: string;
  goal_text: string | null;
  resource_links: Json;
  teach_back_enabled: boolean;
  tb_queue: string[];
  tb_position: number;
  host_id: string | null;
}

function toStudyRoomDetails(row: StudyRoomRow): StudyRoomDetails {
  return {
    id: row.id,
    name: row.name,
    topic: row.topic,
    is_public: row.is_public,
    owner_id: row.owner_id,
    created_at: row.created_at,
    join_code: row.join_code,
    work_minutes: row.work_minutes,
    break_minutes: row.break_minutes,
    phase: toPhase(row.phase),
    phase_started_at: row.phase_started_at,
    last_activity_at: row.last_activity_at,
    goal_text: row.goal_text,
    resource_links: toResourceLinks(row.resource_links),
    teach_back_enabled: row.teach_back_enabled,
    tb_queue: row.tb_queue,
    tb_position: row.tb_position,
    host_id: row.host_id,
  };
}

function toStudyRoom(row: StudyRoomRow & { member_count: number; am_member: boolean }): StudyRoom {
  return { ...toStudyRoomDetails(row), member_count: row.member_count, am_member: row.am_member };
}

export async function listStudyRooms(): Promise<StudyRoom[]> {
  // Check-on-access cleanup: clear empty, long-abandoned rooms whenever the
  // lobby is opened. Fire-and-forget; the server enforces the "empty AND stale"
  // guard so this is safe to call from any client.
  void supabase.rpc("cleanup_abandoned_rooms").then(({ error }) => {
    if (error) console.error("cleanup_abandoned_rooms", error);
  });
  const { data, error } = await supabase.rpc("get_study_rooms");
  if (error) { console.error("listStudyRooms", error); return []; }
  return (data ?? []).map(toStudyRoom);
}

export async function createStudyRoom(args: {
  name: string;
  topic: string;
  isPublic: boolean;
  displayName: string;
  ecliptarSlug: string | null;
}): Promise<{ room: StudyRoomDetails | null; error: string | null }> {
  const { data, error } = await supabase.rpc("create_study_room", {
    p_name: args.name,
    p_topic: args.topic,
    p_is_public: args.isPublic,
    p_display_name: args.displayName,
    p_ecliptar_slug: args.ecliptarSlug,
  });
  if (error) return { room: null, error: error.message };
  return { room: data ? toStudyRoomDetails(data) : null, error: null };
}

export async function joinStudyRoom(args: {
  roomId?: string;
  code?: string;
  displayName: string;
  ecliptarSlug: string | null;
}): Promise<{ room: StudyRoomDetails | null; error: string | null }> {
  const { data, error } = await supabase.rpc("join_study_room", {
    p_room: args.roomId ?? null,
    p_code: args.code ?? null,
    p_display_name: args.displayName,
    p_ecliptar_slug: args.ecliptarSlug,
  });
  if (error) return { room: null, error: error.message };
  return { room: data ? toStudyRoomDetails(data) : null, error: null };
}

export async function leaveStudyRoom(roomId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_study_room", { p_room: roomId });
  if (error) console.error("leaveStudyRoom", error);
}

export async function getRoom(roomId: string): Promise<StudyRoom | null> {
  const rooms = await listStudyRooms();
  return rooms.find((r) => r.id === roomId) ?? null;
}

export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from("study_room_members")
    .select("room_id,user_id,display_name,ecliptar_slug,joined_at,tb_skip_used")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (error) { console.error("getRoomMembers", error); return []; }
  return data ?? [];
}

export async function getRoomMessages(roomId: string, limit = 100): Promise<RoomMessage[]> {
  const { data, error } = await supabase
    .from("study_room_messages")
    .select("id,room_id,user_id,author_name,ecliptar_slug,body,created_at,kind,moderation_status")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) { console.error("getRoomMessages", error); return []; }
  return (data ?? []).map((row) => ({
    id: row.id,
    room_id: row.room_id,
    user_id: row.user_id,
    author_name: row.author_name,
    ecliptar_slug: row.ecliptar_slug,
    body: row.body,
    created_at: row.created_at,
    kind: row.kind === "system" ? "system" : "chat",
    moderation_status: toModerationStatus(row.moderation_status),
  }));
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
  const { error } = await supabase.from("study_room_messages").insert({
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
    .from("study_room_members")
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
  const { error } = await supabase.rpc("set_room_pattern", {
    p_room: roomId, p_work: workMinutes, p_break: breakMinutes,
  });
  return error ? error.message : null;
}

/** Idempotent phase flip — racing clients collapse to one update on the server. */
export async function advanceRoomPhase(
  roomId: string, fromPhase: "work" | "break", fromStartedAt: string,
): Promise<void> {
  const { error } = await supabase.rpc("advance_room_phase", {
    p_room: roomId, p_from_phase: fromPhase, p_from_started_at: fromStartedAt,
  });
  if (error) console.error("advanceRoomPhase", error);
}

/** Ask the server to post the "still working?" nudge. Server enforces gating. */
export async function postIdleNudge(roomId: string): Promise<void> {
  const { error } = await supabase.rpc("post_idle_nudge", { p_room: roomId });
  if (error && !/Not a room member/i.test(error.message)) console.error("postIdleNudge", error);
}

/** Re-fetch a single room's current state (clock columns live on `get_study_rooms`). */
export async function refetchRoom(roomId: string): Promise<StudyRoom | null> {
  return await getRoom(roomId);
}

// ─── Goal/Resource Pin ──────────────────────────────────────────────────────

/** Set the room's single goal line (any member; null/empty clears it). */
export async function setRoomGoal(roomId: string, goal: string | null): Promise<string | null> {
  const { error } = await supabase.rpc("set_room_goal", { p_room: roomId, p_goal: goal });
  return error ? error.message : null;
}

/** Replace the room's resource links (the full list, max 3 — server enforces). */
export async function setRoomLinks(roomId: string, links: ResourceLink[]): Promise<string | null> {
  const { error } = await supabase.rpc("set_room_links", { p_room: roomId, p_links: links });
  return error ? error.message : null;
}
