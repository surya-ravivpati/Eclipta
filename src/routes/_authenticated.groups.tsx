import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Users, ChevronRight, Plus, KeyRound, Lock, Globe, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import "@/components/study/study.css";
import {
  listStudyRooms, createStudyRoom, joinStudyRoom, getMyRoomIdentity,
  type StudyRoom,
} from "@/lib/study-rooms";
import { useOwnedEcliptars } from "@/hooks/use-player-xp";
import { ECLIPTARS, getEcliptarBySlug } from "@/lib/ecliptars";

export const Route = createFileRoute("/_authenticated/groups")({
  head: () => ({
    meta: [
      { title: "Study Rooms – Eclipta" },
      { name: "description", content: "Cozy public and private study rooms with live chat and lofi." },
    ],
  }),
  component: StudyRoomsLobby,
});

function EcliptarPicker({
  ownedSlugs, value, onChange,
}: { ownedSlugs: Set<string>; value: string | null; onChange: (s: string) => void }) {
  const owned = ECLIPTARS.filter((e) => ownedSlugs.has(e.slug));
  if (owned.length === 0) {
    return <p className="sr-modal-sub">Unlock Ecliptars on the Trophy Road to represent you here.</p>;
  }
  return (
    <div className="sr-ec-grid">
      {owned.map((e) => (
        <button
          type="button"
          key={e.slug}
          className={`sr-ec ${value === e.slug ? "is-on" : ""}`}
          onClick={() => onChange(e.slug)}
        >
          <e.icon size={20} />
          {e.name}
        </button>
      ))}
    </div>
  );
}

function StudyRoomsLobby() {
  const navigate = useNavigate();
  const { slugs: ownedSlugs } = useOwnedEcliptars();
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<{ displayName: string; equippedSlug: string | null }>({
    displayName: "Learner", equippedSlug: null,
  });
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setRooms(await listStudyRooms());
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    void getMyRoomIdentity().then((i) => setIdentity({ displayName: i.displayName, equippedSlug: i.equippedSlug }));
  }, []);

  const mine = useMemo(() => rooms.filter((r) => r.am_member), [rooms]);
  const discover = useMemo(() => rooms.filter((r) => !r.am_member && r.is_public), [rooms]);

  const openRoom = async (room: StudyRoom) => {
    if (room.am_member) {
      navigate({ to: "/groups/$roomId", params: { roomId: room.id } });
      return;
    }
    // Public room you're not in yet — join, then enter.
    const ec = identity.equippedSlug ?? (ownedSlugs.size ? [...ownedSlugs][0] : null);
    const { error } = await joinStudyRoom({ roomId: room.id, displayName: identity.displayName, ecliptarSlug: ec });
    if (error) { toast.error("Couldn't join", { description: error }); return; }
    navigate({ to: "/groups/$roomId", params: { roomId: room.id } });
  };

  return (
    <div className="sr">
      <div className="sr-wrap">
        <header className="sr-head">
          <p className="sr-kicker">Study Rooms</p>
          <h1 className="sr-title">Learn <em>together</em>.</h1>
          <p className="sr-sub">
            Drop into a public room or spin up a private one for your friends. Bring an Ecliptar,
            chat in real time, and let the lofi run while you work.
          </p>
        </header>

        <div className="sr-toolbar">
          <button className="sr-btn sr-btn--solid" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> Create a room
          </button>
          <button className="sr-btn" onClick={() => setShowJoin(true)}>
            <KeyRound size={15} /> Join with a code
          </button>
        </div>

        {loading ? (
          <div className="sr-empty"><Loader2 className="animate-spin" size={18} style={{ display: "inline" }} /> Loading rooms…</div>
        ) : (
          <>
            <div className="sr-seclabel">Your rooms</div>
            {mine.length === 0 ? (
              <div className="sr-empty">You haven't joined a room yet. Create one or hop into a public room below.</div>
            ) : (
              <div className="sr-grid">
                {mine.map((r) => <RoomCard key={r.id} room={r} onOpen={openRoom} />)}
              </div>
            )}

            <div className="sr-seclabel">Public rooms</div>
            {discover.length === 0 ? (
              <div className="sr-empty">No public rooms yet — be the first to start one.</div>
            ) : (
              <div className="sr-grid">
                {discover.map((r) => <RoomCard key={r.id} room={r} onOpen={openRoom} />)}
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <CreateModal
          ownedSlugs={ownedSlugs}
          defaultSlug={identity.equippedSlug}
          displayName={identity.displayName}
          onClose={() => setShowCreate(false)}
          onCreated={(room) => { setShowCreate(false); navigate({ to: "/groups/$roomId", params: { roomId: room.id } }); }}
        />
      )}
      {showJoin && (
        <JoinModal
          ownedSlugs={ownedSlugs}
          defaultSlug={identity.equippedSlug}
          displayName={identity.displayName}
          onClose={() => setShowJoin(false)}
          onJoined={(room) => { setShowJoin(false); navigate({ to: "/groups/$roomId", params: { roomId: room.id } }); }}
        />
      )}
    </div>
  );
}

function RoomCard({ room, onOpen }: { room: StudyRoom; onOpen: (r: StudyRoom) => void }) {
  return (
    <button className="sr-card" onClick={() => onOpen(room)}>
      <div className="sr-card-top">
        <span className="sr-card-name">{room.name}</span>
        <span className={`sr-tag ${room.is_public ? "sr-tag--public" : "sr-tag--private"}`}>
          {room.is_public ? <Globe size={9} style={{ marginRight: 3, display: "inline" }} /> : <Lock size={9} style={{ marginRight: 3, display: "inline" }} />}
          {room.is_public ? "Public" : "Private"}
        </span>
      </div>
      <div className="sr-card-topic">{room.topic || "—"}</div>
      <div className="sr-card-foot">
        <span className="sr-members"><Users size={12} /> {room.member_count}</span>
        <span className="sr-card-cta">{room.am_member ? "Open" : "Join"} <ChevronRight size={12} /></span>
      </div>
    </button>
  );
}

function CreateModal({
  ownedSlugs, defaultSlug, displayName, onClose, onCreated,
}: {
  ownedSlugs: Set<string>; defaultSlug: string | null; displayName: string;
  onClose: () => void; onCreated: (room: StudyRoom) => void;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [slug, setSlug] = useState<string | null>(defaultSlug);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error("Give your room a name"); return; }
    setBusy(true);
    const { room, error } = await createStudyRoom({
      name, topic, isPublic, displayName,
      ecliptarSlug: slug ?? (ownedSlugs.size ? [...ownedSlugs][0] : null),
    });
    setBusy(false);
    if (error || !room) { toast.error("Couldn't create room", { description: error ?? undefined }); return; }
    toast.success(`"${room.name}" is open`);
    onCreated(room);
  };

  return (
    <div className="sr-modal-bg" onClick={onClose}>
      <div className="sr-modal" onClick={(e) => e.stopPropagation()}>
        <button className="sr-back" onClick={onClose} style={{ float: "right" }}><X size={16} /></button>
        <h3>Create a room</h3>
        <p className="sr-modal-sub">Public rooms appear in the lobby. Private rooms are invite-only via a join code.</p>

        <div className="sr-field">
          <label>Room name</label>
          <input className="sr-input" value={name} maxLength={60} placeholder="Late-night calculus" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="sr-field">
          <label>Topic (optional)</label>
          <input className="sr-input" value={topic} maxLength={140} placeholder="Derivatives & limits" onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div className="sr-field">
          <label>Visibility</label>
          <div className="sr-toggle-row">
            <button className={`sr-seg ${isPublic ? "is-on" : ""}`} onClick={() => setIsPublic(true)}><Globe size={12} /> Public</button>
            <button className={`sr-seg ${!isPublic ? "is-on" : ""}`} onClick={() => setIsPublic(false)}><Lock size={12} /> Private</button>
          </div>
        </div>
        <div className="sr-field">
          <label>Your Ecliptar</label>
          <EcliptarPicker ownedSlugs={ownedSlugs} value={slug} onChange={setSlug} />
        </div>

        <div className="sr-modal-actions">
          <button className="sr-btn" onClick={onClose}>Cancel</button>
          <button className="sr-btn sr-btn--solid" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />} Create
          </button>
        </div>
      </div>
    </div>
  );
}

