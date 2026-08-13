import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Flag, Ban, RefreshCw, UserX, Loader2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { regenerateRoomCode, removeRoomMember, type ReportAuthorKind } from "@/lib/study-safety";
import { submitReport } from "@/lib/reporting";

/* -- Host: regenerate the join code (private rooms). Host-only - rendered only
   for the host, never shown-disabled to others. -- */
export function RegenerateCodeButton({ roomId }: { roomId: string }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const { code, error } = await regenerateRoomCode(roomId);
    setBusy(false);
    if (error) {
      toast.error("Couldn't regenerate", { description: error });
      return;
    }
    toast.success("New code generated", {
      description: `Old code no longer works for new joins. New code: ${code}`,
    });
  };
  return (
    <button
      className="sr-btn"
      style={{ marginTop: 8, fontSize: 11, padding: "6px 12px" }}
      onClick={run}
      disabled={busy}
      aria-label="Regenerate the room's join code"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} New code
    </button>
  );
}

/* -- Host: remove a member (two-tap confirm to avoid accidents). -- */
export function RemoveMemberButton({
  roomId,
  userId,
  name,
}: {
  roomId: string;
  userId: string;
  name: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const err = await removeRoomMember(roomId, userId);
    setBusy(false);
    setConfirming(false);
    if (err) toast.error("Couldn't remove", { description: err });
    else toast(`${name} was removed from the room`);
  };
  if (!confirming) {
    return (
      <button
        className="sr-host-remove"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${name} from the room`}
        title="Remove from room"
      >
        <UserX size={13} />
      </button>
    );
  }
  return (
    <span className="sr-host-confirm">
      <button
        className="sr-host-confirm-yes"
        onClick={run}
        disabled={busy}
        aria-label={`Confirm removing ${name}`}
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Remove
      </button>
      <button
        className="sr-host-confirm-no"
        onClick={() => setConfirming(false)}
        aria-label="Cancel removal"
      >
        <X size={11} />
      </button>
    </span>
  );
}

/* -- Per-message overflow menu: quiet Report + Block. Low-friction by design -
   it lives behind a small ⋯, not a prominent button. -- */
export function MessageMenu({
  roomId,
  targetId = null,
  authorKind,
  reportedUserId,
  authorName,
  snapshot,
  canBlock,
  onBlock,
}: {
  roomId: string;
  /** The study_room_messages row id, so the pipeline can re-scan it. Null for
   *  AI/system content with no message row (report is logged, not re-scanned). */
  targetId?: string | null;
  authorKind: ReportAuthorKind;
  reportedUserId: string | null;
  authorName: string;
  snapshot: string;
  canBlock: boolean;
  onBlock: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="sr-msgmenu" ref={ref}>
      <button
        className="sr-msgmenu-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Message options"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="sr-msgmenu-pop" role="menu">
          <button
            className="sr-msgmenu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setReporting(true);
            }}
          >
            <Flag size={12} /> Report message
          </button>
          {canBlock && (
            <button
              className="sr-msgmenu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onBlock();
              }}
            >
              <Ban size={12} /> Block {authorName}
            </button>
          )}
        </div>
      )}
      {reporting && (
        <ReportDialog
          targetId={targetId}
          authorKind={authorKind}
          snapshot={snapshot}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}

/* -- Report dialog: optional reason, silent submit through the unified backend.
   The report triggers a moderation re-scan; the pipeline's verdict acts. -- */
function ReportDialog({
  targetId,
  authorKind,
  snapshot,
  onClose,
}: {
  targetId: string | null;
  authorKind: ReportAuthorKind;
  snapshot: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const err = await submitReport({
      targetType: "chat_message",
      targetId,
      category: authorKind,
      note: reason.trim() || null,
    });
    setBusy(false);
    if (err) {
      toast.error("Couldn't submit report", { description: err });
      return;
    }
    // Silent by design - confirm only to the reporter, never the reported user.
    toast.success("Thanks - this has been sent for review.");
    onClose();
  };

  return (
    <div className="sr-modal-bg" onClick={onClose}>
      <div
        className="sr-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Report message"
      >
        <button className="sr-back" onClick={onClose} style={{ float: "right" }} aria-label="Close">
          <X size={16} />
        </button>
        <h3>Report this message</h3>
        <p className="sr-modal-sub">
          This goes privately to the team for review. The other person isn't notified.
        </p>
        <div className="sr-report-snap">{snapshot.slice(0, 240) || "(no text)"}</div>
        <label className="sr-report-lbl" htmlFor="sr-report-reason">
          Reason (optional)
        </label>
        <textarea
          id="sr-report-reason"
          className="sr-input"
          rows={3}
          maxLength={500}
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What's wrong with this message?"
          style={{ resize: "none" }}
        />
        <div className="sr-modal-actions">
          <button className="sr-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="sr-btn sr-btn--solid" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Flag size={13} />} Submit
            report
          </button>
        </div>
      </div>
    </div>
  );
}
