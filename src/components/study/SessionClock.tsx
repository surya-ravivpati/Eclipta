import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Coffee, BookOpen, ChevronDown } from "lucide-react";
import { advanceRoomPhase, setRoomPattern, type StudyRoom } from "@/lib/study-rooms";
import { toast } from "sonner";

/**
 * Shared Session Clock — one room-wide countdown that every member sees in
 * sync. Clock state lives on `study_rooms`; this component is purely a view
 * over `phase_started_at + duration*60s − now()`. When the countdown hits
 * zero, every client racing here calls `advance_room_phase`; the server gates
 * on (phase, started_at) so only the first call advances and the rest no-op.
 *
 * Assumption: the clock keeps running even if the room is empty. The first
 * client to return computes the correct phase from the boundary anchor and
 * (if needed) requests the catch-up advance.
 */

const PRESETS: ReadonlyArray<{ label: string; w: number; b: number }> = [
  { label: "25 / 5",  w: 25, b: 5 },
  { label: "50 / 10", w: 50, b: 10 },
];

function fmt(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
}

export function SessionClock({ room, onPhaseFlip }: {
  room: StudyRoom;
  /** Fires once locally each time the visible phase transitions. The room
   *  view uses it to flush collapsed messages when work → break. */
  onPhaseFlip?: (next: "work" | "break") => void;
}) {
  const durationMin = room.phase === "work" ? room.work_minutes : room.break_minutes;
  const startedMs = useMemo(() => new Date(room.phase_started_at).getTime(), [room.phase_started_at]);
  const endMs = startedMs + durationMin * 60_000;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.floor((endMs - now) / 1000));

  // Race-to-advance. Each client tries once per (phase, started_at, expiry).
  const advanceKeyRef = useRef<string>("");
  useEffect(() => {
    if (remaining > 0) return;
    const key = `${room.id}:${room.phase}:${room.phase_started_at}`;
    if (advanceKeyRef.current === key) return;
    advanceKeyRef.current = key;
    void advanceRoomPhase(room.id, room.phase, room.phase_started_at);
  }, [remaining, room.id, room.phase, room.phase_started_at]);

  // Local phase-flip detector — fires onPhaseFlip when the realtime update
  // arrives. Compares against the last phase we saw rendered, not against
  // the countdown, so a mid-phase pattern change doesn't fire a fake flip.
  const lastPhaseRef = useRef(room.phase);
  useEffect(() => {
    if (lastPhaseRef.current !== room.phase) {
      lastPhaseRef.current = room.phase;
      onPhaseFlip?.(room.phase);
    }
  }, [room.phase, onPhaseFlip]);

  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customW, setCustomW] = useState(String(room.work_minutes));
  const [customB, setCustomB] = useState(String(room.break_minutes));

  const apply = async (w: number, b: number) => {
    setOpen(false); setCustomOpen(false);
    const err = await setRoomPattern(room.id, w, b);
    if (err) toast.error("Couldn't change pattern", { description: err });
  };

  const isWork = room.phase === "work";
  const total = durationMin * 60;
  const elapsed = total - remaining;
  const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;

  return (
    <div className={`sr-clock ${isWork ? "sr-clock--work" : "sr-clock--break"}`}>
      <div className="sr-clock-row">
        <span className="sr-clock-phase">
          {isWork ? <BookOpen size={13} /> : <Coffee size={13} />}
          {isWork ? "Focus" : "Break"}
        </span>
        <span className="sr-clock-time">{fmt(remaining)}</span>
        <div className="sr-clock-pattern">
          <button className="sr-clock-pbtn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <Clock size={11} /> {room.work_minutes}/{room.break_minutes}
            <ChevronDown size={11} />
          </button>
          {open && (
            <div className="sr-clock-menu" role="menu">
              {PRESETS.map((p) => (
                <button key={p.label} className="sr-clock-menu-item" onClick={() => apply(p.w, p.b)}>
                  {p.label}
                </button>
              ))}
              <button className="sr-clock-menu-item" onClick={() => setCustomOpen((v) => !v)}>
                Custom…
              </button>
              {customOpen && (
                <div className="sr-clock-custom">
                  <label>Work
                    <input type="number" min={1} max={180} value={customW}
                      onChange={(e) => setCustomW(e.target.value)} />
                  </label>
                  <label>Break
                    <input type="number" min={1} max={60} value={customB}
                      onChange={(e) => setCustomB(e.target.value)} />
                  </label>
                  <button
                    className="sr-clock-apply"
                    onClick={() => {
                      const w = Math.max(1, Math.min(180, parseInt(customW, 10) || 0));
                      const b = Math.max(1, Math.min(60, parseInt(customB, 10) || 0));
                      if (w && b) void apply(w, b);
                    }}
                  >Set</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="sr-clock-bar"><div className="sr-clock-bar-fill" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}