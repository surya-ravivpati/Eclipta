import { useState } from "react";
import { X, Flag, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { submitReport } from "@/lib/reporting";

const REASONS = [
  "Spam",
  "Harassment",
  "Hate speech",
  "Sexual content",
  "Self-harm",
  "Off-topic",
  "Misinformation",
  "Other",
];

export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetType: "thread" | "answer" | "comment";
  targetId: string;
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Sign in to report");
    setSubmitting(true);
    // Unified backend: persists + triggers a moderation re-scan. The pipeline's
    // own verdict - not the report count - decides any action.
    const err = await submitReport({
      targetType,
      targetId,
      category: reason,
      note: details.trim().slice(0, 500) || null,
    });
    setSubmitting(false);
    if (err) return toast.error("Couldn't submit report", { description: err });
    // Calm, generic acknowledgement - no case-status tracker, no specifics.
    toast.success("Thanks - this has been sent for review.");
    setDetails("");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="glass-panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-lg tracking-tight inline-flex items-center gap-2">
            <Flag className="w-4 h-4 text-neon-pink" />
            Report {targetType}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full mt-1 bg-secondary/30 border border-input px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-neon-purple"
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              Details (optional)
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Add any context that helps moderators."
              className="w-full mt-1 bg-secondary/30 border border-input px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-neon-purple resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{details.length}/500</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold tracking-widest border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold tracking-widest bg-neon-pink text-foreground hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-3 h-3 animate-spin" />}SUBMIT REPORT
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
