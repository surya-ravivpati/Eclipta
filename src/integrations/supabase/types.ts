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
      course_proposals: {
        Row: {
          created_at: string
          creator_reasoning: string
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
          created_at?: string
          creator_reasoning: string
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
          created_at?: string
          creator_reasoning?: string
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
          avg_completion_time: number | null
          best_streak: number
          created_at: string
          current_streak: number
          id: string
          preferred_pace: string
          preferred_style: string
          strong_areas: string[] | null
          total_correct: number
          total_questions: number
          total_sessions: number
          updated_at: string
          user_id: string
          weak_areas: string[] | null
          xp: number
        }
        Insert: {
          avg_completion_time?: number | null
          best_streak?: number
          created_at?: string
          current_streak?: number
          id?: string
          preferred_pace?: string
          preferred_style?: string
          strong_areas?: string[] | null
          total_correct?: number
          total_questions?: number
          total_sessions?: number
          updated_at?: string
          user_id: string
          weak_areas?: string[] | null
          xp?: number
        }
        Update: {
          avg_completion_time?: number | null
          best_streak?: number
          created_at?: string
          current_streak?: number
          id?: string
          preferred_pace?: string
          preferred_style?: string
          strong_areas?: string[] | null
          total_correct?: number
          total_questions?: number
          total_sessions?: number
          updated_at?: string
          user_id?: string
          weak_areas?: string[] | null
          xp?: number
        }
        Relationships: []
      }
    }
    Views: {
      platform_stats: {
        Row: {
          battles: number | null
          ecliptars: number | null
          learners: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
