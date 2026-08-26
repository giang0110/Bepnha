export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      household_food_rules: {
        Row: {
          created_at: string
          household_id: string
          rule_code: string
        }
        Insert: {
          created_at?: string
          household_id: string
          rule_code: string
        }
        Update: {
          created_at?: string
          household_id?: string
          rule_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_food_rules_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_food_rules_rule_code_fkey"
            columns: ["rule_code"]
            isOneToOne: false
            referencedRelation: "household_rule_options"
            referencedColumns: ["code"]
          },
        ]
      }
      household_member_groups: {
        Row: {
          age_band: Database["public"]["Enums"]["household_age_band"]
          created_at: string
          household_id: string
          id: string
          member_count: number
          member_kind: Database["public"]["Enums"]["household_member_kind"]
          updated_at: string
        }
        Insert: {
          age_band: Database["public"]["Enums"]["household_age_band"]
          created_at?: string
          household_id: string
          id?: string
          member_count: number
          member_kind: Database["public"]["Enums"]["household_member_kind"]
          updated_at?: string
        }
        Update: {
          age_band?: Database["public"]["Enums"]["household_age_band"]
          created_at?: string
          household_id?: string
          id?: string
          member_count?: number
          member_kind?: Database["public"]["Enums"]["household_member_kind"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_member_groups_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_rule_options: {
        Row: {
          code: string
          label_vi: string
          rule_kind: Database["public"]["Enums"]["household_rule_kind"]
          sort_order: number
          target_key: string
        }
        Insert: {
          code: string
          label_vi: string
          rule_kind: Database["public"]["Enums"]["household_rule_kind"]
          sort_order: number
          target_key: string
        }
        Update: {
          code?: string
          label_vi?: string
          rule_kind?: Database["public"]["Enums"]["household_rule_kind"]
          sort_order?: number
          target_key?: string
        }
        Relationships: []
      }
      households: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          max_elapsed_minutes: number
          onboarding_completed_at: string | null
          owner_user_id: string
          timezone: string
          updated_at: string
          version: number
          weekly_plan_budget_vnd: number
        }
        Insert: {
          created_at?: string
          currency_code?: string
          id?: string
          max_elapsed_minutes: number
          onboarding_completed_at?: string | null
          owner_user_id: string
          timezone?: string
          updated_at?: string
          version?: number
          weekly_plan_budget_vnd: number
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          max_elapsed_minutes?: number
          onboarding_completed_at?: string | null
          owner_user_id?: string
          timezone?: string
          updated_at?: string
          version?: number
          weekly_plan_budget_vnd?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          locale: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          locale?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          locale?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      save_household_setup: {
        Args: {
          p_expected_version: number
          p_max_elapsed_minutes: number
          p_member_groups: Json
          p_rule_codes: string[]
          p_weekly_plan_budget_vnd: number
        }
        Returns: {
          created_at: string
          currency_code: string
          id: string
          max_elapsed_minutes: number
          onboarding_completed_at: string | null
          owner_user_id: string
          timezone: string
          updated_at: string
          version: number
          weekly_plan_budget_vnd: number
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      household_age_band:
        | "adult"
        | "1_3"
        | "4_6"
        | "7_9"
        | "10_12"
        | "13_17"
        | "elderly"
      household_member_kind: "adult" | "child" | "elderly"
      household_rule_kind:
        | "allergen_exclusion"
        | "food_exclusion"
        | "soft_preference"
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
      household_age_band: [
        "adult",
        "1_3",
        "4_6",
        "7_9",
        "10_12",
        "13_17",
        "elderly",
      ],
      household_member_kind: ["adult", "child", "elderly"],
      household_rule_kind: [
        "allergen_exclusion",
        "food_exclusion",
        "soft_preference",
      ],
    },
  },
} as const

