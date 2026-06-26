import { useEffect, useRef, useState } from "react";
import { Lock, Send, Loader2, HelpCircle, ListChecks, Copy, X, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { streamLunaChat } from "@/lib/luna-api";
import {
  createStuckRequest, resolveStuckHuman, generateRecap, gatherRecapEvents,
  type StuckRequest, type RecapEvent,
} from "@/lib/study-luna";
import type { TeachBackRound } from "@/lib/study-teachback";

/* ── Ask: private, personal help. Ephemeral, client-only — never broadcast. ── */
export function AskLuna() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const ask = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setAnswer("");
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    await streamLunaChat({
      messages: [{ role: "user", content: question }],
      signal: ctrl.signal,
      onDelta: (t) => setAnswer((a) => a + t),
      onDone: () => setBusy(false),
      onError: (e) => { setAnswer(e); setBusy(false); },
    });
  };

  return (
    <div className="sr-ask">
      <div className="sr-ask-head">
        <Lock size={11} /> Ask Luna privately
        <span className="sr-ask-note">only you can see this</span>
      </div>
      {answer && (
        <div className="sr-ask-answer">
          {answer}
          <button className="sr-ask-clear" onClick={() => setAnswer("")} aria-label="Clear"><X size={12} /></button>
        </div>
      )}
      <div className="sr-ask-input">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }}
          placeholder="Hint, explanation, check my reasoning…"
          maxLength={1000}
        />
        <button className="sr-ask-send" onClick={ask} disabled={busy || !q.trim()}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}

/* ── Stuck launcher: posts a public card with an optional note. ── */
export function StuckLauncher({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async () => {
    setBusy(true);
    const err = await createStuckRequest(roomId, note.trim());
    setBusy(false);
    if (err) { toast.error("Couldn't post", { description: err }); return; }
    setNote(""); setOpen(false);
  };

  if (!open) {
    return (
      <button className="sr-toolbtn" onClick={() => setOpen(true)}>
        <HelpCircle size={13} /> I'm stuck
      </button>
    );
  }
  return (
    <div className="sr-stuck-launch">
      <input
        autoFocus value={note} maxLength={200}
        placeholder="What are you stuck on? (optional)"
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void post(); } if (e.key === "Escape") setOpen(false); }}
      />
      <button className="sr-toolbtn sr-toolbtn--go" onClick={post} disabled={busy}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : "Ask the room"}
      </button>
      <button className="sr-toolbtn" onClick={() => { setOpen(false); setNote(""); }} aria-label="Cancel"><X size={13} /></button>
    </div>
  );
}

/* ── Stuck card: visible to the room, ticking countdown, human resolution. ── */
export function StuckCard({ stuck, meId }: { stuck: StuckRequest; meId: string | null }) {
  const [now, setNow] = useState(Date.now());
  const [resolving, setResolving] = useState(false);
  useEffect(() => {
    if (stuck.status !== "open") return;
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, [stuck.status]);

  const secsLeft = Math.max(0, Math.ceil((new Date(stuck.ai_due_at).getTime() - now) / 1000));
  const isAsker = stuck.user_id === meId;
  const who = stuck.author_name || "A member";

  const takeIt = async () => {
    setResolving(true);
    const ok = await resolveStuckHuman(stuck.id);
    setResolving(false);
    if (!ok) toast("Someone already picked this up.");
  };

  return (
    <div className={`sr-stuck sr-stuck--${stuck.status}`}>
      <div className="sr-stuck-head">
        <HelpCircle size={14} className="sr-stuck-ico" />
        <span><b>{who}</b> is stuck{stuck.note ? ` on "${stuck.note}"` : ""} — anyone?</span>
      </div>

      {stuck.status === "open" && (
        <div className="sr-stuck-foot">
          <span className="sr-stuck-count">Luna jumps in in <b>{secsLeft}s</b> if no one answers</span>
          {!isAsker && (
            <button className="sr-stuck-take" onClick={takeIt} disabled={resolving}>
              {resolving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} I've got this
            </button>
          )}
        </div>
      )}

      {stuck.status === "resolving" && (
        <div className="sr-stuck-foot"><Loader2 size={12} className="animate-spin" /> Luna is writing a hint…</div>
      )}

      {stuck.status === "resolved" && (
        <div className="sr-stuck-resolved">
          <div className="sr-stuck-by">
            {stuck.resolved_by === "ai"
              ? <><Sparkles size={12} /> Luna stepped in</>
              : <><Check size={12} /> {stuck.resolver_name || "A member"} has this</>}
          </div>
          {stuck.resolved_by === "ai" && stuck.resolution_summary && (
            <div className="sr-stuck-ai">{stuck.resolution_summary}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Recap: structured-event-only summary; copyable artifact. ── */
export function RecapPanel({ stuck, rounds = [], goalText }: { stuck: StuckRequest[]; rounds?: TeachBackRound[]; goalText: string | null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  const run = async () => {
    setOpen(true); setText(null); setEmpty(false);
    const events: RecapEvent[] = gatherRecapEvents(stuck, rounds);
    if (events.length === 0) { setEmpty(true); return; }   // hard guard: never call the model with no events
    setLoading(true);
    const { text: out, error } = await generateRecap(events, goalText);
    setLoading(false);
    if (error) { toast.error("Couldn't build the recap", { description: error }); setOpen(false); return; }
    setText(out ?? "");
  };

  const copy = () => { if (text) { navigator.clipboard?.writeText(text); toast.success("Recap copied"); } };

  return (
    <>
      <button className="sr-toolbtn" onClick={run}><ListChecks size={13} /> Recap so far</button>
      {open && (
        <div className="sr-modal-bg" onClick={() => setOpen(false)}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()}>
            <button className="sr-back" onClick={() => setOpen(false)} style={{ float: "right" }}><X size={16} /></button>
            <h3>Session recap</h3>
            {empty ? (
              <p className="sr-modal-sub">Nothing to recap yet — this builds up as you go (resolved "stuck" questions, check-ins).</p>
            ) : loading ? (
              <p className="sr-modal-sub"><Loader2 size={14} className="animate-spin" style={{ display: "inline", marginRight: 6 }} /> Building from this session's events…</p>
            ) : (
              <>
                <pre className="sr-recap-text">{text}</pre>
                <div className="sr-modal-actions">
                  <button className="sr-toolbtn" onClick={copy}><Copy size={13} /> Copy</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
