/**
 * The schema type the app actually talks to.
 *
 * `types.ts` is regenerated wholesale by `supabase gen types`, so nothing
 * hand-written may live there — it would be silently erased on the next
 * regeneration. Two gaps in that generated output used to be papered over
 * with `as any` at the call sites, which switches off checking for the
 * whole surrounding expression rather than just the unknown name:
 *
 *   1. A handful of schema objects are missing entirely.
 *   2. Every `RETURNS jsonb` function is typed `Returns: Json`, which is
 *      true but useless — `Json` carries no fields, so reading one always
 *      required a cast.
 *
 * This module is the one hand-maintained seam. It declares the missing
 * objects and replaces those `Json` returns with the payloads the
 * functions actually build, read off the `jsonb_build_object` calls in
 * `supabase/migrations`. Import `Database` from here, never from `./types`.
 *
 * These payloads are asserted, not validated — exactly as the generated
 * types assert the shape of every other RPC. The safeguard is that each
 * one cites the migration it was read from: when you change that SQL,
 * change the type in the same commit.
 */
import type { Database as GeneratedDatabase, Json } from "./types";

type PublicSchema = GeneratedDatabase["public"];

// ── Missing schema objects ───────────────────────────────────────────────

/**
 * Views the generator omits.
 *
 * Columns are uniformly nullable because Postgres proves no NOT NULL
 * guarantee through a `UNION ALL`, and the generator reflects that. The
 * narrowing belongs at the call site, where the discriminant is known.
 */
type SupplementalViews = {
  /**
   * Moderator dashboard feed: forum threads, answers and comments that are
   * either hidden or reported, flattened into one shape.
   * Source: `20260516152538_forum-moderation-overhaul.sql`.
   */
  admin_moderation_queue: {
    Row: {
      /** discriminant — `"thread" | "answer" | "comment"` */
      target_type: string | null;
      target_id: string | null;
      author_id: string | null;
      author_name: string | null;
      /** threads only; always null for answers and comments */
      title: string | null;
      body: string | null;
      moderation_status: string | null;
      moderation_reason: string | null;
      moderation_score: number | null;
      moderation_category: string | null;
      report_count: number | null;
      hidden_at: string | null;
      created_at: string | null;
      updated_at: string | null;
    };
    Relationships: [];
  };
};

/** Functions the generator omits entirely. */
type SupplementalFunctions = {
  /**
   * Applies a finished bot battle at a reduced rating change. Idempotent —
   * the session's `rating_applied` flag makes a replay a no-op, which is
   * what `already_completed` reports.
   * Source: `20260614020000_bot-battles-count.sql`.
   */
  complete_bot_battle: {
    Args: { p_session_id: string };
    Returns: RatingApplication;
  };
  /**
   * Public contact form submission. Validates, rate-limits per email and
   * runs the forum moderation matcher before inserting.
   * Source: `20260516200335_contact-messages.sql`.
   */
  submit_contact_message: {
    Args: {
      p_email: string;
      p_message: string;
      p_name: string;
      p_subject: string | null;
      p_user_agent?: string | null;
    };
    Returns: {
      ok: boolean;
      id: string;
      moderation_status: string;
    };
  };
  /**
   * Admin: increments a user's XP by a fixed amount, bypassing the normal
   * per-event award caps. Returns the resulting total.
   * Source: `20260725000001_admin-grant-xp.sql`.
   */
  admin_grant_xp: {
    Args: { p_user_id: string; p_amount: number };
    Returns: number;
  };
  /**
   * Admin: sets a user's XP to an exact value. Returns the resulting total.
   * Source: `20260725000001_admin-grant-xp.sql`.
   */
  admin_set_xp: {
    Args: { p_user_id: string; p_xp: number };
    Returns: number;
  };
  /**
   * Security-definer lookup of a username by user_id, bypassing
   * user_profiles' own-row-only SELECT policy — the same reason
   * get_public_profile exists, just keyed the other direction. Null if the
   * user doesn't exist or never set a username.
   * Source: `20260806000000_get-username-by-id.sql`.
   */
  get_username_by_id: {
    Args: { p_user_id: string };
    Returns: string | null;
  };
};

/**
 * Argument overrides for functions whose parameters accept NULL.
 *
 * `supabase gen types` emits every `text` parameter as a non-nullable
 * `string`, because a Postgres signature records no nullability. For these
 * the SQL genuinely treats NULL as meaningful — an optional subject line, a
 * join by code rather than by id — and callers have always passed it. The
 * casts previously hid the mismatch; these declarations state it instead.
 */
