/**
 * The moderation domain's door into the database.
 *
 * `public.reports` has collected forum, username and study-room reports since
 * June and nothing read it: `/admin/forum` queries the older `forum_reports`
 * table, so a study-room report reached the database and stopped. Everything
 * here exists to put a person at the end of that pipeline.
 */
import { supabase } from "@/integrations/supabase/client";

/** What a report can be filed against. */
export type ReportTarget = "thread" | "answer" | "comment" | "username" | "chat_message";

/** Where a report has got to. `all` is a filter, never a stored value. */
export type ReportStatus =
  "pending" | "scanning" | "escalated" | "action_taken" | "no_violation" | "target_gone" | "closed";

/**
 * What the queue can be asked for. Narrower than `ReportStatus` on purpose:
 * `target_gone` and `closed` are stored values the routine refuses as filters,
 * and a type that allowed them would only turn a typo into a runtime error.
 */
export type ReportQueueFilter =
  "pending" | "scanning" | "escalated" | "action_taken" | "no_violation" | "all";

/** A moderator's verdict. Escalating hands over rather than deciding. */
export type ReportOutcome = "action_taken" | "no_violation" | "escalated";

/**
 * One target, with every report filed against it folded together.
 *
 * Grouped rather than listed: five people reporting one message is one
 * decision, and a queue that shows it five times invites five actions.
 */
export interface ReportQueueItem {
  targetType: ReportTarget;
  /** Null for content that never had a row of its own, such as a Luna reply. */
  targetId: string | null;
  targetAuthor: string | null;
  authorName: string | null;
  reportCount: number;
  firstReportedAt: string;
  lastReportedAt: string;
  categories: string[];
  notes: string[];
  status: ReportStatus;
  /** How the most recent reporter's past reports resolved. Context, not a verdict. */
  reporterConfirmed: number;
  reporterResolved: number;
  /** What the automated pass concluded, when it reached one. */
  scannerDecision: string | null;
  scannerCategory: string | null;
  /** 0-100, as `moderation_decisions.confidence` stores it. */
  scannerConfidence: number | null;
}

interface QueueRow {
  target_type: string;
  target_id: string | null;
  target_author: string | null;
  author_name: string | null;
  report_count: number;
  first_reported_at: string;
  last_reported_at: string;
  categories: string[] | null;
  notes: string[] | null;
  status: string;
  reporter_confirmed: number;
  reporter_resolved: number;
  scanner_decision: string | null;
  scanner_category: string | null;
  scanner_confidence: number | null;
}

function toQueueItem(row: QueueRow): ReportQueueItem {
  return {
    targetType: row.target_type as ReportTarget,
    targetId: row.target_id,
    targetAuthor: row.target_author,
    authorName: row.author_name,
    reportCount: row.report_count,
    firstReportedAt: row.first_reported_at,
    lastReportedAt: row.last_reported_at,
    categories: row.categories ?? [],
    notes: row.notes ?? [],
    status: row.status as ReportStatus,
    reporterConfirmed: row.reporter_confirmed,
    reporterResolved: row.reporter_resolved,
    scannerDecision: row.scanner_decision,
    scannerCategory: row.scanner_category,
    scannerConfidence: row.scanner_confidence,
  };
}

/** Reports awaiting a decision. Moderator-only, enforced in the routine. */
export async function getReportQueue(
  status: ReportQueueFilter = "pending",
  limit = 100,
): Promise<ReportQueueItem[]> {
  const { data, error } = await supabase.rpc(
    "get_report_queue" as never,
    {
      p_status: status,
      p_limit: limit,
    } as never,
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as QueueRow[]).map(toQueueItem);
}

/**
 * Record a moderator's decision against every open report on one target.
 *
 * Returns how many were closed, which is how the caller can tell a real
 * resolution from a second click on a target somebody else just handled.
 */
export async function resolveReport(
  targetType: ReportTarget,
  targetId: string | null,
  outcome: ReportOutcome,
  reason?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "resolve_report" as never,
    {
      p_target_type: targetType,
      p_target_id: targetId,
      p_outcome: outcome,
      p_reason: reason ?? null,
    } as never,
  );
  if (error) throw new Error(error.message);

  const result = data as { resolved?: number } | null;
  return typeof result?.resolved === "number" ? result.resolved : 0;
}

/**
 * Hide or restore a study-room message.
 *
 * Separate from `setModerationStatus` because that routine only understands
 * forum types and rejects everything else, which left reported chat visible no
 * matter what a moderator decided.
 */
export async function setChatMessageStatus(
  messageId: string,
  status: "visible" | "hidden" | "removed",
  reason?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "set_chat_message_status" as never,
    {
      p_message_id: messageId,
      p_status: status,
      p_reason: reason ?? null,
    } as never,
  );
  if (error) throw new Error(error.message);
  return (data as { ok?: boolean } | null)?.ok === true;
}
