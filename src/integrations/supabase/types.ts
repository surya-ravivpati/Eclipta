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
          id: string
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
          id?: string
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
          id?: string
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
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_id: string
          author_name: string
          body: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_id?: string
          author_name?: string
          body?: string
          created_at?: string
          id?: string
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
          resolved_at: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
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
          id: string
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
          id?: string
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
          id?: string
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
      user_profiles: {
        Row: {
          avatar_url: string | null
          avg_completion_time: number | null
          best_streak: number
          created_at: string
          current_streak: number
          equipped_ecliptar: string | null
          id: string
          luna_notes: string | null
          preferred_pace: string
          preferred_style: string
          strong_areas: string[] | null
          total_correct: number
          total_questions: number
          total_sessions: number
          updated_at: string
          user_id: string
          username: string | null
          weak_areas: string[] | null
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          avg_completion_time?: number | null
          best_streak?: number
          created_at?: string
          current_streak?: number
          equipped_ecliptar?: string | null
          id?: string
          luna_notes?: string | null
          preferred_pace?: string
          preferred_style?: string
          strong_areas?: string[] | null
          total_correct?: number
          total_questions?: number
          total_sessions?: number
          updated_at?: string
          user_id: string
          username?: string | null
          weak_areas?: string[] | null
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          avg_completion_time?: number | null
          best_streak?: number
          created_at?: string
          current_streak?: number
          equipped_ecliptar?: string | null
          id?: string
          luna_notes?: string | null
          preferred_pace?: string
          preferred_style?: string
          strong_areas?: string[] | null
          total_correct?: number
          total_questions?: number
          total_sessions?: number
          updated_at?: string
          user_id?: string
          username?: string | null
          weak_areas?: string[] | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_forum_stats: {
        Args: never
        Returns: {
          answers: number
          contributors: number
          threads: number
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
