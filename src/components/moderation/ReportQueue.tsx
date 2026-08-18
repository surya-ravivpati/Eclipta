/**
 * The moderator-facing queue over `public.reports`.
 *
 * Reports from study rooms, usernames and the forum have all landed in that
 * table since June, and nothing displayed them: the admin page reads the older
 * `forum_reports`, which no longer receives anything. So a reader was told
 * "this has been sent for review" and no human ever saw it.
 *
 * Grouped per target, because five people reporting one message is one
 * decision. Resolving closes every open report on that target at once.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  getReportQueue,
  resolveReport,
  setChatMessageStatus,
  type ReportOutcome,
  type ReportQueueFilter,
  type ReportQueueItem,
} from "@/repositories/moderation";
import { setModerationStatus } from "@/lib/moderation";
import { timeAgo } from "@/lib/time";

const FILTERS: { id: ReportQueueFilter; label: string }[] = [
  { id: "pending", label: "OPEN" },
  { id: "escalated", label: "ESCALATED" },
  { id: "action_taken", label: "ACTIONED" },
  { id: "no_violation", label: "CLEARED" },
  { id: "all", label: "ALL" },
];

const FORUM_TARGETS = ["thread", "answer", "comment"] as const;

/** Where a moderator can go to see the reported thing in context. */
function targetHref(item: ReportQueueItem): string | null {
  if (item.targetType === "username" && item.authorName) return `/u/${item.authorName}`;
  if (item.targetType === "thread" && item.targetId) return `/forum/${item.targetId}`;
  return null;
}

function describeTarget(item: ReportQueueItem): string {
  if (item.targetType === "chat_message") return "STUDY ROOM MESSAGE";
  return item.targetType.toUpperCase();
}

export function ReportQueue() {
  const [filter, setFilter] = useState<ReportQueueFilter>("pending");
  const [items, setItems] = useState<ReportQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getReportQueue(filter));
    } catch (error) {
      console.error("getReportQueue", error);
      toast.error("Couldn't load the report queue.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const keyOf = (item: ReportQueueItem) => `${item.targetType}:${item.targetId ?? "none"}`;

  const resolve = async (item: ReportQueueItem, outcome: ReportOutcome, hide: boolean) => {
    const key = keyOf(item);
    setBusyKey(key);
    try {
      // Act on the content first. Closing the report and then failing to hide
      // anything would leave the queue clean and the content up.
      if (hide && item.targetId) {
        if (item.targetType === "chat_message") {
          await setChatMessageStatus(item.targetId, "hidden", "Moderator action from report queue");
        } else if (FORUM_TARGETS.some((t) => t === item.targetType)) {
          const result = await setModerationStatus(
            item.targetType as (typeof FORUM_TARGETS)[number],
            item.targetId,
            "hidden",
            "Moderator action from report queue",
          );
          if (!result.ok) throw new Error(result.error);
        }
      }

      const closed = await resolveReport(item.targetType, item.targetId, outcome);
      toast.success(
        closed > 0
          ? `${closed} report${closed === 1 ? "" : "s"} closed.`
          : "Already handled by someone else.",
      );
      await load();
    } catch (error) {
      console.error("resolveReport", error);
      toast.error(error instanceof Error ? error.message : "Couldn't record that decision.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1 text-[10px] font-bold tracking-widest border transition-colors ${
              filter === f.id
                ? "border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan"
                : "border-border text-muted-foreground hover:border-neon-cyan/40"
            } active:scale-[0.97] hover:opacity-90`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 mx-auto animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nothing here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const key = keyOf(item);
            const busy = busyKey === key;
            const open = ["pending", "scanning", "escalated"].includes(item.status);
            const href = targetHref(item);
            return (
              <div key={key} className="glass-panel p-5">
                <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold tracking-widest text-muted-foreground bg-secondary/50 px-2 py-0.5 border border-border">
                      {describeTarget(item)}
                    </span>
                    {item.reportCount > 1 && (
                      <span className="text-[10px] font-bold tracking-widest text-neon-pink bg-neon-pink/10 px-2 py-0.5 border border-neon-pink/30">
                        {item.reportCount} REPORTS
                      </span>
                    )}
                    {!open && (
                      <span className="text-[10px] font-bold tracking-widest text-muted-foreground px-2 py-0.5 border border-border">
                        {item.status.replace(/_/g, " ").toUpperCase()}
                      </span>
                    )}
                    {item.targetId === null && (
                      <span
                        className="text-[10px] font-bold tracking-widest text-neon-cyan bg-neon-cyan/10 px-2 py-0.5 border border-neon-cyan/30"
                        title="Content with no row of its own, such as a Luna reply. There is nothing to hide; judge the report itself."
                      >
                        AI CONTENT
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {timeAgo(item.lastReportedAt)}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground mb-3 space-y-1">
                  <p>
                    Author:{" "}
                    <span className="text-foreground">
                      {item.authorName ?? (item.targetAuthor ? "unnamed account" : "unknown")}
                    </span>
                    {item.reporterResolved > 0 && (
                      <span>
                        {" - reporter has been right "}
                        {item.reporterConfirmed} of {item.reporterResolved} times
                      </span>
                    )}
                  </p>
                  {item.scannerDecision && (
                    <p>
                      Automated pass:{" "}
                      <span className="text-foreground">{item.scannerDecision}</span>
                      {item.scannerCategory && ` (${item.scannerCategory})`}
                    </p>
                  )}
                  {item.categories.length > 0 && <p>Reported as: {item.categories.join(", ")}</p>}
                </div>

                {item.notes.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {item.notes.slice(0, 3).map((note, i) => (
                      <p
                        key={i}
                        className="text-xs text-foreground/80 border-l-2 border-border pl-3 py-0.5"
                      >
                        {note}
                      </p>
                    ))}
                  </div>
                )}

                {open && (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      disabled={busy}
                      onClick={() => void resolve(item, "action_taken", true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-widest border border-neon-pink/40 text-neon-pink hover:bg-neon-pink/10 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {busy ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <EyeOff className="w-3 h-3" />
                      )}
                      HIDE AND CLOSE
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void resolve(item, "no_violation", false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-widest border border-border text-muted-foreground hover:border-neon-cyan/40 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check className="w-3 h-3" />
                      NO VIOLATION
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void resolve(item, "escalated", false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-widest border border-border text-muted-foreground hover:border-neon-purple/40 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      ESCALATE
                    </button>
                    {href && (
                      <a
                        href={href}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-widest border border-border text-muted-foreground hover:border-neon-purple/40 active:scale-[0.97]"
                      >
                        <ArrowUpRight className="w-3 h-3" />
                        VIEW
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
