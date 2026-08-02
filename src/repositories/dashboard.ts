import { supabase } from "@/integrations/supabase/client";
import type { ArchetypeId } from "@/components/battles/types";

/**
 * Mission Control data.
 *
 * One RPC, one snapshot — see migration 20260802000000 for why this is not a
 * dozen client queries.
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

export async function getDashboard(): Promise<DashboardData | null> {
  const { data, error } = await supabase.rpc("get_dashboard", {});
  if (error) {
    console.warn("getDashboard failed", error);
    return null;
  }
  return data as unknown as DashboardData;
}
