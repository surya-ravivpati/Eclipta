/**
 * Course progress write path — upserts into the course_progress table the hub's
 * "Continue Learning" reads from (docs/courses-redesign.md, Phase 0/1).
 *
 * Best-effort by design: if the migration hasn't been applied yet the table is
 * absent, so a failure here must never break the lesson player. Callers fire and
 * forget.
 */

import { supabase } from "@/integrations/supabase/client";
import type { CourseSource } from "./courses";

export interface ProgressSync {
  userId: string;
  courseSlug: string;
  courseTitle: string;
  source: CourseSource;
  lessonsDone: number;
  lessonsTotal: number;
  /** opaque resume token — "moduleIdx:lessonIdx" for official, block id for community */
  currentBlockId?: string;
}

export async function syncCourseProgress(p: ProgressSync): Promise<void> {
  const status =
    p.lessonsTotal > 0 && p.lessonsDone >= p.lessonsTotal
      ? "completed"
      : p.lessonsDone > 0
        ? "in_progress"
        : "enrolled";
  const now = new Date().toISOString();
  try {
    await supabase.from("course_progress").upsert(
      {
        user_id: p.userId,
        course_slug: p.courseSlug,
        course_title: p.courseTitle,
        source: p.source,
        status,
        lessons_done: p.lessonsDone,
        lessons_total: p.lessonsTotal,
        current_block_id: p.currentBlockId ?? null,
        last_opened_at: now,
        completed_at: status === "completed" ? now : null,
      },
      { onConflict: "user_id,course_slug" },
    );
  } catch (e) {
    // Table not migrated yet, or transient failure — never block the player.
    console.warn("course_progress sync skipped:", e);
  }
}