type FunctionArgOverrides = {
  /** Every field but the session type is optional context. */
  log_learning_history: {
    Args: {
      p_session_type: string;
      p_topic: string | null;
      p_question_text: string | null;
      p_was_correct: boolean | null;
      p_response_time_ms: number | null;
      p_hint_level_used: number | null;
      p_luna_summary: string | null;
    };
    Returns: undefined;
  };
  /** A learner with no equipped Ecliptar creates a room without one. */
  create_study_room: {
    Args: {
      p_name: string;
      p_topic: string;
      p_is_public: boolean;
      p_display_name: string;
      p_ecliptar_slug: string | null;
    };
    Returns: PublicSchema["Functions"]["create_study_room"]["Returns"];
  };
  /** Exactly one of `p_room` (public lobby) or `p_code` (private invite) is given. */
  join_study_room: {
    Args: {
      p_room: string | null;
      p_code: string | null;
      p_display_name: string;
      p_ecliptar_slug: string | null;
    };
    Returns: PublicSchema["Functions"]["join_study_room"]["Returns"];
  };
  /** Null clears the room's goal line. */
  set_room_goal: {
    Args: { p_room: string; p_goal: string | null };
    Returns: PublicSchema["Functions"]["set_room_goal"]["Returns"];
  };
};

// ── jsonb payloads ───────────────────────────────────────────────────────

/**
 * Result of applying a single player's rating change. Shared verbatim by
 * the ghost and bot completion functions.
 *
 * The rating fields are nullable only on the `already_completed` path,
 * where they are read back from a `battle_sessions` row whose columns
 * permit null.
 */
interface RatingApplication {
  already_completed: boolean;
  rating_before: number | null;
  rating_after: number | null;
  rating_delta: number | null;
}

/**
 * The moves a battle turn can be. `submit_pvp_turn_action` rejects anything
 * else outright, so the `text` column can only ever hold one of these — it is a
 * union in practice, and typed as one here.
 *
 * `wild` is retained: the action was replaced by per-Ecliptar `ultimate` casts
 * (migration 20260801000000), but historical rows still hold it, so reads must
 * keep accepting it even though the client no longer writes it.
 */
type PvpActionName = "attack" | "defend" | "charge" | "ultimate" | "wild";

/**
 * One player's action within a resolved turn, mirroring a
 * `pvp_turn_actions` row.
 */
interface PvpTurnAction {
  actor_id: string;
  action: PvpActionName;
  correct: boolean;
  damage: number;
  self_damage: number;
  heal: number;
  focus_delta: number;
  momentum: number;
  time_spent: number;
  question: Json;
}

/**
 * A turn is resolvable only once both players have submitted. `ready`
 * is the gate; `actions` is `[]` until then.
 */
interface PvpTurnResolution {
  ready: boolean;
  turn_number: number;
  actions: PvpTurnAction[];
}

/** Discriminated on `matched` — the unmatched branch carries nothing else. */
type PvpMatchAttempt =
  | { matched: false }
  | {
      matched: true;
      battle_id: string;
      opponent_user_id: string;
      opponent_username: string | null;
      opponent_archetype: string;
      opponent_rating: number;
    };

/** Discriminated on `accepted` — the rejected branch carries nothing else. */
type PvpChallengeResponse =
  | { accepted: false }
  | {
      accepted: true;
      battle_id: string;
      challenger_archetype: string;
      opponent_archetype: string;
      challenger_id: string;
    };

/**
 * Replaces the `Returns: Json` the generator emits for `RETURNS jsonb`
 * functions. Keys here must already exist in the generated `Functions`;
 * `Omit` below removes the generated entry so this one wins outright
 * rather than intersecting into `Json & {...}`.
 */
