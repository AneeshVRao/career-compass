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
      events: {
        Row: {
          company: string
          contacts: Json
          created_at: string
          ctc: string | null
          end_at: string | null
          id: string
          link: string | null
          location: string | null
          mode: Database["public"]["Enums"]["event_mode"]
          outcome_notes: string | null
          prep_notes: string | null
          priority: Database["public"]["Enums"]["event_priority"]
          reminder_sent: boolean
          reminder_sent_at: string | null
          resume_version: string | null
          role: string | null
          round: string | null
          start_at: string
          status: Database["public"]["Enums"]["event_status"]
          type: Database["public"]["Enums"]["event_type"]
          updated_at: string
        }
        Insert: {
          company: string
          contacts?: Json
          created_at?: string
          ctc?: string | null
          end_at?: string | null
          id?: string
          link?: string | null
          location?: string | null
          mode?: Database["public"]["Enums"]["event_mode"]
          outcome_notes?: string | null
          prep_notes?: string | null
          priority?: Database["public"]["Enums"]["event_priority"]
          reminder_sent?: boolean
          reminder_sent_at?: string | null
          resume_version?: string | null
          role?: string | null
          round?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["event_status"]
          type: Database["public"]["Enums"]["event_type"]
          updated_at?: string
        }
        Update: {
          company?: string
          contacts?: Json
          created_at?: string
          ctc?: string | null
          end_at?: string | null
          id?: string
          link?: string | null
          location?: string | null
          mode?: Database["public"]["Enums"]["event_mode"]
          outcome_notes?: string | null
          prep_notes?: string | null
          priority?: Database["public"]["Enums"]["event_priority"]
          reminder_sent?: boolean
          reminder_sent_at?: string | null
          resume_version?: string | null
          role?: string | null
          round?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          type?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          from_email: string
          id: string
          reminder_email: string
          reminders_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_email?: string
          id?: string
          reminder_email?: string
          reminders_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_email?: string
          id?: string
          reminder_email?: string
          reminders_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      event_mode: "ONLINE" | "OFFLINE" | "HYBRID"
      event_priority: "LOW" | "MEDIUM" | "HIGH"
      event_status:
        | "UPCOMING"
        | "PPT_DONE"
        | "OT_SCHEDULED"
        | "OT_CLEARED"
        | "INTERVIEW_R1"
        | "INTERVIEW_R2"
        | "HR"
        | "OFFER"
        | "REJECTED"
        | "GHOSTED"
      event_type: "PPT" | "OT_ONLINE" | "OT_OFFLINE" | "INTERVIEW"
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
      event_mode: ["ONLINE", "OFFLINE", "HYBRID"],
      event_priority: ["LOW", "MEDIUM", "HIGH"],
      event_status: [
        "UPCOMING",
        "PPT_DONE",
        "OT_SCHEDULED",
        "OT_CLEARED",
        "INTERVIEW_R1",
        "INTERVIEW_R2",
        "HR",
        "OFFER",
        "REJECTED",
        "GHOSTED",
      ],
      event_type: ["PPT", "OT_ONLINE", "OT_OFFLINE", "INTERVIEW"],
    },
  },
} as const
