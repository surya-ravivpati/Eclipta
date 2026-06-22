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
}

export interface RoomMember {
  room_id: string;
  user_id: string;
  display_name: string | null;
  ecliptar_slug: string | null;
  joined_at: string;
}

export interface RoomMessage {
  id: string;
  room_id: string;
  user_id: string;
  author_name: string | null;
  ecliptar_slug: string | null;
  body: string;
  created_at: string;
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
    .select("room_id,user_id,display_name,ecliptar_slug,joined_at")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (error) { console.error("getRoomMembers", error); return []; }
  return (data ?? []) as unknown as RoomMember[];
}

export async function getRoomMessages(roomId: string, limit = 100): Promise<RoomMessage[]> {
  const { data, error } = await supabase
    .from("study_room_messages" as any)
    .select("id,room_id,user_id,author_name,ecliptar_slug,body,created_at")
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
