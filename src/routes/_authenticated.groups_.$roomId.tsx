import { useEffect, useRef, useState, useCallback } from "react";
import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Send, LogOut, Loader2, Users, Copy, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import "@/components/study/study.css";
import { LofiPlayer } from "@/components/study/LofiPlayer";
import { SessionClock } from "@/components/study/SessionClock";
import { GoalPin } from "@/components/study/GoalPin";
import { supabase } from "@/integrations/supabase/client";
import { getEcliptarBySlug } from "@/lib/ecliptars";
import {
  getRoom, getRoomMembers, getRoomMessages, sendRoomMessage, leaveStudyRoom,
  joinStudyRoom, getMyRoomIdentity, postIdleNudge, refetchRoom,
  setRoomGoal, setRoomLinks,
  type StudyRoom, type RoomMember, type RoomMessage,
} from "@/lib/study-rooms";

export const Route = createFileRoute("/_authenticated/groups_/$roomId")({
  component: StudyRoomView,
});

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function EcliptarAvatar({ slug, className }: { slug: string | null; className: string }) {
  const ec = slug ? getEcliptarBySlug(slug) : undefined;
  const Icon = ec?.icon ?? Sparkles;
  return <span className={className}><Icon size={16} /></span>;
}

function StudyRoomView() {
  const { roomId } = useParams({ from: "/_authenticated/groups_/$roomId" });
  const navigate = useNavigate();

  const [room, setRoom] = useState<StudyRoom | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  /** Per-client buffer of chat messages received while in `work` phase that
   *  haven't been revealed yet. Never synced — purely local display state. */
  const [pending, setPending] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [sending, setSending] = useState(false);

  const meRef = useRef<{ userId: string | null; displayName: string; equippedSlug: string | null }>({
    userId: null, displayName: "Learner", equippedSlug: null,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<StudyRoom | null>(null);
  roomRef.current = room;

  const refreshMembers = useCallback(async () => setMembers(await getRoomMembers(roomId)), [roomId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await getMyRoomIdentity();
      meRef.current = me;
      let r = await getRoom(roomId);
      // Direct link to a public room you haven't joined yet — join on entry.
      if (r && !r.am_member && r.is_public) {
        await joinStudyRoom({ roomId, displayName: me.displayName, ecliptarSlug: me.equippedSlug });
        r = await getRoom(roomId);
      }
      if (cancelled) return;
      if (!r || !r.am_member) { setDenied(true); setLoading(false); return; }
      setRoom(r);
      setMembers(await getRoomMembers(roomId));
      setMessages(await getRoomMessages(roomId));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [roomId]);

  // Realtime: new messages + member changes.
  useEffect(() => {
    if (denied) return;
    const channel = supabase
      .channel(`study:${roomId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "study_room_messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const m = payload.new as RoomMessage;
          // Quiet-chat collapse: during work phases, buffer incoming *chat*
          // messages from other people into the pending pill. System lines
          // and our own messages always go straight through.
          const r = roomRef.current;
          const isMine = m.user_id === meRef.current.userId;
          const shouldBuffer =
            r?.phase === "work" && m.kind === "chat" && !isMine;
          if (shouldBuffer) {
            setPending((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          } else {
            setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          }
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "study_room_members", filter: `room_id=eq.${roomId}` },
        () => { void refreshMembers(); })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "study_rooms", filter: `id=eq.${roomId}` },
        async () => {
          // Pattern change, phase flip, or activity-clock bump — re-fetch
          // the full room (RPC returns clock columns + member flags).
          const fresh = await refetchRoom(roomId);
          if (fresh) setRoom(fresh);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, denied, refreshMembers]);

  // Keep chat pinned to the latest visible message.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  /**
   * Idle nudge — every 30s while in `work` phase, if the room has been
   * silent for 10+ minutes, ask the server to post the nudge. The server
   * enforces "only one per idle stretch" and "never during break" so
   * multiple clients calling this is harmless.
   */
  useEffect(() => {
    if (denied || !room) return;
    const tick = () => {
      const r = roomRef.current;
      if (!r || r.phase !== "work") return;
      const idleMs = Date.now() - new Date(r.last_activity_at).getTime();
      if (idleMs > 10 * 60_000) void postIdleNudge(roomId);
    };
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [denied, room, roomId]);

  /** When phase flips, flush any buffered messages so break-time is normal. */
  const onPhaseFlip = useCallback((next: "work" | "break") => {
    if (next === "break") {
      setPending((buf) => {
        if (buf.length === 0) return buf;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...buf.filter((m) => !seen.has(m.id))];
        });
        return [];
      });
    }
  }, []);

  const revealPending = () => {
    setPending((buf) => {
      if (buf.length === 0) return buf;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...buf.filter((m) => !seen.has(m.id))];
      });
      return [];
    });
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    const myMember = members.find((m) => m.user_id === meRef.current.userId);
    const err = await sendRoomMessage({
      roomId, body,
      authorName: meRef.current.displayName,
      ecliptarSlug: myMember?.ecliptar_slug ?? meRef.current.equippedSlug,
    });
    setSending(false);
    if (err) { toast.error("Message didn't send", { description: err }); setDraft(body); }
  };

  const leave = async () => {
    await leaveStudyRoom(roomId);
    toast("You left the room");
    navigate({ to: "/groups" });
  };

  const copyCode = () => {
    if (!room?.join_code) return;
    navigator.clipboard?.writeText(room.join_code);
    toast.success("Join code copied");
  };

  if (loading) {
    return <div className="sr"><div className="sr-wrap sr-empty"><Loader2 className="animate-spin" size={18} style={{ display: "inline" }} /> Entering room…</div></div>;
  }
  if (denied || !room) {
    return (
      <div className="sr"><div className="sr-wrap">
        <button className="sr-back" onClick={() => navigate({ to: "/groups" })}><ArrowLeft size={13} /> Study Rooms</button>
        <div className="sr-empty">This room is private or no longer exists. Ask a member for the join code.</div>
      </div></div>
    );
  }

  return (
    <div className="sr">
      <div className="sr-wrap">
        <button className="sr-back" onClick={() => navigate({ to: "/groups" })}><ArrowLeft size={13} /> Study Rooms</button>

        <div className="sr-roomhead" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1>{room.name}</h1>
            {room.topic && <p className="sr-roomtopic">{room.topic}</p>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LofiPlayer />
            <button className="sr-btn" onClick={leave}><LogOut size={14} /> Leave</button>
          </div>
        </div>

        {/* Goal/Resource Pin — always-visible, no-scroll room header strip */}
        <GoalPin
          room={room}
          onSetGoal={(g) => setRoomGoal(roomId, g)}
          onSetLinks={(l) => setRoomLinks(roomId, l)}
        />

        <div className="sr-room">
          <aside className="sr-side">
            <h4><Users size={11} style={{ display: "inline", marginRight: 5 }} />Members · {members.length}</h4>
            {members.map((m) => {
              const isMe = m.user_id === meRef.current.userId;
              const ec = m.ecliptar_slug ? getEcliptarBySlug(m.ecliptar_slug) : undefined;
              return (
                <div className="sr-member" key={m.user_id}>
                  <EcliptarAvatar slug={m.ecliptar_slug} className="sr-member-ava" />
                  <div style={{ minWidth: 0 }}>
                    <div className="sr-member-name">
                      {m.display_name || "Learner"} {isMe && <span className="sr-member-you">YOU</span>}
                    </div>
                    <div className="sr-member-ec">{ec?.name ?? "No Ecliptar"}</div>
                  </div>
                </div>
              );
            })}

            {!room.is_public && room.join_code && (
              <div className="sr-code">
                <h4><Lock size={11} style={{ display: "inline", marginRight: 5 }} />Invite code</h4>
                <span className="sr-code-val" onClick={copyCode} title="Click to copy">{room.join_code}</span>
                <button className="sr-btn" style={{ marginTop: 10, fontSize: 11, padding: "6px 12px" }} onClick={copyCode}>
                  <Copy size={12} /> Copy code
                </button>
              </div>
            )}
          </aside>

          <section className="sr-chat">
            <SessionClock room={room} onPhaseFlip={onPhaseFlip} />
            <div className="sr-chat-scroll" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="sr-chat-empty">It's quiet in here. Say hello and get the session going. ☕</div>
              ) : messages.map((m) => {
                if (m.kind === "system") {
                  return (
                    <div className="sr-system" key={m.id}>
                      <span className="sr-system-text">{m.body}</span>
                    </div>
                  );
                }
                const isMe = m.user_id === meRef.current.userId;
                return (
                  <div className="sr-msg" key={m.id}>
                    <EcliptarAvatar slug={m.ecliptar_slug} className="sr-msg-ava" />
                    <div className="sr-msg-body">
                      <div className="sr-msg-meta">
                        <span className={`sr-msg-author ${isMe ? "sr-msg-author--me" : ""}`}>{m.author_name || "Learner"}</span>
                        <span className="sr-msg-time">{clock(m.created_at)}</span>
                      </div>
                      <div className="sr-msg-text">{m.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {pending.length > 0 && (
              <div className="sr-pending">
                <button className="sr-pending-btn" onClick={revealPending}>
                  {pending.length} new message{pending.length === 1 ? "" : "s"} — tap to show
                </button>
              </div>
            )}
            <div className="sr-chat-input">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                placeholder="Message the room…"
                maxLength={1000}
              />
              <button className="sr-send" onClick={send} disabled={sending || !draft.trim()}>
                {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
