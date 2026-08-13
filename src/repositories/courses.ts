/**
 * The courses domain's one door into the database - community courses and
 * their content, enrollment, progress tracking, and per-concept mastery. See
 * AGENTS.md's "Database" section: nothing outside this file calls
 * `supabase.from()`/`.rpc()` for these tables. `battle_question_records` is
 * modelled in, and written through, the battles repository instead - it's a
 * battles-domain table even though courses' concept-mastery pipeline reads
 * the aggregate courses builds from it.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/database";
import type { CourseBlockData, CourseBlockRow, CourseBlockType } from "@/lib/course-blocks";
import { getUsername } from "@/repositories/profile";

// -- Course content reads (courses.$slug.tsx) --------------------------------

export interface CourseSummary {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  summary: string | null;
  level: string;
  structure: string;
  depth: string;
  status: string;
}

/** No row means no course has that slug - not an error. */
export async function getCourseBySlug(slug: string): Promise<CourseSummary | null> {
  const { data, error } = await supabase
    .from("user_courses")
    .select("id,user_id,slug,title,summary,level,structure,depth,status")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export interface CourseModuleRow {
  id: string;
  title: string;
  position: number;
}

export async function getCourseModules(courseId: string): Promise<CourseModuleRow[]> {
  const { data, error } = await supabase
    .from("course_modules")
    .select("id,title,position")
    .eq("course_id", courseId)
    .order("position");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCourseBlocksForModules(moduleIds: string[]): Promise<CourseBlockRow[]> {
  const { data, error } = await supabase
    .from("course_blocks")
    .select("id,module_id,type,data,position")
    .in("module_id", moduleIds)
    .order("position");

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Username lookup for a course's creator. Delegates to the profile
 * repository's `getUsername` rather than querying `public_profiles`
 * directly - that view was found to be RLS-restricted to the caller's own
 * row (its `security_invoker` history meant it inherited `user_profiles`'
 * own-row-only SELECT policy, defeating the view's own purpose), returning
 * null for every course the caller didn't author. `getUsername` goes
 * through a security-definer RPC instead, which doesn't have this problem.
 */
export async function getCourseCreatorUsername(userId: string): Promise<string | null> {
  return getUsername(userId);
}

// -- Course proposals (src/components/CourseBuilder.tsx) ---------------------

export interface CourseProposalInsert {
  user_id: string;
  topic: string;
  description: string | null;
  level: string;
  structure: string;
  depth: string;
  weekly_hours: number;
  prerequisites: string | null;
  creator_reasoning: string;
  status: string;
}

/** Returns the new proposal's id, which the caller hands to the `review-course-proposal` edge function. */
export async function insertCourseProposal(payload: CourseProposalInsert): Promise<string> {
  const { data, error } = await supabase
    .from("course_proposals")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

export interface PublishedCourseRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  level: string;
  depth: string;
  enrolled_count: number;
  cover_image_url: string | null;
}

/** Published courses shown in the library, most-enrolled first. */
export async function getPublishedCommunityCourses(limit: number): Promise<PublishedCourseRow[]> {
  const { data, error } = await supabase
    .from("user_courses")
    .select("id,slug,title,summary,level,depth,enrolled_count,cover_image_url")
    .eq("status", "published")
    .order("enrolled_count", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

// -- Enrollment ---------------------------------------------------------------

export async function isEnrolled(userId: string, courseSlug: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("course_slug", courseSlug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data != null;
}

export interface EnrollmentSlugAndDate {
  course_slug: string;
  enrolled_at: string;
}

export async function getEnrollmentSlugsWithDates(
  userId: string,
): Promise<EnrollmentSlugAndDate[]> {
  const { data, error } = await supabase
    .from("enrollments")
    .select("course_slug,enrolled_at")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getEnrolledCourseSlugs(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("enrollments")
    .select("course_slug")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.course_slug);
}

export interface EnrollmentRow {
  course_slug: string;
  course_title: string;
}

export interface EnrollmentsWithCount {
  rows: EnrollmentRow[];
  count: number;
}

/** `count` reflects the total matching rows even if a caller later paginates `rows`. */
export async function getEnrollmentsWithCount(userId: string): Promise<EnrollmentsWithCount> {
  const { data, count, error } = await supabase
    .from("enrollments")
    .select("course_slug,course_title", { count: "exact" })
    .eq("user_id", userId)
    .order("enrolled_at", { ascending: false });

  if (error) throw new Error(error.message);
  return { rows: data ?? [], count: count ?? 0 };
}

export interface EnrollmentPayload {
  user_id: string;
  course_slug: string;
  course_title: string;
}

/** Throws on a duplicate enrollment (the unique constraint) same as any other database error - callers already surface `error.message` to the user. */
export async function enrollInCourse(payload: EnrollmentPayload): Promise<void> {
  const { error } = await supabase.from("enrollments").insert(payload);
  if (error) throw new Error(error.message);
}

// -- Progress tracking (src/lib/course-progress.ts) --------------------------

export interface CourseProgressUpsert {
  user_id: string;
  course_slug: string;
  course_title: string;
  source: string;
  status: string;
  lessons_done: number;
  lessons_total: number;
  current_block_id: string | null;
  last_opened_at: string;
  completed_at: string | null;
}

export interface CourseProgressSummaryRow {
  course_slug: string;
  percent: number;
  status: string;
  last_opened_at: string;
}

export async function getCourseProgressForUser(
  userId: string,
): Promise<CourseProgressSummaryRow[]> {
  const { data, error } = await supabase
    .from("course_progress")
    .select("course_slug,percent,status,last_opened_at")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertCourseProgress(payload: CourseProgressUpsert): Promise<void> {
  const { error } = await supabase
    .from("course_progress")
    .upsert(payload, { onConflict: "user_id,course_slug" });

  if (error) throw new Error(error.message);
}

// -- Concept mastery (src/lib/concept-mastery.ts) ----------------------------

export interface ConceptMasteryEvidenceRow {
  concept: string;
  evidence_count: number;
  correct_count: number;
}

export async function getConceptMasteryEvidence(
  userId: string,
  concepts: string[],
): Promise<ConceptMasteryEvidenceRow[]> {
  const { data, error } = await supabase
    .from("concept_mastery")
    .select("concept,evidence_count,correct_count")
    .eq("user_id", userId)
    .in("concept", concepts);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface ConceptMasteryUpsertRow {
  user_id: string;
  concept: string;
  subject: string;
  evidence_count: number;
  correct_count: number;
  confidence: number;
  state: string;
  last_seen: string;
  next_review: string;
}

export async function upsertConceptMastery(rows: ConceptMasteryUpsertRow[]): Promise<void> {
  const { error } = await supabase
    .from("concept_mastery")
    .upsert(rows, { onConflict: "user_id,concept" });
  if (error) throw new Error(error.message);
}

export interface WeakConceptRow {
  concept: string;
  subject: string;
  state: string;
  confidence: number;
  evidence_count: number;
}

export async function getWeakConceptRows(userId: string, limit: number): Promise<WeakConceptRow[]> {
  const { data, error } = await supabase
    .from("concept_mastery")
    .select("concept,subject,state,confidence,evidence_count")
    .eq("user_id", userId)
    .in("state", ["struggling", "developing"])
    .order("confidence", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

// -- Daily challenge (src/components/KnowledgeBattles.tsx) ------------------

export interface DailyChallengeProgressRow {
  wins: number;
  bonus_claimed: boolean;
}

/** No row means the player hasn't won a battle yet today - not an error. */
export async function getDailyChallengeProgress(
  userId: string,
  challengeDate: string,
): Promise<DailyChallengeProgressRow | null> {
  const { data, error } = await supabase
    .from("daily_challenge_progress")
    .select("wins, bonus_claimed")
    .eq("user_id", userId)
    .eq("challenge_date", challengeDate)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

// -- Course editor (_authenticated.courses.$courseId.edit.tsx) --------------

export interface CourseEditRow {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  summary: string | null;
  level: string;
  status: string;
  cover_image_url: string | null;
}

export async function getCourseForEdit(courseId: string): Promise<CourseEditRow | null> {
  const { data, error } = await supabase
    .from("user_courses")
    .select("id,user_id,slug,title,summary,level,status,cover_image_url")
    .eq("id", courseId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export interface CourseFieldPatch {
  title?: string;
  summary?: string;
  status?: string;
}

export async function updateCourseFields(courseId: string, patch: CourseFieldPatch): Promise<void> {
  const { error } = await supabase.from("user_courses").update(patch).eq("id", courseId);
  if (error) throw new Error(error.message);
}

export interface CourseModuleEditRow {
  id: string;
  course_id: string;
  title: string;
  position: number;
}

export async function insertCourseModule(
  courseId: string,
  title: string,
  position: number,
): Promise<CourseModuleEditRow> {
  const { data, error } = await supabase
    .from("course_modules")
    .insert({ course_id: courseId, title, position })
    .select("id,course_id,title,position")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function renameCourseModule(moduleId: string, title: string): Promise<void> {
  const { error } = await supabase.from("course_modules").update({ title }).eq("id", moduleId);
  if (error) throw new Error(error.message);
}

export async function deleteCourseModule(moduleId: string): Promise<void> {
  const { error } = await supabase.from("course_modules").delete().eq("id", moduleId);
  if (error) throw new Error(error.message);
}

/**
 * `data`'s narrowed shape has the same closed-shape-vs-open-index-signature
 * gap documented in `src/db/schema/courses.verify.ts` - every value it can
 * hold is valid JSON, but TypeScript can't see that structurally.
 */
export async function insertCourseBlock(
  moduleId: string,
  type: CourseBlockType,
  data: CourseBlockData,
  position: number,
): Promise<CourseBlockRow> {
  const { data: row, error } = await supabase
    .from("course_blocks")
    .insert({ module_id: moduleId, type, data: data as unknown as Json, position })
    .select("id,module_id,type,data,position")
    .single();

  if (error) throw new Error(error.message);
  return row;
}

export async function updateCourseBlockData(blockId: string, data: CourseBlockData): Promise<void> {
  const { error } = await supabase.from("course_blocks").update({ data }).eq("id", blockId);
  if (error) throw new Error(error.message);
}

export async function deleteCourseBlock(blockId: string): Promise<void> {
  const { error } = await supabase.from("course_blocks").delete().eq("id", blockId);
  if (error) throw new Error(error.message);
}
