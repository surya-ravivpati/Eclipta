import { supabase } from "@/integrations/supabase/client";
import type { ArchetypeId } from "@/components/battles/types";

/**
 * Mission Control data.
 *
 * The happy path is a single `get_dashboard` RPC - see migration
 * 20260802000000 for why this is not a dozen client queries.
 *
 * But the homepage must not hard-fail when that function is missing. An
 * undeployed migration would otherwise brick the first screen every signed-in
 * user sees, which is the worst possible place for a single point of failure.
 * So a failed RPC degrades to a reduced dashboard assembled from direct table
 * reads, and the reason is reported rather than swallowed.
 */

export interface ResumeTarget {
  course_slug: string;
  course_title: string | null;
  current_block_id: string | null;
  percent: number;
  lessons_done: number;
  lessons_total: number;
  last_opened_at: string;
}

export interface DashboardData {
  profile: {
    username?: string | null;
    xp?: number;
    daily_streak?: number;
    best_streak?: number;
    streak_freezes?: number;
    last_practice_date?: string | null;
    equipped_ecliptar?: string | null;
  };
  resume: ResumeTarget | null;
  today: { xp: number; questions: number; battles: number; practised: boolean };
  xp_week: { day: string; xp: number }[];
  rating: { rating?: number; peak_rating?: number; wins?: number; losses?: number };
  recent_battles: {
    id: string;
    archetype: ArchetypeId;
    won: boolean;
    correct_answers: number;
    total_questions: number;
    rating_delta: number | null;
    opponent_type: string;
    created_at: string;
  }[];
  ecliptars_owned: number;
  archetype_use: {
    archetype: ArchetypeId;
    battles_played: number;
    wins: number;
    total_correct: number;
    total_questions: number;
  }[];
  chests_claimed: number[];
  weakest: { concept: string; subject: string; confidence: number }[];
  due_review: number;
  strongest: { subject: string; confidence: number }[];
  notifications: {
    id: string;
    type: string;
    link: string | null;
    meta: unknown;
    read: boolean;
    created_at: string;
  }[];
  unread_count: number;
  recent_courses: {
    course_slug: string;
    course_title: string | null;
    percent: number;
    last_opened_at: string;
  }[];
  recent_topics: string[];
}

export type DashboardResult =
  | { status: "ok"; data: DashboardData }
  /** The RPC worked but is missing pieces, or we fell back to direct reads. */
  | { status: "degraded"; data: DashboardData; reason: string }
  | { status: "error"; reason: string };

/** An empty shell every field of the UI can safely read. */
function emptyDashboard(): DashboardData {
  return {
    profile: {},
    resume: null,
    today: { xp: 0, questions: 0, battles: 0, practised: false },
    xp_week: [],
    rating: {},
    recent_battles: [],
    ecliptars_owned: 0,
    archetype_use: [],
    chests_claimed: [],
    weakest: [],
    due_review: 0,
    strongest: [],
    notifications: [],
    unread_count: 0,
    recent_courses: [],
    recent_topics: [],
  };
}

export async function getDashboard(): Promise<DashboardResult> {
  const { data, error } = await supabase.rpc("get_dashboard", {});

  if (!error && data) {
    return { status: "ok", data: data as unknown as DashboardData };
  }

  // PGRST202 is PostgREST's "no function matches" - i.e. the migration has not
  // been applied. Worth distinguishing, because the fix is a deploy rather than
  // a code change, and a generic "something went wrong" sends people hunting in
  // the wrong place.
  const code = (error as { code?: string } | null)?.code;
  const missing = code === "PGRST202" || /function .* does not exist/i.test(error?.message ?? "");
  const reason = missing
    ? "The get_dashboard function is not deployed (migration 20260802000000)."
    : (error?.message ?? "Unknown error loading the dashboard.");

  console.warn("[dashboard] falling back to direct reads:", reason, error);

  const fallback = await buildFallback();
  return fallback ? { status: "degraded", data: fallback, reason } : { status: "error", reason };
}

/**
 * Reduced dashboard from plain table reads.
 *
 * Only touches tables that existed before this feature and are readable under
 * the user's own RLS policies, so it works even when nothing new has shipped.
 * Deliberately does not attempt the aggregate sections - a wrong number is
 * worse than an absent one.
 */
async function buildFallback(): Promise<DashboardData | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const shell = emptyDashboard();

  const [profile, courses, ratings, battles] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("username, xp, daily_streak, best_streak, streak_freezes, equipped_ecliptar")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("course_progress")
      .select(
        "course_slug, course_title, current_block_id, percent, lessons_done, lessons_total, last_opened_at, completed_at",
      )
      .eq("user_id", user.id)
      .order("last_opened_at", { ascending: false })
      .limit(4),
    supabase
      .from("player_ratings")
      .select("rating, peak_rating, wins, losses")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("battle_sessions")
      .select(
        "id, archetype, won, correct_answers, total_questions, rating_delta, opponent_type, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (profile.data) shell.profile = profile.data;
  if (ratings.data) shell.rating = ratings.data;
  if (battles.data) shell.recent_battles = battles.data as DashboardData["recent_battles"];

  if (courses.data) {
    shell.recent_courses = courses.data.map((c) => ({
      course_slug: c.course_slug,
      course_title: c.course_title,
      percent: c.percent,
      last_opened_at: c.last_opened_at,
    }));
    // The hero's resume target: most recent unfinished course.
    const open = courses.data.find((c) => c.completed_at === null);
    if (open) {
      shell.resume = {
        course_slug: open.course_slug,
        course_title: open.course_title,
        current_block_id: open.current_block_id,
        percent: open.percent,
        lessons_done: open.lessons_done,
        lessons_total: open.lessons_total,
        last_opened_at: open.last_opened_at,
      };
    }
  }

  return shell;
}
