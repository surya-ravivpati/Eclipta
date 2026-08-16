/**
 * Unified reporting client - ONE backend for every surface (forum posts,
 * usernames, study-room chat messages). A report is a trigger for the
 * moderation pipeline to re-scan the target; it never removes content by count.
 * The reporter only ever gets a generic acknowledgement.
 */
import { invokeEdgeFunction } from "./edge-function";

export type ReportTargetType = "thread" | "answer" | "comment" | "username" | "chat_message";

export async function submitReport(args: {
  targetType: ReportTargetType;
  targetId: string | null;
  category?: string | null;
  note?: string | null;
}): Promise<string | null> {
  const { error } = await invokeEdgeFunction("report", {
    target_type: args.targetType,
    target_id: args.targetId ?? null,
    category: args.category ?? null,
    note: args.note ?? null,
  });
  return error;
}

/** Generic, calm outcome label for a reporter's own report - never specifics
 *  about what happened to the other party. */
export function reportStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "action_taken":
      return "Reviewed - action taken";
    case "escalated":
      return "Reviewed - sent for a closer look";
    case "no_violation":
      return "Reviewed - no violation found";
    case "target_gone":
      return "Reviewed - content no longer available";
    case "scanning":
    case "pending":
      return "Received - under review";
    default:
      return "Received";
  }
}
