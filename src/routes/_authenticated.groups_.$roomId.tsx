import { useEffect, useRef, useState, useCallback } from "react";
import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Send, LogOut, Loader2, Users, Copy, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import "@/components/study/study.css";
import { LofiPlayer } from "@/components/study/LofiPlayer";
import { SessionClock } from "@/components/study/SessionClock";
import { GoalPin } from "@/components/study/GoalPin";
import { AskLuna, StuckLauncher, StuckCard, RecapPanel } from "@/components/study/RoomAssistant";
import { TeachBackBar, TeachBackCard } from "@/components/study/TeachBack";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getEcliptarBySlug } from "@/lib/ecliptars";
import {
  getRoom,
  getRoomMembers,
  getRoomMessages,
  sendRoomMessage,
  leaveStudyRoom,
  joinStudyRoom,
  getMyRoomIdentity,
  postIdleNudge,
  refetchRoom,
  setRoomGoal,
  setRoomLinks,
  type StudyRoom,
  type RoomMember,
  type RoomMessage,
} from "@/lib/study-rooms";
import { fetchStuckRequests, triggerStuckAi, type StuckRequest } from "@/lib/study-luna";
import {
  fetchTeachBackRounds,
  openTeachBackRound,
  passTeachBack,
  type TeachBackRound,
} from "@/lib/study-teachback";
import {
  RegenerateCodeButton,
  RemoveMemberButton,
  MessageMenu,
} from "@/components/study/RoomSafety";
import { useBlockedUsers } from "@/hooks/use-blocked-users";
import { moderate, calmBlockMessage } from "@/lib/moderation";
import { CrisisSupport } from "@/components/moderation/CrisisSupport";
import "@/components/moderation/crisis-support.css";

export const Route = createFileRoute("/_authenticated/groups_/$roomId")({
  component: StudyRoomView,
});

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function EcliptarAvatar({ slug, className }: { slug: string | null; className: string }) {
  const ec = slug ? getEcliptarBySlug(slug) : undefined;
  const Icon = ec?.icon ?? Sparkles;
  return (
    <span className={className}>
      <Icon size={16} />
    </span>
  );
}