function JoinModal({
  ownedSlugs, defaultSlug, displayName, onClose, onJoined,
}: {
  ownedSlugs: Set<string>; defaultSlug: string | null; displayName: string;
  onClose: () => void; onJoined: (room: StudyRoom) => void;
}) {
  const [code, setCode] = useState("");
  const [slug, setSlug] = useState<string | null>(defaultSlug);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (code.trim().length < 4) { toast.error("Enter the room's join code"); return; }
    setBusy(true);
    const { room, error } = await joinStudyRoom({
      code: code.trim(), displayName,
      ecliptarSlug: slug ?? (ownedSlugs.size ? [...ownedSlugs][0] : null),
    });
    setBusy(false);
    if (error || !room) { toast.error("Couldn't join", { description: error ?? undefined }); return; }
    toast.success(`Joined "${room.name}"`);
    onJoined(room);
  };

  return (
    <div className="sr-modal-bg" onClick={onClose}>
      <div className="sr-modal" onClick={(e) => e.stopPropagation()}>
        <button className="sr-back" onClick={onClose} style={{ float: "right" }}><X size={16} /></button>
        <h3>Join with a code</h3>
        <p className="sr-modal-sub">Got a code from a friend? Drop it in to enter their private room.</p>
        <div className="sr-field">
          <label>Join code</label>
          <input
            className="sr-input"
            value={code}
            maxLength={6}
            placeholder="A1B2C3"
            style={{ letterSpacing: "0.3em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
        <div className="sr-field">
          <label>Your Ecliptar</label>
          <EcliptarPicker ownedSlugs={ownedSlugs} value={slug} onChange={setSlug} />
        </div>
        <div className="sr-modal-actions">
          <button className="sr-btn" onClick={onClose}>Cancel</button>
          <button className="sr-btn sr-btn--solid" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : <KeyRound size={14} />} Join
          </button>
        </div>
      </div>
    </div>
  );
}