type FunctionReturnOverrides = {
  complete_authoritative_pvp_battle: {
    Args: PublicSchema["Functions"]["complete_authoritative_pvp_battle"]["Args"];
    Returns: {
      already_completed: boolean;
      winner_id: string;
      challenger_rating_before: number | null;
      opponent_rating_before: number | null;
      challenger_rating_after: number | null;
      opponent_rating_after: number | null;
    };
  };
  issue_battle_question: {
    Args: PublicSchema["Functions"]["issue_battle_question"]["Args"];
    Returns: {
      challenge_id: string;
      prompt: string;
      options: number[];
      topic: string;
      difficulty: "easy" | "medium" | "hard";
      expires_at: string;
    };
  };
  submit_battle_answer: {
    Args: PublicSchema["Functions"]["submit_battle_answer"]["Args"];
    Returns: {
      correct: boolean;
      answer: number;
      topic: string;
      difficulty: "easy" | "medium" | "hard";
      battle_id: string | null;
    };
  };
  submit_authoritative_pvp_turn_action: {
    Args: PublicSchema["Functions"]["submit_authoritative_pvp_turn_action"]["Args"];
    Returns: { ready: boolean; turn_number: number; actions: PvpTurnAction[] };
  };
  /** Source: `20260617000000_claim-ecliptar-by-shape.sql`. */
  claim_ecliptar: {
    Args: PublicSchema["Functions"]["claim_ecliptar"]["Args"];
    Returns: { already_claimed: boolean; slug: string };
  };
  /** Source: `20260516044300_e9c63e3f-f2c0-4693-a3ea-76a4b3726dac.sql`. */
  complete_ghost_battle: {
    Args: PublicSchema["Functions"]["complete_ghost_battle"]["Args"];
    Returns: RatingApplication;
  };
  /** Source: `20260516150706_pvp-status-leaderboard-rematch-fix.sql`. */
  complete_pvp_battle: {
    Args: PublicSchema["Functions"]["complete_pvp_battle"]["Args"];
    Returns: {
      already_completed: boolean;
      winner_id: string;
      challenger_rating_before: number | null;
      opponent_rating_before: number | null;
      challenger_rating_after: number | null;
      opponent_rating_after: number | null;
    };
  };
  /** Source: `20260512182744_d8b0b2a1-9fd5-4c4e-8c5e-4434629dd38e.sql`. */
  find_pvp_match: {
    Args: PublicSchema["Functions"]["find_pvp_match"]["Args"];
    Returns: PvpMatchAttempt;
  };
  /**
   * Null when no eligible ghost exists near the player's rating.
   * Source: `20260517201543_notifications-and-ghost-polish.sql`.
   */
  get_ghost_session: {
    Args: PublicSchema["Functions"]["get_ghost_session"]["Args"];
    Returns: {
      id: string;
      archetype: string;
      won: boolean;
      rating: number;
      total_questions: number;
      correct_answers: number;
      best_streak: number;
      question_records: Json;
      username: string | null;
    } | null;
  };
  /** Source: `20260515002226_4246b7d5-17be-4c5a-aa37-16cebf33223e.sql`. */
  get_pvp_turn_resolution: {
    Args: PublicSchema["Functions"]["get_pvp_turn_resolution"]["Args"];
    Returns: PvpTurnResolution;
  };
  /**
   * `ready` flips once both players have asked for the rematch; until
   * then `battle_id` is null.
   * Source: `20260516150706_pvp-status-leaderboard-rematch-fix.sql`.
   */
  request_pvp_rematch: {
    Args: PublicSchema["Functions"]["request_pvp_rematch"]["Args"];
    Returns: { ready: boolean; battle_id: string | null; requests: Json };
  };
  /** Source: `20260517201543_notifications-and-ghost-polish.sql`. */
  respond_pvp_challenge: {
    Args: PublicSchema["Functions"]["respond_pvp_challenge"]["Args"];
    Returns: PvpChallengeResponse;
  };
  /**
   * `p_reason` is `DEFAULT NULL` — moderators aren't required to explain.
   * Source: `20260516152538_forum-moderation-overhaul.sql`.
   */
  set_moderation_status: {
    Args: {
      p_target_type: string;
      p_target_id: string;
      p_status: string;
      p_reason?: string | null;
    };
    Returns: { ok: boolean; status: string };
  };
  /**
   * `deduplicated` marks a repeat report from the same user, which is
   * accepted but does not move `report_count`.
   * Source: `20260516152538_forum-moderation-overhaul.sql`.
   */
  submit_forum_report: {
    Args: PublicSchema["Functions"]["submit_forum_report"]["Args"];
    Returns: {
      ok: boolean;
      deduplicated?: boolean;
      report_count?: number;
      auto_hidden?: boolean;
    };
  };
  /** Source: `20260515002226_4246b7d5-17be-4c5a-aa37-16cebf33223e.sql`. */
  submit_pvp_turn_action: {
    Args: PublicSchema["Functions"]["submit_pvp_turn_action"]["Args"];
    Returns: PvpTurnResolution;
  };
};

// ── The merged schema ────────────────────────────────────────────────────

export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<PublicSchema, "Views" | "Functions"> & {
    Views: PublicSchema["Views"] & SupplementalViews;
    Functions: Omit<
      PublicSchema["Functions"],
      keyof FunctionReturnOverrides | keyof FunctionArgOverrides
    > &
      FunctionReturnOverrides &
      FunctionArgOverrides &
      SupplementalFunctions;
  };
};

type PublicRelations = Database["public"]["Tables"] & Database["public"]["Views"];

/**
 * A table's or view's `Row` type by name.
 *
 * Two uses: realtime subscriptions, where `.on()` needs the row shape as an
 * explicit type argument (without it `payload.new` degrades to an index
 * signature and every field read becomes a cast), and adapter functions
 * that convert a raw row into a narrower domain type.
 */
export type TableRow<Name extends keyof PublicRelations> = PublicRelations[Name]["Row"];

export type { Json } from "./types";
export type {
  PvpActionName,
  PvpMatchAttempt,
  PvpTurnAction,
  PvpTurnResolution,
  PvpChallengeResponse,
  RatingApplication,
};
