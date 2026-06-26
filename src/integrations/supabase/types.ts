export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_call_log: {
        Row: {
          called_at: string
          id: number
          user_id: string
        }
        Insert: {
          called_at?: string
          id?: never
          user_id: string
        }
        Update: {
          called_at?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      archetype_mastery: {
        Row: {
          archetype: string
          battles_played: number
          best_streak: number
          id: string
          perfect_battles: number
          total_correct: number
          total_questions: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          archetype: string
          battles_played?: number
          best_streak?: number
          id?: string
          perfect_battles?: number
          total_correct?: number
          total_questions?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          archetype?: string
          battles_played?: number
          best_streak?: number
          id?: string
          perfect_battles?: number
          total_correct?: number
          total_questions?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      battle_sessions: {
        Row: {
          archetype: string
          best_streak: number
          correct_answers: number
          created_at: string
          id: string
          opponent_type: string
          question_records: Json
          rating: number
          rating_after: number | null
          rating_applied: boolean
          rating_before: number | null
          rating_delta: number | null
          total_questions: number
          user_id: string
          won: boolean
        }
        Insert: {
          archetype: string
          best_streak?: number
          correct_answers?: number
          created_at?: string
          id?: string
          opponent_type?: string
          question_records?: Json
          rating?: number
          rating_after?: number | null
          rating_applied?: boolean
          rating_before?: number | null
          rating_delta?: number | null
          total_questions?: number
          user_id: string
          won: boolean
        }
        Update: {
          archetype?: string
          best_streak?: number
          correct_answers?: number
          created_at?: string
          id?: string
          opponent_type?: string
          question_records?: Json
          rating?: number
          rating_after?: number | null
          rating_applied?: boolean
          rating_before?: number | null
          rating_delta?: number | null
          total_questions?: number
          user_id?: string
          won?: boolean
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      course_blocks: {
        Row: {
          created_at: string
          data: Json
          id: string
          module_id: string
          position: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          module_id: string
          position?: number
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          module_id?: string
          position?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_blocks_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          course_id: string
          created_at: string
          id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "user_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_proposals: {
        Row: {
          ai_feedback: string | null
          ai_score: number | null
          course_id: string | null
          created_at: string
          creator_reasoning: string
          denial_reason: string | null
          depth: string
          description: string | null
          id: string
          level: string
          prerequisites: string | null
          status: string
          structure: string
          topic: string
          updated_at: string
          user_id: string
          weekly_hours: number
        }
        Insert: {
          ai_feedback?: string | null
          ai_score?: number | null
          course_id?: string | null
          created_at?: string
          creator_reasoning: string
          denial_reason?: string | null
          depth: string
          description?: string | null
          id?: string
          level: string
          prerequisites?: string | null
          status?: string
          structure: string
          topic: string
          updated_at?: string
          user_id: string
          weekly_hours?: number
        }
        Update: {
          ai_feedback?: string | null
          ai_score?: number | null
          course_id?: string | null
          created_at?: string
          creator_reasoning?: string
          denial_reason?: string | null
          depth?: string
          description?: string | null
          id?: string
          level?: string
          prerequisites?: string | null
          status?: string
          structure?: string
          topic?: string
          updated_at?: string
          user_id?: string
          weekly_hours?: number
        }
        Relationships: []
      }
      daily_challenge_progress: {
        Row: {
          bonus_claimed: boolean
          challenge_date: string
          id: string
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          bonus_claimed?: boolean
          challenge_date?: string
          id?: string
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          bonus_claimed?: boolean
          challenge_date?: string
          id?: string
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          course_slug: string
          course_title: string
          enrolled_at: string
          id: string
          user_id: string
        }
        Insert: {
          course_slug: string
          course_title: string
          enrolled_at?: string
          id?: string
          user_id: string
        }
        Update: {
          course_slug?: string
          course_title?: string
          enrolled_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      forum_answers: {
        Row: {
          accepted: boolean
          author_name: string
          body: string
          created_at: string
          hidden_at: string | null
          id: string
          moderation_category: string | null
          moderation_reason: string | null
          moderation_score: number | null
          moderation_status: string
          report_count: number
          thread_id: string
          updated_at: string
          user_id: string
          votes: number
        }
        Insert: {
          accepted?: boolean
          author_name: string
          body: string
          created_at?: string
          hidden_at?: string | null
          id?: string
          moderation_category?: string | null
          moderation_reason?: string | null
          moderation_score?: number | null
          moderation_status?: string
          report_count?: number
          thread_id: string
          updated_at?: string
          user_id: string
          votes?: number
        }
        Update: {
          accepted?: boolean
          author_name?: string
          body?: string
          created_at?: string
          hidden_at?: string | null
          id?: string
          moderation_category?: string | null
          moderation_reason?: string | null
          moderation_score?: number | null
          moderation_status?: string
          report_count?: number
          thread_id?: string
          updated_at?: string
          user_id?: string
          votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "forum_answers_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "forum_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_comments: {
        Row: {
          answer_id: string
          author_name: string
          body: string
          created_at: string
          hidden_at: string | null
          id: string
          moderation_category: string | null
          moderation_reason: string | null
          moderation_score: number | null
          moderation_status: string
          report_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_id: string
          author_name: string
          body: string
          created_at?: string
          hidden_at?: string | null
          id?: string
          moderation_category?: string | null
          moderation_reason?: string | null
          moderation_score?: number | null
          moderation_status?: string
          report_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_id?: string
          author_name?: string
          body?: string
          created_at?: string
          hidden_at?: string | null
          id?: string
          moderation_category?: string | null
          moderation_reason?: string | null
          moderation_score?: number | null
          moderation_status?: string
          report_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_comments_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "forum_answers"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolver_id: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolver_id?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolver_id?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      forum_thread_views: {
        Row: {
          thread_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          thread_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          thread_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_thread_views_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "forum_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_threads: {
        Row: {
          answer_count: number
          author_name: string
          body: string
          course: string
          created_at: string
          hidden_at: string | null
          id: string
          moderation_category: string | null
          moderation_reason: string | null
          moderation_score: number | null
          moderation_status: string
          report_count: number
          solved: boolean
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          view_count: number
          votes: number
        }
        Insert: {
          answer_count?: number
          author_name: string
          body: string
          course?: string
          created_at?: string
          hidden_at?: string | null
          id?: string
          moderation_category?: string | null
          moderation_reason?: string | null
          moderation_score?: number | null
          moderation_status?: string
          report_count?: number
          solved?: boolean
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
          view_count?: number
          votes?: number
        }
        Update: {
          answer_count?: number
          author_name?: string
          body?: string
          course?: string
          created_at?: string
          hidden_at?: string | null
          id?: string
          moderation_category?: string | null
          moderation_reason?: string | null
          moderation_score?: number | null
          moderation_status?: string
          report_count?: number
          solved?: boolean
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          view_count?: number
          votes?: number
        }
        Relationships: []
      }
      forum_votes: {
        Row: {
          created_at: string
          id: string
          target_id: string
          target_type: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          target_id: string
          target_type: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      learning_history: {
        Row: {
          created_at: string
          hint_level_used: number | null
          id: string
          luna_summary: string | null
          question_text: string | null
          response_time_ms: number | null
          session_type: string
          topic: string | null
          user_id: string
          was_correct: boolean | null
        }
        Insert: {
          created_at?: string
          hint_level_used?: number | null
          id?: string
          luna_summary?: string | null
          question_text?: string | null
          response_time_ms?: number | null
          session_type?: string
          topic?: string | null
          user_id: string
          was_correct?: boolean | null
        }
        Update: {
          created_at?: string
          hint_level_used?: number | null
          id?: string
          luna_summary?: string | null
          question_text?: string | null
          response_time_ms?: number | null
          session_type?: string
          topic?: string | null
          user_id?: string
          was_correct?: boolean | null
        }
        Relationships: []
      }
      moderation_actions: {
        Row: {
          action: string
          actor_id: string | null
          category: string | null
          created_at: string
          id: string
          payload: Json | null
          reason: string | null
          score: number | null
          source: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          reason?: string | null
          score?: number | null
          source: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          reason?: string | null
          score?: number | null
          source?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      moderation_config: {
        Row: {
          key: string
          notes: string | null
          value: Json
        }
        Insert: {
          key: string
          notes?: string | null
          value: Json
        }
        Update: {
          key?: string
          notes?: string | null
          value?: Json
        }
        Relationships: []
      }
      moderation_decisions: {
        Row: {
          author_id: string | null
          category: string | null
          confidence: number | null
          content_ref: string | null
          created_at: string
          decision: string
          id: string
          layers: string[]
          self_harm: boolean
          surface_type: string
          target_type: string
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          confidence?: number | null
          content_ref?: string | null
          created_at?: string
          decision: string
          id?: string
          layers?: string[]
          self_harm?: boolean
          surface_type: string
          target_type: string
        }
        Update: {
          author_id?: string | null
          category?: string | null
          confidence?: number | null
          content_ref?: string | null
          created_at?: string
          decision?: string
          id?: string
          layers?: string[]
          self_harm?: boolean
          surface_type?: string
          target_type?: string
        }
        Relationships: []
      }
      moderation_rescan_queue: {
        Row: {
          author_id: string | null
          content_ref: string | null
          created_at: string
          id: string
          processed: boolean
          reason: string
          snapshot: string
          surface_type: string
          target_type: string
        }
        Insert: {
          author_id?: string | null
          content_ref?: string | null
          created_at?: string
          id?: string
          processed?: boolean
          reason?: string
          snapshot: string
          surface_type: string
          target_type: string
        }
        Update: {
          author_id?: string | null
          content_ref?: string | null
          created_at?: string
          id?: string
          processed?: boolean
          reason?: string
          snapshot?: string
          surface_type?: string
          target_type?: string
        }
        Relationships: []
      }
      moderation_terms: {
        Row: {
          category: string
          created_at: string
          id: string
          notes: string | null
          severity: number
          term: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          notes?: string | null
          severity: number
          term: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          severity?: number
          term?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          link: string | null
          meta: Json
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          meta?: Json
          read?: boolean
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          meta?: Json
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      player_ratings: {
        Row: {
          losses: number
          peak_rating: number
          rating: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          losses?: number
          peak_rating?: number
          rating?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          losses?: number
          peak_rating?: number
          rating?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      pvp_battles: {
        Row: {
          challenger_archetype: string
          challenger_id: string
          challenger_rating_after: number | null
          challenger_rating_before: number | null
          completed_at: string | null
          created_at: string
          id: string
          opponent_archetype: string
          opponent_id: string
          opponent_rating_after: number | null
          opponent_rating_before: number | null
          ratings_applied: boolean
          rematch_battle_id: string | null
          rematch_requested_by: string[]
          status: string
          winner_id: string | null
        }
        Insert: {
          challenger_archetype: string
          challenger_id: string
          challenger_rating_after?: number | null
          challenger_rating_before?: number | null
          completed_at?: string | null
          created_at?: string
          id?: string
          opponent_archetype: string
          opponent_id: string
          opponent_rating_after?: number | null
          opponent_rating_before?: number | null
          ratings_applied?: boolean
          rematch_battle_id?: string | null
          rematch_requested_by?: string[]
          status?: string
          winner_id?: string | null
        }
        Update: {
          challenger_archetype?: string
          challenger_id?: string
          challenger_rating_after?: number | null
          challenger_rating_before?: number | null
          completed_at?: string | null
          created_at?: string
          id?: string
          opponent_archetype?: string
          opponent_id?: string
          opponent_rating_after?: number | null
          opponent_rating_before?: number | null
          ratings_applied?: boolean
          rematch_battle_id?: string | null
          rematch_requested_by?: string[]
          status?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      pvp_challenges: {
        Row: {
          battle_id: string | null
          challenged_id: string
          challenger_archetype: string
          challenger_id: string
          created_at: string
          expires_at: string
          id: string
          status: string
        }
        Insert: {
          battle_id?: string | null
          challenged_id: string
          challenger_archetype: string
          challenger_id: string
          created_at?: string
          expires_at?: string
          id?: string
          status?: string
        }
        Update: {
          battle_id?: string | null
          challenged_id?: string
          challenger_archetype?: string
          challenger_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
      pvp_queue: {
        Row: {
          archetype: string
          queued_at: string
          rating: number
          user_id: string
          username: string | null
        }
        Insert: {
          archetype: string
          queued_at?: string
          rating?: number
          user_id: string
          username?: string | null
        }
        Update: {
          archetype?: string
          queued_at?: string
          rating?: number
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      pvp_turn_actions: {
        Row: {
          action: string
          actor_id: string
          battle_id: string
          correct: boolean
          created_at: string
          damage: number
          focus_delta: number
          heal: number
          id: string
          momentum: number
          question: Json
          self_damage: number
          time_spent: number
          turn_number: number
        }
        Insert: {
          action: string
          actor_id: string
          battle_id: string
          correct: boolean
          created_at?: string
          damage?: number
          focus_delta?: number
          heal?: number
          id?: string
          momentum?: number
          question?: Json
          self_damage?: number
          time_spent?: number
          turn_number: number
        }
        Update: {
          action?: string
          actor_id?: string
          battle_id?: string
          correct?: boolean
          created_at?: string
          damage?: number
          focus_delta?: number
          heal?: number
          id?: string
          momentum?: number
          question?: Json
          self_damage?: number
          time_spent?: number
          turn_number?: number
        }
        Relationships: []
      }
      review_queue: {
        Row: {
          author_id: string | null
          category: string | null
          confidence: number
          content_ref: string | null
          created_at: string
          id: string
          resolved_at: string | null
          resolver_id: string | null
          severity: number
          snapshot: string | null
          status: string
          surface_type: string
          target_type: string
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          confidence?: number
          content_ref?: string | null
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolver_id?: string | null
          severity?: number
          snapshot?: string | null
          status?: string
          surface_type: string
          target_type: string
        }
        Update: {
          author_id?: string | null
          category?: string | null
          confidence?: number
          content_ref?: string | null
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolver_id?: string | null
          severity?: number
          snapshot?: string | null
          status?: string
          surface_type?: string
          target_type?: string
        }
        Relationships: []
      }
      stuck_requests: {
        Row: {
          ai_due_at: string
          author_name: string | null
          created_at: string
          id: string
          note: string | null
          resolution_summary: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolver_name: string | null
          room_id: string
          status: string
          user_id: string
        }
        Insert: {
          ai_due_at: string
          author_name?: string | null
          created_at?: string
          id?: string
          note?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolver_name?: string | null
          room_id: string
          status?: string
          user_id: string
        }
        Update: {
          ai_due_at?: string
          author_name?: string | null
          created_at?: string
          id?: string
          note?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolver_name?: string | null
          room_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stuck_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      study_room_members: {
        Row: {
          display_name: string | null
          ecliptar_slug: string | null
          joined_at: string
          room_id: string
          tb_skip_used: boolean
          user_id: string
        }
        Insert: {
          display_name?: string | null
          ecliptar_slug?: string | null
          joined_at?: string
          room_id: string
          tb_skip_used?: boolean
          user_id: string
        }
        Update: {
          display_name?: string | null
          ecliptar_slug?: string | null
          joined_at?: string
          room_id?: string
          tb_skip_used?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      study_room_messages: {
        Row: {
          author_name: string | null
          body: string
          created_at: string
          ecliptar_slug: string | null
          id: string
          kind: string
          moderation_category: string | null
          moderation_reason: string | null
          moderation_score: number | null
          moderation_status: string
          room_id: string
          user_id: string
        }
        Insert: {
          author_name?: string | null
          body: string
          created_at?: string
          ecliptar_slug?: string | null
          id?: string
          kind?: string
          moderation_category?: string | null
          moderation_reason?: string | null
          moderation_score?: number | null
          moderation_status?: string
          room_id: string
          user_id: string
        }
        Update: {
          author_name?: string | null
          body?: string
          created_at?: string
          ecliptar_slug?: string | null
          id?: string
          kind?: string
          moderation_category?: string | null
          moderation_reason?: string | null
          moderation_score?: number | null
          moderation_status?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      study_room_reports: {
        Row: {
          author_kind: string
          created_at: string
          id: string
          message_snapshot: string
          reason: string | null
          reported_user_id: string | null
          reporter_id: string
          resolved_at: string | null
          room_id: string | null
          status: string
        }
        Insert: {
          author_kind?: string
          created_at?: string
          id?: string
          message_snapshot: string
          reason?: string | null
          reported_user_id?: string | null
          reporter_id: string
          resolved_at?: string | null
          room_id?: string | null
          status?: string
        }
        Update: {
          author_kind?: string
          created_at?: string
          id?: string
          message_snapshot?: string
          reason?: string | null
          reported_user_id?: string | null
          reporter_id?: string
          resolved_at?: string | null
          room_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_room_reports_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      study_rooms: {
        Row: {
          break_minutes: number
          created_at: string
          goal_text: string | null
          host_id: string | null
          id: string
          is_public: boolean
          join_code: string | null
          last_activity_at: string
          last_idle_nudge_at: string | null
          name: string
          owner_id: string
          phase: string
          phase_started_at: string
          removed_user_ids: string[]
          resource_links: Json
          tb_position: number
          tb_queue: string[]
          teach_back_enabled: boolean
          topic: string | null
          work_minutes: number
        }
        Insert: {
          break_minutes?: number
          created_at?: string
          goal_text?: string | null
          host_id?: string | null
          id?: string
          is_public?: boolean
          join_code?: string | null
          last_activity_at?: string
          last_idle_nudge_at?: string | null
          name: string
          owner_id: string
          phase?: string
          phase_started_at?: string
          removed_user_ids?: string[]
          resource_links?: Json
          tb_position?: number
          tb_queue?: string[]
          teach_back_enabled?: boolean
          topic?: string | null
          work_minutes?: number
        }
        Update: {
          break_minutes?: number
          created_at?: string
          goal_text?: string | null
          host_id?: string | null
          id?: string
          is_public?: boolean
          join_code?: string | null
          last_activity_at?: string
          last_idle_nudge_at?: string | null
          name?: string
          owner_id?: string
          phase?: string
          phase_started_at?: string
          removed_user_ids?: string[]
          resource_links?: Json
          tb_position?: number
          tb_queue?: string[]
          teach_back_enabled?: boolean
          topic?: string | null
          work_minutes?: number
        }
        Relationships: []
      }
      teach_back_reactions: {
        Row: {
          created_at: string
          reaction: string
          round_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          reaction: string
          round_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          reaction?: string
          round_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teach_back_reactions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "teach_back_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      teach_back_rounds: {
        Row: {
          answered_at: string | null
          concept_source: string | null
          concept_text: string | null
          created_at: string
          ended_at: string | null
          explainer_id: string | null
          explainer_name: string | null
          id: string
          kinda_count: number
          lost_count: number
          room_id: string
          status: string
          trigger_key: string
          up_count: number
        }
        Insert: {
          answered_at?: string | null
          concept_source?: string | null
          concept_text?: string | null
          created_at?: string
          ended_at?: string | null
          explainer_id?: string | null
          explainer_name?: string | null
          id?: string
          kinda_count?: number
          lost_count?: number
          room_id: string
          status?: string
          trigger_key: string
          up_count?: number
        }
        Update: {
          answered_at?: string | null
          concept_source?: string | null
          concept_text?: string | null
          created_at?: string
          ended_at?: string | null
          explainer_id?: string | null
          explainer_name?: string | null
          id?: string
          kinda_count?: number
          lost_count?: number
          room_id?: string
          status?: string
          trigger_key?: string
          up_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "teach_back_rounds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_chest_claims: {
        Row: {
          bonus_xp: number
          chest_label: string
          claimed_at: string
          id: string
          node_id: number
          user_id: string
        }
        Insert: {
          bonus_xp?: number
          chest_label: string
          claimed_at?: string
          id?: string
          node_id: number
          user_id: string
        }
        Update: {
          bonus_xp?: number
          chest_label?: string
          claimed_at?: string
          id?: string
          node_id?: number
          user_id?: string
        }
        Relationships: []
      }
      user_courses: {
        Row: {
          cover_image_url: string | null
          created_at: string
          depth: string
          enrolled_count: number
          id: string
          level: string
          proposal_id: string | null
          slug: string
          status: string
          structure: string
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          depth?: string
          enrolled_count?: number
          id?: string
          level?: string
          proposal_id?: string | null
          slug: string
          status?: string
          structure?: string
          summary?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          depth?: string
          enrolled_count?: number
          id?: string
          level?: string
          proposal_id?: string | null
          slug?: string
          status?: string
          structure?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_courses_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "course_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ecliptars: {
        Row: {
          archetype: string
          claimed_at: string
          ecliptar_name: string
          ecliptar_slug: string
          id: string
          node_id: number
          user_id: string
        }
        Insert: {
          archetype: string
          claimed_at?: string
          ecliptar_name: string
          ecliptar_slug: string
          id?: string
          node_id: number
          user_id: string
        }
        Update: {
          archetype?: string
          claimed_at?: string
          ecliptar_name?: string
          ecliptar_slug?: string
          id?: string
          node_id?: number
          user_id?: string
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      user_posting_pauses: {
        Row: {
          created_at: string
          id: string
          pending_review: boolean
          reason: string | null
          status: string
          until: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pending_review?: boolean
          reason?: string | null
          status?: string
          until: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pending_review?: boolean
          reason?: string | null
          status?: string
          until?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          age: number | null
          avatar_url: string | null
          avg_completion_time: number | null
          best_streak: number
          bio: string | null
          created_at: string
          current_streak: number
          daily_streak: number
          equipped_ecliptar: string | null
          id: string
          last_practice_date: string | null
          learner_profile: Json | null
          learning_goal: string | null
          longest_daily_streak: number
          luna_auto_notes: string | null
          luna_notes: string | null
          onboarded_at: string | null
          practice_dates: string[]
          preferred_pace: string
          preferred_style: string
          streak_freezes: number
          strong_areas: string[] | null
          total_correct: number
          total_questions: number
          total_sessions: number
          updated_at: string
          user_id: string
          username: string | null
          weak_areas: string[] | null
          weekly_hours: number | null
          xp: number
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          avg_completion_time?: number | null
          best_streak?: number
          bio?: string | null
          created_at?: string
          current_streak?: number
          daily_streak?: number
          equipped_ecliptar?: string | null
          id?: string
          last_practice_date?: string | null
          learner_profile?: Json | null
          learning_goal?: string | null
          longest_daily_streak?: number
          luna_auto_notes?: string | null
          luna_notes?: string | null
          onboarded_at?: string | null
          practice_dates?: string[]
          preferred_pace?: string
          preferred_style?: string
          streak_freezes?: number
          strong_areas?: string[] | null
          total_correct?: number
          total_questions?: number
          total_sessions?: number
          updated_at?: string
          user_id: string
          username?: string | null
          weak_areas?: string[] | null
          weekly_hours?: number | null
          xp?: number
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          avg_completion_time?: number | null
          best_streak?: number
          bio?: string | null
          created_at?: string
          current_streak?: number
          daily_streak?: number
          equipped_ecliptar?: string | null
          id?: string
          last_practice_date?: string | null
          learner_profile?: Json | null
          learning_goal?: string | null
          longest_daily_streak?: number
          luna_auto_notes?: string | null
          luna_notes?: string | null
          onboarded_at?: string | null
          practice_dates?: string[]
          preferred_pace?: string
          preferred_style?: string
          streak_freezes?: number
          strong_areas?: string[] | null
          total_correct?: number
          total_questions?: number
          total_sessions?: number
          updated_at?: string
          user_id?: string
          username?: string | null
          weak_areas?: string[] | null
          weekly_hours?: number | null
          xp?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wellbeing_alerts: {
        Row: {
          content_ref: string | null
          created_at: string
          id: string
          reviewed: boolean
          reviewer_id: string | null
          snapshot: string | null
          surface_type: string
          user_id: string
        }
        Insert: {
          content_ref?: string | null
          created_at?: string
          id?: string
          reviewed?: boolean
          reviewer_id?: string | null
          snapshot?: string | null
          surface_type: string
          user_id: string
        }
        Update: {
          content_ref?: string | null
          created_at?: string
          id?: string
          reviewed?: boolean
          reviewer_id?: string | null
          snapshot?: string | null
          surface_type?: string
          user_id?: string
        }
        Relationships: []
      }
      xp_award_log: {
        Row: {
          amount: number
          awarded_at: string
          event: string
          id: string
          user_id: string
        }
        Insert: {
          amount: number
          awarded_at?: string
          event: string
          id?: string
          user_id: string
        }
        Update: {
          amount?: number
          awarded_at?: string
          event?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          best_streak: number | null
          bio: string | null
          created_at: string | null
          current_streak: number | null
          equipped_ecliptar: string | null
          user_id: string | null
          username: string | null
          xp: number | null
        }
        Insert: {
          avatar_url?: string | null
          best_streak?: number | null
          bio?: string | null
          created_at?: string | null
          current_streak?: number | null
          equipped_ecliptar?: string | null
          user_id?: string | null
          username?: string | null
          xp?: number | null
        }
        Update: {
          avatar_url?: string | null
          best_streak?: number | null
          bio?: string | null
          created_at?: string | null
          current_streak?: number | null
          equipped_ecliptar?: string | null
          user_id?: string | null
          username?: string | null
          xp?: number | null
        }
        Relationships: []
      }
      user_violation_counts: {
        Row: {
          category: string | null
          last_at: string | null
          user_id: string | null
          violations: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      advance_room_phase: {
        Args: {
          p_from_phase: string
          p_from_started_at: string
          p_room: string
        }
        Returns: {
          break_minutes: number
          created_at: string
          goal_text: string | null
          host_id: string | null
          id: string
          is_public: boolean
          join_code: string | null
          last_activity_at: string
          last_idle_nudge_at: string | null
          name: string
          owner_id: string
          phase: string
          phase_started_at: string
          removed_user_ids: string[]
          resource_links: Json
          tb_position: number
          tb_queue: string[]
          teach_back_enabled: boolean
          topic: string | null
          work_minutes: number
        }
        SetofOptions: {
          from: "*"
          to: "study_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      allow_room_member: {
        Args: { p_room: string; p_user: string }
        Returns: undefined
      }
      apply_ai_moderation_result: {
        Args: {
          p_category: string
          p_reason: string
          p_score: number
          p_target_id: string
          p_target_type: string
          p_verdict: string
        }
        Returns: undefined
      }
      apply_moderation_outcome: {
        Args: {
          p_author: string
          p_category: string
          p_confidence: number
          p_content_ref: string
          p_decision: string
          p_layers: string[]
          p_needs_rescan: boolean
          p_self_harm: boolean
          p_severity: number
          p_snapshot: string
          p_surface: string
          p_target_type: string
        }
        Returns: Json
      }
      apply_pvp_rating_pair: {
        Args: {
          p_challenger_id: string
          p_opponent_id: string
          p_winner_id: string
        }
        Returns: {
          challenger_after: number
          challenger_before: number
          opponent_after: number
          opponent_before: number
        }[]
      }
      award_battle_xp: {
        Args: { p_correct: number; p_total: number; p_won: boolean }
        Returns: number
      }
      award_xp: { Args: { p_event: string }; Returns: number }
      check_ai_rate_limit: {
        Args: { p_max: number; p_user: string; p_window_secs: number }
        Returns: boolean
      }
      claim_chest: {
        Args: { p_chest_label: string; p_node_id: number }
        Returns: number
      }
      claim_daily_challenge_bonus: {
        Args: { p_required_wins: number }
        Returns: boolean
      }
      claim_ecliptar: {
        Args: {
          p_archetype: string
          p_name: string
          p_node_id: number
          p_slug: string
        }
        Returns: Json
      }
      cleanup_abandoned_rooms: { Args: never; Returns: number }
      complete_ghost_battle: {
        Args: { p_opponent_rating: number; p_session_id: string }
        Returns: Json
      }
      complete_pvp_battle: {
        Args: { p_battle_id: string; p_winner_id: string }
        Returns: Json
      }
      contains_profanity: { Args: { t: string }; Returns: boolean }
      create_pvp_challenge: {
        Args: { p_archetype: string; p_challenged_id: string }
        Returns: string
      }
      create_stuck_request: {
        Args: { p_note: string; p_room: string }
        Returns: {
          ai_due_at: string
          author_name: string | null
          created_at: string
          id: string
          note: string | null
          resolution_summary: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolver_name: string | null
          room_id: string
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "stuck_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_study_room: {
        Args: {
          p_display_name: string
          p_ecliptar_slug: string
          p_is_public: boolean
          p_name: string
          p_topic: string
        }
        Returns: {
          break_minutes: number
          created_at: string
          goal_text: string | null
          host_id: string | null
          id: string
          is_public: boolean
          join_code: string | null
          last_activity_at: string
          last_idle_nudge_at: string | null
          name: string
          owner_id: string
          phase: string
          phase_started_at: string
          removed_user_ids: string[]
          resource_links: Json
          tb_position: number
          tb_queue: string[]
          teach_back_enabled: boolean
          topic: string | null
          work_minutes: number
        }
        SetofOptions: {
          from: "*"
          to: "study_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enqueue_pvp: { Args: { p_archetype: string }; Returns: undefined }
      find_pvp_match: {
        Args: { p_archetype: string; p_rating: number }
        Returns: Json
      }
      get_forum_stats: {
        Args: never
        Returns: {
          answers: number
          contributors: number
          threads: number
        }[]
      }
      get_ghost_session: { Args: { p_player_rating: number }; Returns: Json }
      get_leaderboard: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          user_id: string
          username: string
          xp: number
        }[]
      }
      get_platform_stats: {
        Args: never
        Returns: {
          battles: number
          ecliptars: number
          learners: number
        }[]
      }
      get_public_profile: {
        Args: { p_username: string }
        Returns: {
          avatar_url: string
          best_streak: number
          created_at: string
          current_streak: number
          equipped_ecliptar: string
          user_id: string
          username: string
          xp: number
        }[]
      }
      get_pvp_leaderboard: {
        Args: { p_limit?: number }
        Returns: {
          losses: number
          rating: number
          user_id: string
          username: string
          wins: number
        }[]
      }
      get_pvp_turn_resolution: {
        Args: { p_battle_id: string; p_turn_number: number }
        Returns: Json
      }
      get_study_rooms: {
        Args: never
        Returns: {
          am_member: boolean
          break_minutes: number
          created_at: string
          goal_text: string
          host_id: string
          id: string
          is_public: boolean
          join_code: string
          last_activity_at: string
          member_count: number
          name: string
          owner_id: string
          phase: string
          phase_started_at: string
          resource_links: Json
          tb_position: number
          tb_queue: string[]
          teach_back_enabled: boolean
          topic: string
          work_minutes: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_daily_challenge_win: { Args: never; Returns: number }
      is_posting_paused: { Args: { p_user: string }; Returns: string }
      is_study_member: { Args: { p_room: string }; Returns: boolean }
      join_study_room: {
        Args: {
          p_code: string
          p_display_name: string
          p_ecliptar_slug: string
          p_room: string
        }
        Returns: {
          break_minutes: number
          created_at: string
          goal_text: string | null
          host_id: string | null
          id: string
          is_public: boolean
          join_code: string | null
          last_activity_at: string
          last_idle_nudge_at: string | null
          name: string
          owner_id: string
          phase: string
          phase_started_at: string
          removed_user_ids: string[]
          resource_links: Json
          tb_position: number
          tb_queue: string[]
          teach_back_enabled: boolean
          topic: string | null
          work_minutes: number
        }
        SetofOptions: {
          from: "*"
          to: "study_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      leave_study_room: { Args: { p_room: string }; Returns: undefined }
      log_learning_history: {
        Args: {
          p_hint_level_used: number
          p_luna_summary: string
          p_question_text: string
          p_response_time_ms: number
          p_session_type: string
          p_topic: string
          p_was_correct: boolean
        }
        Returns: undefined
      }
      moderation_cfg: { Args: { p_key: string }; Returns: Json }
      moderation_floor: {
        Args: { p_text: string }
        Returns: {
          category: string
          severity: number
          term_layer: string
        }[]
      }
      moderation_match: {
        Args: { p_text: string }
        Returns: {
          category: string
          severity: number
          term: string
        }[]
      }
      moderation_pattern_scan: {
        Args: { p_text: string }
        Returns: {
          category: string
          severity: number
        }[]
      }
      moderation_scan: {
        Args: { p_text: string }
        Returns: {
          category: string
          layer: string
          severity: number
        }[]
      }
      normalize_for_moderation: { Args: { p_text: string }; Returns: string }
      normalize_text: { Args: { t: string }; Returns: string }
      notify_mentions: {
        Args: {
          p_actor_id: string
          p_kind: string
          p_link: string
          p_meta: Json
          p_text: string
        }
        Returns: undefined
      }
      pass_teach_back: { Args: { p_round: string }; Returns: boolean }
      post_idle_nudge: { Args: { p_room: string }; Returns: boolean }
      react_teach_back: {
        Args: { p_reaction: string; p_round: string }
        Returns: undefined
      }
      record_battle_mastery: {
        Args: {
          p_archetype: string
          p_best_streak: number
          p_correct: number
          p_perfect: boolean
          p_total: number
          p_won: boolean
        }
        Returns: undefined
      }
      record_battle_session: {
        Args: {
          p_archetype: string
          p_best_streak: number
          p_correct_answers: number
          p_opponent_type: string
          p_question_records: Json
          p_rating: number
          p_total_questions: number
          p_won: boolean
        }
        Returns: string
      }
      record_daily_practice: { Args: never; Returns: Json }
      regenerate_room_code: { Args: { p_room: string }; Returns: string }
      remove_room_member: {
        Args: { p_room: string; p_user: string }
        Returns: undefined
      }
      report_room_message: {
        Args: {
          p_author_kind: string
          p_reason: string
          p_reported_user: string
          p_room: string
          p_snapshot: string
        }
        Returns: undefined
      }
      request_pvp_rematch: {
        Args: { p_archetype: string; p_battle_id: string }
        Returns: Json
      }
      resolve_stuck_human: { Args: { p_stuck: string }; Returns: boolean }
      respond_pvp_challenge: {
        Args: {
          p_accept: boolean
          p_archetype?: string
          p_challenge_id: string
        }
        Returns: Json
      }
      room_inactivity_window: { Args: never; Returns: string }
      search_users: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          avatar_url: string
          equipped_ecliptar: string
          user_id: string
          username: string
          xp: number
        }[]
      }
      set_moderation_status: {
        Args: {
          p_reason?: string
          p_status: string
          p_target_id: string
          p_target_type: string
        }
        Returns: Json
      }
      set_room_goal: {
        Args: { p_goal: string; p_room: string }
        Returns: {
          break_minutes: number
          created_at: string
          goal_text: string | null
          host_id: string | null
          id: string
          is_public: boolean
          join_code: string | null
          last_activity_at: string
          last_idle_nudge_at: string | null
          name: string
          owner_id: string
          phase: string
          phase_started_at: string
          removed_user_ids: string[]
          resource_links: Json
          tb_position: number
          tb_queue: string[]
          teach_back_enabled: boolean
          topic: string | null
          work_minutes: number
        }
        SetofOptions: {
          from: "*"
          to: "study_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_room_links: {
        Args: { p_links: Json; p_room: string }
        Returns: {
          break_minutes: number
          created_at: string
          goal_text: string | null
          host_id: string | null
          id: string
          is_public: boolean
          join_code: string | null
          last_activity_at: string
          last_idle_nudge_at: string | null
          name: string
          owner_id: string
          phase: string
          phase_started_at: string
          removed_user_ids: string[]
          resource_links: Json
          tb_position: number
          tb_queue: string[]
          teach_back_enabled: boolean
          topic: string | null
          work_minutes: number
        }
        SetofOptions: {
          from: "*"
          to: "study_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_room_pattern: {
        Args: { p_break: number; p_room: string; p_work: number }
        Returns: {
          break_minutes: number
          created_at: string
          goal_text: string | null
          host_id: string | null
          id: string
          is_public: boolean
          join_code: string | null
          last_activity_at: string
          last_idle_nudge_at: string | null
          name: string
          owner_id: string
          phase: string
          phase_started_at: string
          removed_user_ids: string[]
          resource_links: Json
          tb_position: number
          tb_queue: string[]
          teach_back_enabled: boolean
          topic: string | null
          work_minutes: number
        }
        SetofOptions: {
          from: "*"
          to: "study_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_teach_back: {
        Args: { p_on: boolean; p_room: string }
        Returns: undefined
      }
      skip_teach_back: { Args: { p_round: string }; Returns: string }
      submit_forum_report: {
        Args: { p_reason: string; p_target_id: string; p_target_type: string }
        Returns: Json
      }
      submit_pvp_turn_action: {
        Args: {
          p_action: string
          p_battle_id: string
          p_correct: boolean
          p_damage?: number
          p_focus_delta?: number
          p_heal?: number
          p_momentum?: number
          p_question?: Json
          p_self_damage?: number
          p_time_spent?: number
          p_turn_number: number
        }
        Returns: Json
      }
      tb_handoff: {
        Args: {
          p_concept: string
          p_from: string
          p_room: string
          p_source: string
          p_suffix: string
        }
        Returns: string
      }
      tb_open_round: {
        Args: { p_room: string; p_trigger_key: string }
        Returns: {
          result: string
          round_id: string
        }[]
      }
      update_pvp_rating: {
        Args: { p_opponent_rating: number; p_won: boolean }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