function StudyRoomView() {
  const { roomId } = useParams({ from: "/_authenticated/groups_/$roomId" });
  const navigate = useNavigate();

  const [room, setRoom] = useState<StudyRoom | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  /** Per-client buffer of chat messages received while in `work` phase that
   *  haven't been revealed yet. Never synced - purely local display state. */
  const [pending, setPending] = useState<RoomMessage[]>([]);
  const [stuck, setStuck] = useState<StuckRequest[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [sending, setSending] = useState(false);

  const { isBlocked, block } = useBlockedUsers();
  const leftRef = useRef(false); // true once I deliberately leave (vs. removed)
  const [crisisOpen, setCrisisOpen] = useState(false);

  const stuckRef = useRef<StuckRequest[]>([]);
  stuckRef.current = stuck;
  const aiAttemptedRef = useRef<Set<string>>(new Set());
  const upsertStuck = useCallback((row: StuckRequest) => {
    setStuck((prev) => {
      const i = prev.findIndex((s) => s.id === row.id);
      if (i === -1) return [...prev, row];
      const next = [...prev];
      next[i] = row;
      return next;
    });
  }, []);

  const [rounds, setRounds] = useState<TeachBackRound[]>([]);
  const roundsRef = useRef<TeachBackRound[]>([]);
  roundsRef.current = rounds;
  const passAttemptedRef = useRef<Set<string>>(new Set());
  const upsertRound = useCallback((row: TeachBackRound) => {
    setRounds((prev) => {
      const i = prev.findIndex((r) => r.id === row.id);
      if (i === -1) return [...prev, row];
      const next = [...prev];
      next[i] = row;
      return next;
    });
  }, []);

  const meRef = useRef<{ userId: string | null; displayName: string; equippedSlug: string | null }>(
    {
      userId: null,
      displayName: "Learner",
      equippedSlug: null,
    },
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<StudyRoom | null>(null);
  roomRef.current = room;
  const subscribedOnceRef = useRef(false); // first realtime connect vs. reconnects

  const refreshMembers = useCallback(async () => {
    const list = await getRoomMembers(roomId);
    setMembers(list);
    // If I'm no longer in the member list and I didn't leave on my own, the
    // host removed me - surface a clear reason rather than a silent dead room.
    const me = meRef.current.userId;
    if (me && !leftRef.current && list.length > 0 && !list.some((m) => m.user_id === me)) {
      setRemoved(true);
    }
  }, [roomId]);

  /** Pull every live snapshot fresh from the server. Used on first load and as
   *  the single reconnect-resync path - clock/pin/queue derive from `room`,
   *  Stuck/Teach-Back come straight from their tables, so one refetch makes a
   *  reconnected client correct (no per-feature resync). */
  const loadSnapshots = useCallback(async () => {
    const [r, mem, msgs, st, rd] = await Promise.all([
      refetchRoom(roomId),
      getRoomMembers(roomId),
      getRoomMessages(roomId),
      fetchStuckRequests(roomId),
      fetchTeachBackRounds(roomId),
    ]);
    if (r) setRoom(r);
    setMembers(mem);
    setMessages(msgs);
    setPending([]); // authoritative refetch supersedes the local quiet-chat buffer
    setStuck(st);
    setRounds(rd);
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await getMyRoomIdentity();
      meRef.current = me;
      let r = await getRoom(roomId);
      // Direct link to a public room you haven't joined yet - join on entry.
      if (r && !r.am_member && r.is_public) {
        await joinStudyRoom({ roomId, displayName: me.displayName, ecliptarSlug: me.equippedSlug });
        r = await getRoom(roomId);
      }
      if (cancelled) return;
      if (!r?.am_member) {
        setDenied(true);
        setLoading(false);
        return;
      }
      setRoom(r);
      setMembers(await getRoomMembers(roomId));
      setMessages(await getRoomMessages(roomId));
      setStuck(await fetchStuckRequests(roomId));
      setRounds(await fetchTeachBackRounds(roomId));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // Realtime: new messages + member changes.
  useEffect(() => {
    if (denied) return;
    const channel = supabase
      .channel(`study:${roomId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "study_room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const m = payload.new as RoomMessage;
          // Quiet-chat collapse: during work phases, buffer incoming *chat*
          // messages from other people into the pending pill. System lines
          // and our own messages always go straight through.
          const r = roomRef.current;
          const isMine = m.user_id === meRef.current.userId;
          const shouldBuffer = r?.phase === "work" && m.kind === "chat" && !isMine;
          if (shouldBuffer) {
            setPending((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          } else {
            setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "study_room_members",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void refreshMembers();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "study_rooms", filter: `id=eq.${roomId}` },
        async () => {
          // Pattern change, phase flip, or activity-clock bump - re-fetch
          // the full room (RPC returns clock columns + member flags).
          const fresh = await refetchRoom(roomId);
          if (fresh) setRoom(fresh);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stuck_requests", filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.new && (payload.new as StuckRequest).id)
            upsertStuck(payload.new as StuckRequest);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "teach_back_rounds",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as TeachBackRound)?.id;
            if (id) setRounds((prev) => prev.filter((r) => r.id !== id));
          } else if (payload.new && (payload.new as TeachBackRound).id) {
            upsertRound(payload.new as TeachBackRound);
          }
        },
      )
      .subscribe((status) => {
        // First SUBSCRIBED is the initial connect (already loaded on mount).
        // Every SUBSCRIBED after that is a RE-connect: realtime drops events
        // while disconnected, so resync the full snapshot to undo any drift.
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          if (subscribedOnceRef.current) void loadSnapshots();
          else subscribedOnceRef.current = true;
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, denied, refreshMembers, upsertStuck, upsertRound, loadSnapshots]);

  // Tab return / network back online -> resync (same single path as reconnect).
  useEffect(() => {
    if (denied || removed) return;
    const resync = () => {
      if (document.visibilityState === "visible") void loadSnapshots();
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("online", resync);
    };
  }, [denied, removed, loadSnapshots]);

  // Keep chat pinned to the latest visible message.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  /**
   * Idle nudge - every 30s while in `work` phase, if the room has been
   * silent for 10+ minutes, ask the server to post the nudge. The server
   * enforces "only one per idle stretch" and "never during break" so
   * multiple clients calling this is harmless.
   */
  useEffect(() => {
    if (denied || !room) return;
    const tick = () => {
      const r = roomRef.current;
      if (r?.phase !== "work") return;
      const idleMs = Date.now() - new Date(r.last_activity_at).getTime();
      if (idleMs > 10 * 60_000) void postIdleNudge(roomId);
    };
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [denied, room, roomId]);

  // Stuck AI fallback driver - once a card's countdown hits zero with no human
  // answer, fire the server claim. Each client attempts at most once per card;
  // the server claims atomically so only one AI answer is ever produced.
  useEffect(() => {
    if (denied) return;
    const tick = () => {
      const nowMs = Date.now();
      for (const s of stuckRef.current) {
        if (s.status !== "open") continue;
        if (aiAttemptedRef.current.has(s.id)) continue;
        if (new Date(s.ai_due_at).getTime() <= nowMs) {
          aiAttemptedRef.current.add(s.id);
          void triggerStuckAi(s.id);
        }
      }
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [denied]);

  /** When phase flips, flush any buffered messages so break-time is normal, and
   *  - if Teach-Back is on - open a round for the next person. Every client
   *  fires this; the server gates so exactly one round is created per flip. */
  const onPhaseFlip = useCallback(
    (next: "work" | "break") => {
      if (next === "break") {
        setPending((buf) => {
          if (buf.length === 0) return buf;
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...prev, ...buf.filter((m) => !seen.has(m.id))];
          });
          return [];
        });
        const r = roomRef.current;
        if (r?.teach_back_enabled) {
          // trigger_key = the break phase's start time -> unique per transition.
          void openTeachBackRound(roomId, r.phase_started_at);
        }
      }
    },
    [roomId],
  );

  // Leaver mid-turn -> auto-pass to the next person (no skip charged). Any
  // remaining client may call it; the server collapses concurrent calls.
  useEffect(() => {
    const memberIds = new Set(members.map((m) => m.user_id));
    for (const r of rounds) {
      if (r.status !== "pending" || !r.explainer_id) continue;
      if (memberIds.has(r.explainer_id)) continue;
      if (passAttemptedRef.current.has(r.id)) continue;
      passAttemptedRef.current.add(r.id);
      void passTeachBack(r.id);
    }
  }, [members, rounds]);

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

    // Unified moderation pipeline - same path as forums & usernames.
    const verdict = await moderate(body, "chat_message");
    // Self-harm is its own supportive path: show resources, never block on it.
    if (verdict.selfHarm) setCrisisOpen(true);
    if (verdict.blocked) {
      setSending(false);
      toast.error(calmBlockMessage(verdict.category));
      setDraft(body);
      return;
    }
    if (verdict.paused) {
      setSending(false);
      toast.error("Posting is paused for now, pending review.");
      setDraft(body);
      return;
    }

    const myMember = members.find((m) => m.user_id === meRef.current.userId);
    const err = await sendRoomMessage({
      roomId,
      body,
      authorName: meRef.current.displayName,
      ecliptarSlug: myMember?.ecliptar_slug ?? meRef.current.equippedSlug,
    });
    setSending(false);
    if (err) {
      // The DB trigger is the bypass-proof floor; surface its calm rejection.
      const msg = /check_violation|moderation|rejected/i.test(err)
        ? "That message couldn't be sent."
        : err;
      toast.error(msg, { description: undefined });
      setDraft(body);
    }
  };

  const leave = async () => {
    leftRef.current = true; // so the member-list change reads as "I left", not "removed"
    await leaveStudyRoom(roomId);
    toast("You left the room");
    void navigate({ to: "/groups" });
  };

  const blockAuthor = async (userId: string, name: string) => {
    const err = await block(userId);
    if (err) toast.error("Couldn't block", { description: err });
    else toast(`You blocked ${name}`, { description: "You won't see their messages anymore." });
  };

  const copyCode = () => {
    if (!room?.join_code) return;
    void navigator.clipboard?.writeText(room.join_code);
    toast.success("Join code copied");
  };

  if (loading) {
    return (
      <div className="sr">
        <div className="sr-wrap sr-empty">
          <Loader2 className="animate-spin" size={18} style={{ display: "inline" }} /> Entering
          room...
        </div>
      </div>
    );
  }
  if (removed) {
    return (
      <div className="sr">
        <div className="sr-wrap">
          <button
            className="sr-back active:scale-[0.97] hover:opacity-90"
            onClick={() => navigate({ to: "/groups" })}
          >
            <ArrowLeft size={13} /> Study Rooms
          </button>
          <div className="sr-empty">
            You were removed from this room by the host. You'll need a fresh code from them to
            return.
          </div>
        </div>
      </div>
    );
  }
  if (denied || !room) {
    return (
      <div className="sr">
        <div className="sr-wrap">
          <button
            className="sr-back active:scale-[0.97] hover:opacity-90"
            onClick={() => navigate({ to: "/groups" })}
          >
            <ArrowLeft size={13} /> Study Rooms
          </button>
          <div className="sr-empty">
            This room is private or no longer exists. Ask a member for the join code.
          </div>
        </div>
      </div>
    );
  }

  const isHost = !!meRef.current.userId && meRef.current.userId === room.host_id;

  // Blocking is account-level and personal: hide a blocked person's chat (system
  // lines have no human author, so they're never hidden). Filtering at render
  // means the block takes effect immediately, here and in any other room.
  const myId = meRef.current.userId;
  const visibleMessages = messages.filter((m) => {
    if (m.kind === "chat" && isBlocked(m.user_id)) return false; // personal block
    // Moderator-hidden/removed chat is hidden from everyone but its author.
    if (m.moderation_status && m.moderation_status !== "visible" && m.user_id !== myId)
      return false;
    return true;
  });
  const visiblePending = pending.filter((m) => !isBlocked(m.user_id));

  return (
    <div className="sr">
      <div className="sr-wrap">
        <button
          className="sr-back active:scale-[0.97] hover:opacity-90"
          onClick={() => navigate({ to: "/groups" })}
        >
          <ArrowLeft size={13} /> Study Rooms
        </button>

        <div
          className="sr-roomhead"
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1>{room.name}</h1>
            {room.topic && <p className="sr-roomtopic">{room.topic}</p>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LofiPlayer />
            <button className="sr-btn active:scale-[0.97] hover:opacity-90" onClick={leave}>
              <LogOut size={14} /> Leave
            </button>
          </div>
        </div>

        {/* Goal/Resource Pin - always-visible, no-scroll room header strip */}
        <GoalPin
          room={room}
          onSetGoal={(g) => setRoomGoal(roomId, g)}
          onSetLinks={(l) => setRoomLinks(roomId, l)}
        />

        <div className="sr-room">
          <aside className="sr-side">
            <h4>
              <Users size={11} style={{ display: "inline", marginRight: 5 }} />
              Members | {members.length}
            </h4>
            {members.map((m) => {
              const isMe = m.user_id === meRef.current.userId;
              const ec = m.ecliptar_slug ? getEcliptarBySlug(m.ecliptar_slug) : undefined;
              const isMemberHost = m.user_id === room.host_id;
              return (
                <div className="sr-member" key={m.user_id}>
                  <EcliptarAvatar slug={m.ecliptar_slug} className="sr-member-ava" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="sr-member-name">
                      {m.display_name || "Learner"}{" "}
                      {isMe && <span className="sr-member-you">YOU</span>}
                      {isMemberHost && (
                        <span className="sr-member-host" title="Room host">
                          HOST
                        </span>
                      )}
                    </div>
                    <div className="sr-member-ec">{ec?.name ?? "No Ecliptar"}</div>
                  </div>
                  {/* Host-only remove - rendered only for the host, never shown
                      disabled to others. Can't remove yourself. */}
                  {isHost && !isMe && (
                    <RemoveMemberButton
                      roomId={roomId}
                      userId={m.user_id}
                      name={m.display_name || "this member"}
                    />
                  )}
                </div>
              );
            })}

            {!room.is_public && room.join_code && (
              <div className="sr-code">
                <h4>
                  <Lock size={11} style={{ display: "inline", marginRight: 5 }} />
                  Invite code
                </h4>
                <span className="sr-code-val" onClick={copyCode} title="Click to copy">
                  {room.join_code}
                </span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    className="sr-btn active:scale-[0.97] hover:opacity-90"
                    style={{ marginTop: 10, fontSize: 11, padding: "6px 12px" }}
                    onClick={copyCode}
                  >
                    <Copy size={12} /> Copy code
                  </button>
                  {/* Host-only: regenerate. Old code stops working for new joins. */}
                  {isHost && <RegenerateCodeButton roomId={roomId} />}
                </div>
              </div>
            )}
          </aside>

          <section className="sr-chat">
            <SessionClock room={room} onPhaseFlip={onPhaseFlip} />
            <TeachBackBar room={room} members={members} />
            <div className="sr-chat-scroll" ref={scrollRef}>
              {visibleMessages.length === 0 && stuck.length === 0 && rounds.length === 0 ? (
                <div className="sr-chat-empty">
                  It's quiet in here. Say hello and get the session going. ☕
                </div>
              ) : (
                // Merge chat messages, Stuck cards and Teach-Back rounds into one
                // time-ordered stream.
                [
                  ...visibleMessages.map((m) => {
                    const isMine = m.user_id === meRef.current.userId;
                    return {
                      at: m.created_at,
                      node:
                        m.kind === "system" ? (
                          <div className="sr-system" key={`m-${m.id}`}>
                            <span className="sr-system-text">{m.body}</span>
                            <MessageMenu
                              roomId={roomId}
                              targetId={m.id}
                              authorKind="system"
                              reportedUserId={null}
                              authorName="System"
                              snapshot={m.body}
                              canBlock={false}
                              onBlock={() => {}}
                            />
                          </div>
                        ) : (
                          <div className="sr-msg" key={`m-${m.id}`}>
                            <EcliptarAvatar slug={m.ecliptar_slug} className="sr-msg-ava" />
                            <div className="sr-msg-body">
                              <div className="sr-msg-meta">
                                <span
                                  className={`sr-msg-author ${isMine ? "sr-msg-author--me" : ""}`}
                                >
                                  {m.author_name || "Learner"}
                                </span>
                                <span className="sr-msg-time">{clock(m.created_at)}</span>
                                <MessageMenu
                                  roomId={roomId}
                                  targetId={m.id}
                                  authorKind="human"
                                  reportedUserId={m.user_id}
                                  authorName={m.author_name || "this person"}
                                  snapshot={m.body}
                                  canBlock={!isMine}
                                  onBlock={() =>
                                    void blockAuthor(m.user_id, m.author_name || "this person")
                                  }
                                />
                              </div>
                              <div className="sr-msg-text">{m.body}</div>
                            </div>
                          </div>
                        ),
                    };
                  }),
                  ...stuck.map((s) => ({
                    at: s.created_at,
                    node: (
                      <StuckCard
                        key={`s-${s.id}`}
                        stuck={s}
                        meId={meRef.current.userId}
                        roomId={roomId}
                      />
                    ),
                  })),
                  ...rounds
                    .filter((r) => r.status !== "claiming" && r.explainer_id)
                    .map((r) => ({
                      at: r.created_at,
                      node: (
                        <TeachBackCard
                          key={`tb-${r.id}`}
                          round={r}
                          meId={meRef.current.userId}
                          mySkipUsed={
                            !!members.find((m) => m.user_id === meRef.current.userId)?.tb_skip_used
                          }
                        />
                      ),
                    })),
                ]
                  .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
                  .map((t) => t.node)
              )}
            </div>
            {visiblePending.length > 0 && (
              <div className="sr-pending">
                <button
                  className="sr-pending-btn active:scale-[0.97] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={revealPending}
                >
                  {visiblePending.length} new message{visiblePending.length === 1 ? "" : "s"} - tap
                  to show
                </button>
              </div>
            )}
            <div className="sr-assist">
              <StuckLauncher roomId={roomId} />
              <RecapPanel stuck={stuck} rounds={rounds} goalText={room.goal_text ?? null} />
            </div>
            <div className="sr-chat-input">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Message the room..."
                maxLength={1000}
              />
              <button
                className="sr-send active:scale-[0.97] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={send}
                disabled={sending || !draft.trim()}
              >
                {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              </button>
            </div>

            {/* Ask Luna - private, only the asker sees this; never broadcast. */}
            <AskLuna />

            {/* Supportive resources if a message read as self-harm/distress.
                Not a moderation block, and never attributed to Luna. */}
            <CrisisSupport open={crisisOpen} onClose={() => setCrisisOpen(false)} />
          </section>
        </div>
      </div>
    </div>
  );
}
