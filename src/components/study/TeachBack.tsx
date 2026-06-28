import { useState } from "react";
import { GraduationCap, SkipForward, Loader2, Sparkles, ThumbsUp, Meh, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { getEcliptarBySlug } from "@/lib/ecliptars";
import type { RoomMember, StudyRoom } from "@/lib/study-rooms";
import {
  setTeachBack, reactTeachBack, skipTeachBack,
  nextUpId, type TeachBackRound, type TbReaction,
} from "@/lib/study-teachback";

function Ava({ slug, on }: { slug: string | null; on: boolean }) {
  const ec = slug ? getEcliptarBySlug(slug) : undefined;
  const Icon = ec?.icon ?? Sparkles;
  return <span className={`sr-tb-ava ${on ? "is-next" : ""}`}><Icon size={13} /></span>;
}

/**
 * Teach-Back control strip — the opt-in toggle plus the visible rotation queue.
 * Lives directly under the clock; no menu to dig into. Handles the 1-person
 * (auto-disabled, reason shown) and 2-person ("just the two of you") framings.
 */
export function TeachBackBar({ room, members }: {
  room: StudyRoom; members: RoomMember[];
}) {
  const [busy, setBusy] = useState(false);
  const count = members.length;
  const enabled = room.teach_back_enabled;
  const tooFew = count < 2;                       // 1-person → can't run

  const toggle = async (on: boolean) => {
    setBusy(true);
    const err = await setTeachBack(room.id, on);
    setBusy(false);
    if (err) toast.error("Couldn't change teach-back", { description: err });
  };

  // Queue order = tb_queue filtered to current members (joiners already at back);
  // before the first toggle-on the queue is empty, so preview join order.
  const memberById = new Map(members.map((m) => [m.user_id, m]));
  const ordered: RoomMember[] = (room.tb_queue?.length ? room.tb_queue : members.map((m) => m.user_id))
    .map((id) => memberById.get(id))
    .filter((m): m is RoomMember => !!m);
  const nextId = nextUpId(
    room.tb_queue?.length ? room.tb_queue : members.map((m) => m.user_id),
    room.tb_position ?? 0,
    new Set(members.map((m) => m.user_id)),
  );

  return (
    <div className="sr-tb-bar">
      <div className="sr-tb-bar-row">
        <span className="sr-tb-label"><GraduationCap size={13} /> Teach-back</span>

        {tooFew ? (
          <span className="sr-tb-off-note">Needs 2+ people in the room to run</span>
        ) : (
          <button
            className={`sr-tb-toggle ${enabled ? "is-on" : ""}`}
            onClick={() => toggle(!enabled)}
            disabled={busy}
            role="switch"
            aria-checked={enabled}
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <span className="sr-tb-dot" />}
            {enabled ? "On" : "Off"}
          </button>
        )}
      </div>

      {enabled && !tooFew && (
        <div className="sr-tb-queue" aria-label="Rotation order">
          {ordered.map((m) => (
            <span key={m.user_id} className="sr-tb-qslot" title={m.display_name || "Learner"}>
              <Ava slug={m.ecliptar_slug} on={m.user_id === nextId} />
            </span>
          ))}
          <span className="sr-tb-queue-note">
            {count === 2
              ? "just the two of you taking turns"
              : nextId
                ? `${memberById.get(nextId)?.display_name || "someone"} is up next`
                : "rotating each break"}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The round card — a system-card sibling of the Stuck card, but clearly a
 * different prompt (graduation cap, "TEACH-BACK" label, blue accent). No
 * countdown, no AI fallback. The explainer answers in chat; everyone else taps
 * one of three lightweight reactions once the answer lands.
 */
export function TeachBackCard({ round, meId, mySkipUsed }: {
  round: TeachBackRound; meId: string | null; mySkipUsed: boolean;
}) {
  const [mine, setMine] = useState<TbReaction | null>(null);
  const [skipping, setSkipping] = useState(false);
  const isExplainer = round.explainer_id === meId;
  const who = round.explainer_name || "A member";
  const concept = round.concept_text || "the last thing you worked on";
  const closed = round.status === "skipped" || round.status === "expired";

  const react = (r: TbReaction) => {
    setMine(r);                                   // optimistic highlight
    void reactTeachBack(round.id, r);
  };

  const skip = async () => {
    setSkipping(true);
    const err = await skipTeachBack(round.id);
    setSkipping(false);
    if (err) toast(err);
  };

  const REACTIONS: ReadonlyArray<{ key: TbReaction; Icon: typeof ThumbsUp; label: string; count: number }> = [
    { key: "up",    Icon: ThumbsUp,   label: "got it",  count: round.up_count },
    { key: "kinda", Icon: Meh,        label: "kinda",   count: round.kinda_count },
    { key: "lost",  Icon: HelpCircle, label: "lost me", count: round.lost_count },
  ];

  return (
    <div className={`sr-tb-card ${closed ? "sr-tb-card--closed" : ""}`} role="group"
      aria-label={`Teach-back prompt for ${who}: explain ${concept}`}>
      <div className="sr-tb-card-head">
        <GraduationCap size={14} className="sr-tb-card-ico" aria-hidden="true" />
        <span className="sr-tb-card-tag">Teach-back</span>
        {round.status === "skipped" && <span className="sr-tb-card-state">passed</span>}
        {round.status === "expired" && <span className="sr-tb-card-state">no answer</span>}
      </div>

      <div className="sr-tb-card-prompt">
        {isExplainer && !closed
          ? <>Your turn — explain <b>{concept}</b> in your own words.</>
          : <><b>{who}</b>, can you explain <b>{concept}</b> in your own words?</>}
      </div>

      {!closed && (
        <div className="sr-tb-card-foot">
          {/* Anyone who isn't the explainer can validate the answer. */}
          {!isExplainer && (
            <div className="sr-tb-reacts" role="group" aria-label="React to the explanation">
              {REACTIONS.map((r) => (
                <button
                  key={r.key}
                  className={`sr-tb-react ${mine === r.key ? "is-mine" : ""}`}
                  onClick={() => react(r.key)}
                  title={r.label}
                  aria-label={`${r.label}${r.count > 0 ? ` (${r.count})` : ""}`}
                  aria-pressed={mine === r.key}
                >
                  <r.Icon className="sr-tb-react-ico" size={14} aria-hidden="true" />
                  {r.count > 0 && <span className="sr-tb-react-n">{r.count}</span>}
                </button>
              ))}
            </div>
          )}

          {/* The explainer gets exactly one skip per session. */}
          {isExplainer && (
            mySkipUsed ? (
              <span className="sr-tb-skip-spent">skip used</span>
            ) : (
              <button className="sr-tb-skip" onClick={skip} disabled={skipping}>
                {skipping ? <Loader2 size={11} className="animate-spin" /> : <SkipForward size={11} />} Skip my turn
              </button>
            )
          )}
        </div>
      )}

      {round.status === "answered" && (isExplainer || REACTIONS.some((r) => r.count > 0)) && (
        <div className="sr-tb-tally">
          {REACTIONS.map((r) => (
            <span key={r.key} className="sr-tb-tally-item"><r.Icon size={12} aria-hidden="true" /> {r.count}</span>
          ))}
        </div>
      )}
    </div>
  );
}
