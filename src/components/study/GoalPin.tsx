import { useEffect, useRef, useState } from "react";
import { Target, Plus, X, ExternalLink, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ResourceLink, StudyRoom } from "@/lib/study-rooms";

/**
 * Goal/Resource Pin — quiet, always-visible room header strip: one goal line +
 * up to 3 resource links, editable inline by any member, synced to all via the
 * room's realtime state. Deliberately minimal — a label on a folder.
 */

const MAX_LINKS = 3;

function normalizeUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (!u.hostname.includes(".")) return null;   // must look like a domain
    return u.href;
  } catch { return null; }
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function GoalPin({
  room, onSetGoal, onSetLinks,
}: {
  room: StudyRoom;
  onSetGoal: (goal: string | null) => Promise<string | null>;
  onSetLinks: (links: ResourceLink[]) => Promise<string | null>;
}) {
  const links = room.resource_links ?? [];

  // ── Goal line ──
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(room.goal_text ?? "");
  const [savingGoal, setSavingGoal] = useState(false);
  const goalInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (editingGoal) goalInputRef.current?.focus(); }, [editingGoal]);
  // Keep the draft in sync when not actively editing (realtime updates).
  useEffect(() => { if (!editingGoal) setGoalDraft(room.goal_text ?? ""); }, [room.goal_text, editingGoal]);

  const commitGoal = async () => {
    const next = goalDraft.replace(/[\r\n]+/g, " ").trim();
    setEditingGoal(false);
    if (next === (room.goal_text ?? "")) return;
    setSavingGoal(true);
    const err = await onSetGoal(next || null);
    setSavingGoal(false);
    if (err) { toast.error("Couldn't save the goal", { description: err }); setGoalDraft(room.goal_text ?? ""); }
  };

  // ── Links ──
  const [adding, setAdding] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [savingLink, setSavingLink] = useState(false);

  const addLink = async () => {
    const url = normalizeUrl(urlDraft);
    if (!url) { setLinkErr("That doesn't look like a link (e.g. khanacademy.org/...)."); return; }
    if (links.length >= MAX_LINKS) { setLinkErr("Max 3 links — remove one to add another."); return; }
    setLinkErr(null);
    setSavingLink(true);
    const err = await onSetLinks([...links, { url, label: labelDraft.trim() || null }]);
    setSavingLink(false);
    if (err) { setLinkErr(err); return; }
    setUrlDraft(""); setLabelDraft(""); setAdding(false);
  };

  const removeLink = async (idx: number) => {
    const err = await onSetLinks(links.filter((_, i) => i !== idx));
    if (err) toast.error("Couldn't remove the link", { description: err });
  };

  return (
    <div className="sr-pin">
      {/* Goal line */}
      <div className="sr-pin-goal">
        <Target size={14} className="sr-pin-goalico" />
        {editingGoal ? (
          <input
            ref={goalInputRef}
            className="sr-pin-goalinput"
            value={goalDraft}
            maxLength={200}
            placeholder="What are we working on right now?"
            onChange={(e) => setGoalDraft(e.target.value)}
            onBlur={commitGoal}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void commitGoal(); }
              if (e.key === "Escape") { setGoalDraft(room.goal_text ?? ""); setEditingGoal(false); }
            }}
          />
        ) : room.goal_text ? (
          <button className="sr-pin-goaltext" onClick={() => setEditingGoal(true)} title="Click to edit the goal">
            {savingGoal && <Loader2 size={11} className="animate-spin" style={{ marginRight: 4 }} />}
            {room.goal_text}
          </button>
        ) : (
          <button className="sr-pin-goalempty" onClick={() => setEditingGoal(true)}>
            Set a goal for this session
          </button>
        )}
      </div>

      {/* Resource links — exactly MAX_LINKS slots so the cap is visible */}
      <div className="sr-pin-links">
        {links.map((l, i) => (
          <span className="sr-pin-chip" key={`${l.url}-${i}`}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="sr-pin-chip-link" title={l.url}>
              <ExternalLink size={11} />
              <span className="sr-pin-chip-lbl">{l.label || hostOf(l.url)}</span>
            </a>
            <button className="sr-pin-chip-x" onClick={() => removeLink(i)} aria-label="Remove link"><X size={11} /></button>
          </span>
        ))}

        {/* Add affordance for each remaining empty slot (collapses to one input) */}
        {links.length < MAX_LINKS && (
          adding ? (
            <span className="sr-pin-add">
              <input
                className="sr-pin-addurl"
                value={urlDraft}
                placeholder="Paste a link…"
                autoFocus
                onChange={(e) => { setUrlDraft(e.target.value); setLinkErr(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addLink(); } if (e.key === "Escape") { setAdding(false); setLinkErr(null); } }}
              />
              <input
                className="sr-pin-addlbl"
                value={labelDraft}
                placeholder="Label (optional)"
                maxLength={60}
                onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addLink(); } }}
              />
              <button className="sr-pin-addok" onClick={addLink} disabled={savingLink} aria-label="Add link">
                {savingLink ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              </button>
              <button className="sr-pin-addcancel" onClick={() => { setAdding(false); setLinkErr(null); setUrlDraft(""); setLabelDraft(""); }} aria-label="Cancel"><X size={12} /></button>
            </span>
          ) : (
            <button className="sr-pin-slot" onClick={() => setAdding(true)}>
              <Plus size={12} /> Add a link
              <span className="sr-pin-slot-count">{links.length}/{MAX_LINKS}</span>
            </button>
          )
        )}

        {links.length >= MAX_LINKS && !adding && (
          <span className="sr-pin-full">3/3 · remove one to add another</span>
        )}
      </div>

      {linkErr && <div className="sr-pin-err">{linkErr}</div>}
    </div>
  );
}
