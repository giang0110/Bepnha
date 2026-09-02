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
      admin_audit_log: {
        Row: {
          action: string
          actor_identifier: string | null
          actor_kind: Database["public"]["Enums"]["catalog_actor_kind"]
          actor_user_id: string | null
          after_summary: Json | null
          before_summary: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_identifier?: string | null
          actor_kind: Database["public"]["Enums"]["catalog_actor_kind"]
          actor_user_id?: string | null
          after_summary?: Json | null
          before_summary?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_identifier?: string | null
          actor_kind?: Database["public"]["Enums"]["catalog_actor_kind"]
          actor_user_id?: string | null
          after_summary?: Json | null
          before_summary?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      allergens: {
        Row: {
          code: string
          created_at: string
          id: string
          name_vi: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name_vi: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name_vi?: string
        }
        Relationships: []
      }
      dietary_tags: {
        Row: {
          code: string
          created_at: string
          id: string
          name_vi: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name_vi: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name_vi?: string
        }
        Relationships: []
      }
      food_categories: {
        Row: {
          code: string
          created_at: string
          id: string
          name_vi: string
          parent_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name_vi: string
          parent_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name_vi?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "food_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      food_fact_allergen_assessments: {
        Row: {
          allergen_id: string
          assessment: Database["public"]["Enums"]["allergen_assessment_status"]
          food_fact_version_id: string
          provenance: string
        }
        Insert: {
          allergen_id: string
          assessment: Database["public"]["Enums"]["allergen_assessment_status"]
          food_fact_version_id: string
          provenance: string
        }
        Update: {
          allergen_id?: string
          assessment?: Database["public"]["Enums"]["allergen_assessment_status"]
          food_fact_version_id?: string
          provenance?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_fact_allergen_assessments_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_fact_allergen_assessments_food_fact_version_id_fkey"
            columns: ["food_fact_version_id"]
            isOneToOne: false
            referencedRelation: "food_fact_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      food_fact_dietary_tags: {
        Row: {
          dietary_tag_id: string
          food_fact_version_id: string
        }
        Insert: {
          dietary_tag_id: string
          food_fact_version_id: string
        }
        Update: {
          dietary_tag_id?: string
          food_fact_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_fact_dietary_tags_dietary_tag_id_fkey"
            columns: ["dietary_tag_id"]
            isOneToOne: false
            referencedRelation: "dietary_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_fact_dietary_tags_food_fact_version_id_fkey"
            columns: ["food_fact_version_id"]
            isOneToOne: false
            referencedRelation: "food_fact_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      food_fact_nutrients: {
        Row: {
          amount_per_100g: number
          food_fact_version_id: string
          nutrient_id: string
          provenance: string
        }
        Insert: {
          amount_per_100g: number
          food_fact_version_id: string
          nutrient_id: string
          provenance: string
        }
        Update: {
          amount_per_100g?: number
          food_fact_version_id?: string
          nutrient_id?: string
          provenance?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_fact_nutrients_food_fact_version_id_fkey"
            columns: ["food_fact_version_id"]
            isOneToOne: false
            referencedRelation: "food_fact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_fact_nutrients_nutrient_id_fkey"
            columns: ["nutrient_id"]
            isOneToOne: false
            referencedRelation: "nutrients"
            referencedColumns: ["id"]
          },
        ]
      }
      food_fact_unit_conversions: {
        Row: {
          base_quantity_per_unit: number
          display_step: number
          food_fact_version_id: string
          gross_grams_per_unit: number
          provenance: string
          unit_id: string
        }
        Insert: {
          base_quantity_per_unit: number
          display_step: number
          food_fact_version_id: string
          gross_grams_per_unit: number
          provenance: string
          unit_id: string
        }
        Update: {
          base_quantity_per_unit?: number
          display_step?: number
          food_fact_version_id?: string
          gross_grams_per_unit?: number
          provenance?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_fact_unit_conversions_food_fact_version_id_fkey"
            columns: ["food_fact_version_id"]
            isOneToOne: false
            referencedRelation: "food_fact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_fact_unit_conversions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      food_fact_versions: {
        Row: {
          assessment_completed_at: string | null
          category_id: string
          content_hash: string | null
          created_at: string
          created_by: string
          edible_fraction: number
          food_id: string
          id: string
          nutrition_basis: string
          provenance: string
          publication_status: Database["public"]["Enums"]["catalog_publication_status"]
          published_at: string | null
          revision: number
          updated_at: string
          version_number: number
        }
        Insert: {
          assessment_completed_at?: string | null
          category_id: string
          content_hash?: string | null
          created_at?: string
          created_by: string
          edible_fraction: number
          food_id: string
          id?: string
          nutrition_basis?: string
          provenance: string
          publication_status?: Database["public"]["Enums"]["catalog_publication_status"]
          published_at?: string | null
          revision?: number
          updated_at?: string
          version_number: number
        }
        Update: {
          assessment_completed_at?: string | null
          category_id?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string
          edible_fraction?: number
          food_id?: string
          id?: string
          nutrition_basis?: string
          provenance?: string
          publication_status?: Database["public"]["Enums"]["catalog_publication_status"]
          published_at?: string | null
          revision?: number
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "food_fact_versions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "food_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_fact_versions_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_prices: {
        Row: {
          base_unit_id: string
          food_fact_version_id: string
          food_id: string
          id: string
          observed_at: string
          package_base_quantity: number
          package_price_vnd: number
          package_quantity: number
          package_unit_id: string
          price_book_id: string
          purchase_increment: number
          source_reference: string
        }
        Insert: {
          base_unit_id: string
          food_fact_version_id: string
          food_id: string
          id?: string
          observed_at: string
          package_base_quantity: number
          package_price_vnd: number
          package_quantity: number
          package_unit_id: string
          price_book_id: string
          purchase_increment: number
          source_reference: string
        }
        Update: {
          base_unit_id?: string
          food_fact_version_id?: string
          food_id?: string
          id?: string
          observed_at?: string
          package_base_quantity?: number
          package_price_vnd?: number
          package_quantity?: number
          package_unit_id?: string
          price_book_id?: string
          purchase_increment?: number
          source_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_prices_food_base_unit_fkey"
            columns: ["food_id", "base_unit_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id", "base_unit_id"]
          },
          {
            foreignKeyName: "food_prices_food_fact_fkey"
            columns: ["food_id", "food_fact_version_id"]
            isOneToOne: false
            referencedRelation: "food_fact_versions"
            referencedColumns: ["food_id", "id"]
          },
          {
            foreignKeyName: "food_prices_package_unit_id_fkey"
            columns: ["package_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_prices_price_book_id_fkey"
            columns: ["price_book_id"]
            isOneToOne: false
            referencedRelation: "price_books"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          base_dimension: Database["public"]["Enums"]["catalog_dimension"]
          base_unit_id: string
          code: string
          created_at: string
          current_fact_version_id: string | null
          id: string
          name_vi: string
          retired_at: string | null
          revision: number
          status: Database["public"]["Enums"]["catalog_identity_status"]
          updated_at: string
        }
        Insert: {
          base_dimension: Database["public"]["Enums"]["catalog_dimension"]
          base_unit_id: string
          code: string
          created_at?: string
          current_fact_version_id?: string | null
          id?: string
          name_vi: string
          retired_at?: string | null
          revision?: number
          status?: Database["public"]["Enums"]["catalog_identity_status"]
          updated_at?: string
        }
        Update: {
          base_dimension?: Database["public"]["Enums"]["catalog_dimension"]
          base_unit_id?: string
          code?: string
          created_at?: string
          current_fact_version_id?: string | null
          id?: string
          name_vi?: string
          retired_at?: string | null
          revision?: number
          status?: Database["public"]["Enums"]["catalog_identity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "foods_base_unit_dimension_fkey"
            columns: ["base_unit_id", "base_dimension"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id", "dimension"]
          },
          {
            foreignKeyName: "foods_current_fact_version_fkey"
            columns: ["id", "current_fact_version_id"]
            isOneToOne: true
            referencedRelation: "food_fact_versions"
            referencedColumns: ["food_id", "id"]
          },
        ]
      }
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
      household_rule_catalog_targets: {
        Row: {
          allergen_id: string | null
          category_id: string | null
          created_at: string
          dietary_tag_id: string | null
          mapping_kind: Database["public"]["Enums"]["household_rule_catalog_mapping_kind"]
          rule_code: string
        }
        Insert: {
          allergen_id?: string | null
          category_id?: string | null
          created_at?: string
          dietary_tag_id?: string | null
          mapping_kind: Database["public"]["Enums"]["household_rule_catalog_mapping_kind"]
          rule_code: string
        }
        Update: {
          allergen_id?: string | null
          category_id?: string | null
          created_at?: string
          dietary_tag_id?: string | null
          mapping_kind?: Database["public"]["Enums"]["household_rule_catalog_mapping_kind"]
          rule_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_rule_catalog_targets_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_rule_catalog_targets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "food_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_rule_catalog_targets_dietary_tag_id_fkey"
            columns: ["dietary_tag_id"]
            isOneToOne: false
            referencedRelation: "dietary_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_rule_catalog_targets_rule_code_fkey"
            columns: ["rule_code"]
            isOneToOne: true
            referencedRelation: "household_rule_options"
            referencedColumns: ["code"]
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
          price_region_id: string
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
          price_region_id?: string
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
          price_region_id?: string
          timezone?: string
          updated_at?: string
          version?: number
          weekly_plan_budget_vnd?: number
        }
        Relationships: [
          {
            foreignKeyName: "households_price_region_id_fkey"
            columns: ["price_region_id"]
            isOneToOne: false
            referencedRelation: "price_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_option_recipes: {
        Row: {
          id: string
          meal_option_version_id: string
          meal_role: Database["public"]["Enums"]["meal_option_role"]
          quantity_multiplier: number
          recipe_id: string
          recipe_version_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          meal_option_version_id: string
          meal_role: Database["public"]["Enums"]["meal_option_role"]
          quantity_multiplier: number
          recipe_id: string
          recipe_version_id: string
          sort_order: number
        }
        Update: {
          id?: string
          meal_option_version_id?: string
          meal_role?: Database["public"]["Enums"]["meal_option_role"]
          quantity_multiplier?: number
          recipe_id?: string
          recipe_version_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_option_recipes_meal_option_version_id_fkey"
            columns: ["meal_option_version_id"]
            isOneToOne: false
            referencedRelation: "meal_option_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_option_recipes_recipe_version_fkey"
            columns: ["recipe_id", "recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["recipe_id", "id"]
          },
        ]
      }
      meal_option_version_tags: {
        Row: {
          meal_option_version_id: string
          recipe_tag_id: string
        }
        Insert: {
          meal_option_version_id: string
          recipe_tag_id: string
        }
        Update: {
          meal_option_version_id?: string
          recipe_tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_option_version_tags_meal_option_version_id_fkey"
            columns: ["meal_option_version_id"]
            isOneToOne: false
            referencedRelation: "meal_option_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_option_version_tags_recipe_tag_id_fkey"
            columns: ["recipe_tag_id"]
            isOneToOne: false
            referencedRelation: "recipe_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_option_versions: {
        Row: {
          active_minutes: number
          content_hash: string | null
          created_at: string
          created_by: string
          elapsed_minutes: number
          id: string
          meal_option_id: string
          publication_status: Database["public"]["Enums"]["catalog_publication_status"]
          published_at: string | null
          revision: number
          updated_at: string
          version_number: number
          yield_adult_equivalent: number
        }
        Insert: {
          active_minutes: number
          content_hash?: string | null
          created_at?: string
          created_by: string
          elapsed_minutes: number
          id?: string
          meal_option_id: string
          publication_status?: Database["public"]["Enums"]["catalog_publication_status"]
          published_at?: string | null
          revision?: number
          updated_at?: string
          version_number: number
          yield_adult_equivalent: number
        }
        Update: {
          active_minutes?: number
          content_hash?: string | null
          created_at?: string
          created_by?: string
          elapsed_minutes?: number
          id?: string
          meal_option_id?: string
          publication_status?: Database["public"]["Enums"]["catalog_publication_status"]
          published_at?: string | null
          revision?: number
          updated_at?: string
          version_number?: number
          yield_adult_equivalent?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_option_versions_meal_option_id_fkey"
            columns: ["meal_option_id"]
            isOneToOne: false
            referencedRelation: "meal_options"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_options: {
        Row: {
          code: string
          created_at: string
          current_version_id: string | null
          id: string
          name_vi: string
          retired_at: string | null
          revision: number
          status: Database["public"]["Enums"]["catalog_identity_status"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          current_version_id?: string | null
          id?: string
          name_vi: string
          retired_at?: string | null
          revision?: number
          status?: Database["public"]["Enums"]["catalog_identity_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          current_version_id?: string | null
          id?: string
          name_vi?: string
          retired_at?: string | null
          revision?: number
          status?: Database["public"]["Enums"]["catalog_identity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_options_current_version_fkey"
            columns: ["id", "current_version_id"]
            isOneToOne: false
            referencedRelation: "meal_option_versions"
            referencedColumns: ["meal_option_id", "id"]
          },
        ]
      }
      meal_plan_items: {
        Row: {
          adult_equivalent: number
          calculation_snapshot: Json
          created_at: string
          day_index: number
          id: string
          meal_option_id: string
          meal_option_version_id: string
          meal_plan_revision_id: string
          meal_slot: string
          scale_factor: number
        }
        Insert: {
          adult_equivalent: number
          calculation_snapshot: Json
          created_at?: string
          day_index: number
          id?: string
          meal_option_id: string
          meal_option_version_id: string
          meal_plan_revision_id: string
          meal_slot?: string
          scale_factor: number
        }
        Update: {
          adult_equivalent?: number
          calculation_snapshot?: Json
          created_at?: string
          day_index?: number
          id?: string
          meal_option_id?: string
          meal_option_version_id?: string
          meal_plan_revision_id?: string
          meal_slot?: string
          scale_factor?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_items_meal_plan_revision_id_fkey"
            columns: ["meal_plan_revision_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_items_option_version_fkey"
            columns: ["meal_option_id", "meal_option_version_id"]
            isOneToOne: false
            referencedRelation: "meal_option_versions"
            referencedColumns: ["meal_option_id", "id"]
          },
        ]
      }
      meal_plan_revisions: {
        Row: {
          budget_status: Database["public"]["Enums"]["meal_plan_budget_status"]
          budget_vnd: number
          calculation_date: string
          calculation_fingerprint: string
          calculation_snapshot: Json
          catalog_fingerprint: string
          created_at: string
          engine_version: string
          household_setup_version: number
          id: string
          idempotency_key: string
          input_fingerprint: string
          input_snapshot: Json
          meal_plan_id: string
          overage_vnd: number
          parent_revision_id: string | null
          planner_config_version: string
          portion_config_version: string
          price_freshness_config_version: string
          replaced_day_index: number | null
          revision_kind: Database["public"]["Enums"]["meal_plan_revision_kind"]
          revision_number: number
          sealed_at: string | null
          state: Database["public"]["Enums"]["meal_plan_revision_state"]
          total_estimated_cost_vnd: number
          warnings: Json
        }
        Insert: {
          budget_status: Database["public"]["Enums"]["meal_plan_budget_status"]
          budget_vnd: number
          calculation_date: string
          calculation_fingerprint: string
          calculation_snapshot: Json
          catalog_fingerprint: string
          created_at?: string
          engine_version: string
          household_setup_version: number
          id?: string
          idempotency_key: string
          input_fingerprint: string
          input_snapshot: Json
          meal_plan_id: string
          overage_vnd: number
          parent_revision_id?: string | null
          planner_config_version: string
          portion_config_version: string
          price_freshness_config_version: string
          replaced_day_index?: number | null
          revision_kind: Database["public"]["Enums"]["meal_plan_revision_kind"]
          revision_number: number
          sealed_at?: string | null
          state?: Database["public"]["Enums"]["meal_plan_revision_state"]
          total_estimated_cost_vnd: number
          warnings: Json
        }
        Update: {
          budget_status?: Database["public"]["Enums"]["meal_plan_budget_status"]
          budget_vnd?: number
          calculation_date?: string
          calculation_fingerprint?: string
          calculation_snapshot?: Json
          catalog_fingerprint?: string
          created_at?: string
          engine_version?: string
          household_setup_version?: number
          id?: string
          idempotency_key?: string
          input_fingerprint?: string
          input_snapshot?: Json
          meal_plan_id?: string
          overage_vnd?: number
          parent_revision_id?: string | null
          planner_config_version?: string
          portion_config_version?: string
          price_freshness_config_version?: string
          replaced_day_index?: number | null
          revision_kind?: Database["public"]["Enums"]["meal_plan_revision_kind"]
          revision_number?: number
          sealed_at?: string | null
          state?: Database["public"]["Enums"]["meal_plan_revision_state"]
          total_estimated_cost_vnd?: number
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_revisions_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_revisions_parent_fkey"
            columns: ["meal_plan_id", "parent_revision_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_revisions"
            referencedColumns: ["meal_plan_id", "id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          budget_status:
            | Database["public"]["Enums"]["meal_plan_budget_status"]
            | null
          calculation_fingerprint: string | null
          created_at: string
          current_revision_id: string | null
          household_id: string
          id: string
          status: Database["public"]["Enums"]["meal_plan_status"]
          timezone: string
          total_estimated_cost_vnd: number | null
          updated_at: string
          version: number
          week_start: string
        }
        Insert: {
          budget_status?:
            | Database["public"]["Enums"]["meal_plan_budget_status"]
            | null
          calculation_fingerprint?: string | null
          created_at?: string
          current_revision_id?: string | null
          household_id: string
          id?: string
          status?: Database["public"]["Enums"]["meal_plan_status"]
          timezone: string
          total_estimated_cost_vnd?: number | null
          updated_at?: string
          version?: number
          week_start: string
        }
        Update: {
          budget_status?:
            | Database["public"]["Enums"]["meal_plan_budget_status"]
            | null
          calculation_fingerprint?: string | null
          created_at?: string
          current_revision_id?: string | null
          household_id?: string
          id?: string
          status?: Database["public"]["Enums"]["meal_plan_status"]
          timezone?: string
          total_estimated_cost_vnd?: number | null
          updated_at?: string
          version?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_current_revision_fkey"
            columns: ["id", "current_revision_id"]
            isOneToOne: true
            referencedRelation: "meal_plan_revisions"
            referencedColumns: ["meal_plan_id", "id"]
          },
          {
            foreignKeyName: "meal_plans_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrients: {
        Row: {
          code: string
          created_at: string
          display_precision: number
          id: string
          name_vi: string
          required_for_publication: boolean
          unit_code: string
        }
        Insert: {
          code: string
          created_at?: string
          display_precision: number
          id?: string
          name_vi: string
          required_for_publication?: boolean
          unit_code: string
        }
        Update: {
          code?: string
          created_at?: string
          display_precision?: number
          id?: string
          name_vi?: string
          required_for_publication?: boolean
          unit_code?: string
        }
        Relationships: []
      }
      pantry_items: {
        Row: {
          base_quantity: number
          base_unit_id: string
          created_at: string
          food_fact_version_id: string
          food_id: string
          household_id: string
          id: string
          quantity: number
          unit_id: string
          updated_at: string
          version: number
        }
        Insert: {
          base_quantity: number
          base_unit_id: string
          created_at?: string
          food_fact_version_id: string
          food_id: string
          household_id: string
          id?: string
          quantity: number
          unit_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          base_quantity?: number
          base_unit_id?: string
          created_at?: string
          food_fact_version_id?: string
          food_id?: string
          household_id?: string
          id?: string
          quantity?: number
          unit_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pantry_items_fact_unit_conversion_fkey"
            columns: ["food_fact_version_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "food_fact_unit_conversions"
            referencedColumns: ["food_fact_version_id", "unit_id"]
          },
          {
            foreignKeyName: "pantry_items_food_base_unit_fkey"
            columns: ["food_id", "base_unit_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id", "base_unit_id"]
          },
          {
            foreignKeyName: "pantry_items_food_fact_fkey"
            columns: ["food_id", "food_fact_version_id"]
            isOneToOne: false
            referencedRelation: "food_fact_versions"
            referencedColumns: ["food_id", "id"]
          },
          {
            foreignKeyName: "pantry_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      price_books: {
        Row: {
          content_hash: string | null
          created_at: string
          created_by: string
          effective_from: string
          effective_to: string | null
          id: string
          publication_status: Database["public"]["Enums"]["catalog_publication_status"]
          published_at: string | null
          region_id: string
          retired_at: string | null
          revision: number
          updated_at: string
          version_number: number
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          created_by: string
          effective_from: string
          effective_to?: string | null
          id?: string
          publication_status?: Database["public"]["Enums"]["catalog_publication_status"]
          published_at?: string | null
          region_id: string
          retired_at?: string | null
          revision?: number
          updated_at?: string
          version_number: number
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          created_by?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          publication_status?: Database["public"]["Enums"]["catalog_publication_status"]
          published_at?: string | null
          region_id?: string
          retired_at?: string | null
          revision?: number
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_books_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "price_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      price_regions: {
        Row: {
          code: string
          created_at: string
          current_price_book_id: string | null
          id: string
          is_launch_default: boolean
          name_vi: string
        }
        Insert: {
          code: string
          created_at?: string
          current_price_book_id?: string | null
          id?: string
          is_launch_default?: boolean
          name_vi: string
        }
        Update: {
          code?: string
          created_at?: string
          current_price_book_id?: string | null
          id?: string
          is_launch_default?: boolean
          name_vi?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_regions_current_book_fkey"
            columns: ["id", "current_price_book_id"]
            isOneToOne: true
            referencedRelation: "price_books"
            referencedColumns: ["region_id", "id"]
          },
        ]
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
      recipe_ingredients: {
        Row: {
          food_fact_version_id: string
          food_id: string
          id: string
          preparation_note_vi: string | null
          quantity: number
          recipe_version_id: string
          sort_order: number
          unit_id: string
        }
        Insert: {
          food_fact_version_id: string
          food_id: string
          id?: string
          preparation_note_vi?: string | null
          quantity: number
          recipe_version_id: string
          sort_order: number
          unit_id: string
        }
        Update: {
          food_fact_version_id?: string
          food_id?: string
          id?: string
          preparation_note_vi?: string | null
          quantity?: number
          recipe_version_id?: string
          sort_order?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_food_fact_fkey"
            columns: ["food_id", "food_fact_version_id"]
            isOneToOne: false
            referencedRelation: "food_fact_versions"
            referencedColumns: ["food_id", "id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_step_ingredients: {
        Row: {
          recipe_ingredient_id: string
          recipe_step_id: string
          recipe_version_id: string
          reference_order: number
        }
        Insert: {
          recipe_ingredient_id: string
          recipe_step_id: string
          recipe_version_id: string
          reference_order: number
        }
        Update: {
          recipe_ingredient_id?: string
          recipe_step_id?: string
          recipe_version_id?: string
          reference_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_step_ingredients_ingredient_fkey"
            columns: ["recipe_version_id", "recipe_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["recipe_version_id", "id"]
          },
          {
            foreignKeyName: "recipe_step_ingredients_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_step_ingredients_step_fkey"
            columns: ["recipe_version_id", "recipe_step_id"]
            isOneToOne: false
            referencedRelation: "recipe_steps"
            referencedColumns: ["recipe_version_id", "id"]
          },
        ]
      }
      recipe_steps: {
        Row: {
          id: string
          instruction_vi: string
          recipe_version_id: string
          sort_order: number
          timer_minutes: number | null
        }
        Insert: {
          id?: string
          instruction_vi: string
          recipe_version_id: string
          sort_order: number
          timer_minutes?: number | null
        }
        Update: {
          id?: string
          instruction_vi?: string
          recipe_version_id?: string
          sort_order?: number
          timer_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_steps_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_tags: {
        Row: {
          code: string
          created_at: string
          id: string
          name_vi: string
          tag_kind: Database["public"]["Enums"]["recipe_tag_kind"]
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name_vi: string
          tag_kind: Database["public"]["Enums"]["recipe_tag_kind"]
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name_vi?: string
          tag_kind?: Database["public"]["Enums"]["recipe_tag_kind"]
        }
        Relationships: []
      }
      recipe_version_tags: {
        Row: {
          recipe_tag_id: string
          recipe_version_id: string
        }
        Insert: {
          recipe_tag_id: string
          recipe_version_id: string
        }
        Update: {
          recipe_tag_id?: string
          recipe_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_version_tags_recipe_tag_id_fkey"
            columns: ["recipe_tag_id"]
            isOneToOne: false
            referencedRelation: "recipe_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_version_tags_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_versions: {
        Row: {
          active_minutes: number
          content_hash: string | null
          created_at: string
          created_by: string
          elapsed_minutes: number
          id: string
          publication_status: Database["public"]["Enums"]["catalog_publication_status"]
          published_at: string | null
          recipe_id: string
          revision: number
          updated_at: string
          version_number: number
          yield_adult_equivalent: number
        }
        Insert: {
          active_minutes: number
          content_hash?: string | null
          created_at?: string
          created_by: string
          elapsed_minutes: number
          id?: string
          publication_status?: Database["public"]["Enums"]["catalog_publication_status"]
          published_at?: string | null
          recipe_id: string
          revision?: number
          updated_at?: string
          version_number: number
          yield_adult_equivalent: number
        }
        Update: {
          active_minutes?: number
          content_hash?: string | null
          created_at?: string
          created_by?: string
          elapsed_minutes?: number
          id?: string
          publication_status?: Database["public"]["Enums"]["catalog_publication_status"]
          published_at?: string | null
          recipe_id?: string
          revision?: number
          updated_at?: string
          version_number?: number
          yield_adult_equivalent?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_versions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          code: string
          created_at: string
          current_version_id: string | null
          id: string
          name_vi: string
          retired_at: string | null
          revision: number
          status: Database["public"]["Enums"]["catalog_identity_status"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          current_version_id?: string | null
          id?: string
          name_vi: string
          retired_at?: string | null
          revision?: number
          status?: Database["public"]["Enums"]["catalog_identity_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          current_version_id?: string | null
          id?: string
          name_vi?: string
          retired_at?: string | null
          revision?: number
          status?: Database["public"]["Enums"]["catalog_identity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_current_version_fkey"
            columns: ["id", "current_version_id"]
            isOneToOne: true
            referencedRelation: "recipe_versions"
            referencedColumns: ["recipe_id", "id"]
          },
        ]
      }
      shopping_item_check_states: {
        Row: {
          checked_at: string
          shopping_list_item_id: string
        }
        Insert: {
          checked_at: string
          shopping_list_item_id: string
        }
        Update: {
          checked_at?: string
          shopping_list_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_item_check_states_shopping_list_item_id_fkey"
            columns: ["shopping_list_item_id"]
            isOneToOne: true
            referencedRelation: "shopping_list_items"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_item_sources: {
        Row: {
          base_unit_id: string
          created_at: string
          food_fact_version_id: string
          food_id: string
          meal_option_recipe_id: string
          meal_plan_item_id: string
          meal_plan_revision_id: string
          recipe_ingredient_id: string
          recipe_version_id: string
          required_base_quantity: string
          shopping_list_id: string
          shopping_list_item_id: string
        }
        Insert: {
          base_unit_id: string
          created_at?: string
          food_fact_version_id: string
          food_id: string
          meal_option_recipe_id: string
          meal_plan_item_id: string
          meal_plan_revision_id: string
          recipe_ingredient_id: string
          recipe_version_id: string
          required_base_quantity: string
          shopping_list_id: string
          shopping_list_item_id: string
        }
        Update: {
          base_unit_id?: string
          created_at?: string
          food_fact_version_id?: string
          food_id?: string
          meal_option_recipe_id?: string
          meal_plan_item_id?: string
          meal_plan_revision_id?: string
          recipe_ingredient_id?: string
          recipe_version_id?: string
          required_base_quantity?: string
          shopping_list_id?: string
          shopping_list_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_item_sources_meal_option_recipe_id_fkey"
            columns: ["meal_option_recipe_id"]
            isOneToOne: false
            referencedRelation: "meal_option_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_sources_food_base_unit_fkey"
            columns: ["food_id", "base_unit_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id", "base_unit_id"]
          },
          {
            foreignKeyName: "shopping_sources_food_fact_fkey"
            columns: ["food_id", "food_fact_version_id"]
            isOneToOne: false
            referencedRelation: "food_fact_versions"
            referencedColumns: ["food_id", "id"]
          },
          {
            foreignKeyName: "shopping_sources_item_fkey"
            columns: ["shopping_list_id", "shopping_list_item_id"]
            isOneToOne: false
            referencedRelation: "shopping_list_items"
            referencedColumns: ["shopping_list_id", "id"]
          },
          {
            foreignKeyName: "shopping_sources_list_context_fkey"
            columns: ["shopping_list_id", "meal_plan_revision_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id", "meal_plan_revision_id"]
          },
          {
            foreignKeyName: "shopping_sources_plan_item_fkey"
            columns: ["meal_plan_revision_id", "meal_plan_item_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_items"
            referencedColumns: ["meal_plan_revision_id", "id"]
          },
          {
            foreignKeyName: "shopping_sources_recipe_ingredient_fkey"
            columns: ["recipe_version_id", "recipe_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["recipe_version_id", "id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          base_unit_id: string
          created_at: string
          food_id: string
          food_price_id: string
          freshness: string
          grocery_category_code: string
          id: string
          leftover_base_quantity: string
          line_cost_vnd: number
          meal_plan_revision_id: string
          observed_at: string
          package_base_quantity: string
          package_price_vnd: number
          price_book_id: string
          price_food_fact_version_id: string
          purchase_base_quantity: string
          purchase_increment: string
          purchase_package_count: string
          required_base_quantity: string
          shopping_list_id: string
        }
        Insert: {
          base_unit_id: string
          created_at?: string
          food_id: string
          food_price_id: string
          freshness: string
          grocery_category_code: string
          id?: string
          leftover_base_quantity: string
          line_cost_vnd: number
          meal_plan_revision_id: string
          observed_at: string
          package_base_quantity: string
          package_price_vnd: number
          price_book_id: string
          price_food_fact_version_id: string
          purchase_base_quantity: string
          purchase_increment: string
          purchase_package_count: string
          required_base_quantity: string
          shopping_list_id: string
        }
        Update: {
          base_unit_id?: string
          created_at?: string
          food_id?: string
          food_price_id?: string
          freshness?: string
          grocery_category_code?: string
          id?: string
          leftover_base_quantity?: string
          line_cost_vnd?: number
          meal_plan_revision_id?: string
          observed_at?: string
          package_base_quantity?: string
          package_price_vnd?: number
          price_book_id?: string
          price_food_fact_version_id?: string
          purchase_base_quantity?: string
          purchase_increment?: string
          purchase_package_count?: string
          required_base_quantity?: string
          shopping_list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_food_base_unit_fkey"
            columns: ["food_id", "base_unit_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id", "base_unit_id"]
          },
          {
            foreignKeyName: "shopping_list_items_list_context_fkey"
            columns: ["shopping_list_id", "meal_plan_revision_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id", "meal_plan_revision_id"]
          },
          {
            foreignKeyName: "shopping_list_items_price_fact_fkey"
            columns: ["food_id", "price_food_fact_version_id"]
            isOneToOne: false
            referencedRelation: "food_fact_versions"
            referencedColumns: ["food_id", "id"]
          },
          {
            foreignKeyName: "shopping_list_items_price_fkey"
            columns: ["price_book_id", "food_price_id"]
            isOneToOne: false
            referencedRelation: "food_prices"
            referencedColumns: ["price_book_id", "id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          calculation_fingerprint: string
          created_at: string
          estimated_purchase_cost_vnd: number
          grocery_category_config_version: string
          id: string
          meal_plan_id: string
          meal_plan_revision_id: string
          snapshot_version: string
          warnings: Json
        }
        Insert: {
          calculation_fingerprint: string
          created_at?: string
          estimated_purchase_cost_vnd: number
          grocery_category_config_version: string
          id?: string
          meal_plan_id: string
          meal_plan_revision_id: string
          snapshot_version: string
          warnings: Json
        }
        Update: {
          calculation_fingerprint?: string
          created_at?: string
          estimated_purchase_cost_vnd?: number
          grocery_category_config_version?: string
          id?: string
          meal_plan_id?: string
          meal_plan_revision_id?: string
          snapshot_version?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_revision_fkey"
            columns: ["meal_plan_id", "meal_plan_revision_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_revisions"
            referencedColumns: ["meal_plan_id", "id"]
          },
        ]
      }
      units: {
        Row: {
          code: string
          created_at: string
          dimension: Database["public"]["Enums"]["catalog_dimension"]
          id: string
          name_vi: string
          to_dimension_base: number
        }
        Insert: {
          code: string
          created_at?: string
          dimension: Database["public"]["Enums"]["catalog_dimension"]
          id?: string
          name_vi: string
          to_dimension_base: number
        }
        Update: {
          code?: string
          created_at?: string
          dimension?: Database["public"]["Enums"]["catalog_dimension"]
          id?: string
          name_vi?: string
          to_dimension_base?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_pantry_item: {
        Args: { p_expected_version: number; p_pantry_item_id: string }
        Returns: string
      }
      get_catalog_aggregate_for_publication: {
        Args: { p_aggregate_id: string; p_aggregate_type: string }
        Returns: Json
      }
      get_current_price_book: { Args: { p_region_id: string }; Returns: Json }
      get_meal_option_aggregate_for_publication: {
        Args: { p_meal_option_version_id: string }
        Returns: Json
      }
      get_pantry: {
        Args: { p_household_id: string }
        Returns: {
          base_quantity: number
          base_unit_id: string
          created_at: string
          food_fact_version_id: string
          food_id: string
          household_id: string
          id: string
          quantity: number
          unit_id: string
          updated_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "pantry_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_plan_replacement_input: { Args: { p_plan_id: string }; Returns: Json }
      get_planner_generation_input: {
        Args: {
          p_calculation_date: string
          p_household_id: string
          p_week_start: string
        }
        Returns: Json
      }
      get_published_meal_option_calculation_input: {
        Args: { p_meal_option_version_id: string }
        Returns: Json
      }
      get_published_recipe_calculation_input: {
        Args: { p_price_book_id: string; p_recipe_version_id: string }
        Returns: Json
      }
      get_shopping_list: {
        Args: { p_plan_id: string; p_revision_id?: string }
        Returns: Json
      }
      persist_meal_plan_revision: {
        Args: {
          p_actor_user_id: string
          p_expected_current_revision_id: string
          p_expected_plan_version: number
          p_household_id: string
          p_idempotency_key: string
          p_items: Json
          p_revision: Json
          p_week_start: string
        }
        Returns: Json
      }
      publish_food_fact_version: {
        Args: {
          p_actor_user_id: string
          p_content_hash: string
          p_expected_revision: number
          p_food_fact_version_id: string
        }
        Returns: {
          assessment_completed_at: string | null
          category_id: string
          content_hash: string | null
          created_at: string
          created_by: string
          edible_fraction: number
          food_id: string
          id: string
          nutrition_basis: string
          provenance: string
          publication_status: Database["public"]["Enums"]["catalog_publication_status"]
          published_at: string | null
          revision: number
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "food_fact_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_meal_option_version: {
        Args: {
          p_actor_user_id: string
          p_content_hash: string
          p_expected_revision: number
          p_meal_option_version_id: string
        }
        Returns: {
          active_minutes: number
          content_hash: string | null
          created_at: string
          created_by: string
          elapsed_minutes: number
          id: string
          meal_option_id: string
          publication_status: Database["public"]["Enums"]["catalog_publication_status"]
          published_at: string | null
          revision: number
          updated_at: string
          version_number: number
          yield_adult_equivalent: number
        }
        SetofOptions: {
          from: "*"
          to: "meal_option_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_price_book: {
        Args: {
          p_actor_user_id: string
          p_content_hash: string
          p_expected_revision: number
          p_price_book_id: string
        }
        Returns: {
          content_hash: string | null
          created_at: string
          created_by: string
          effective_from: string
          effective_to: string | null
          id: string
          publication_status: Database["public"]["Enums"]["catalog_publication_status"]
          published_at: string | null
          region_id: string
          retired_at: string | null
          revision: number
          updated_at: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "price_books"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_recipe_version: {
        Args: {
          p_actor_user_id: string
          p_content_hash: string
          p_expected_revision: number
          p_recipe_version_id: string
        }
        Returns: {
          active_minutes: number
          content_hash: string | null
          created_at: string
          created_by: string
          elapsed_minutes: number
          id: string
          publication_status: Database["public"]["Enums"]["catalog_publication_status"]
          published_at: string | null
          recipe_id: string
          revision: number
          updated_at: string
          version_number: number
          yield_adult_equivalent: number
        }
        SetofOptions: {
          from: "*"
          to: "recipe_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      retire_catalog_identity: {
        Args: {
          p_actor_user_id: string
          p_entity_id: string
          p_entity_type: string
          p_expected_revision: number
        }
        Returns: Json
      }
      retire_meal_option: {
        Args: {
          p_actor_user_id: string
          p_expected_revision: number
          p_meal_option_id: string
        }
        Returns: {
          code: string
          created_at: string
          current_version_id: string | null
          id: string
          name_vi: string
          retired_at: string | null
          revision: number
          status: Database["public"]["Enums"]["catalog_identity_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "meal_options"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
          price_region_id: string
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
      set_shopping_item_checked: {
        Args: { p_checked: boolean; p_shopping_list_item_id: string }
        Returns: Json
      }
      upsert_pantry_item: {
        Args: {
          p_expected_version: number
          p_food_fact_version_id: string
          p_food_id: string
          p_household_id: string
          p_quantity: number
          p_unit_id: string
        }
        Returns: {
          base_quantity: number
          base_unit_id: string
          created_at: string
          food_fact_version_id: string
          food_id: string
          household_id: string
          id: string
          quantity: number
          unit_id: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "pantry_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      allergen_assessment_status:
        | "absent"
        | "contains"
        | "may_contain"
        | "unknown"
      catalog_actor_kind: "admin_user" | "trusted_operation"
      catalog_dimension: "mass" | "volume" | "count"
      catalog_identity_status: "draft" | "published" | "retired"
      catalog_publication_status: "draft" | "published"
      household_age_band:
        | "adult"
        | "1_3"
        | "4_6"
        | "7_9"
        | "10_12"
        | "13_17"
        | "elderly"
      household_member_kind: "adult" | "child" | "elderly"
      household_rule_catalog_mapping_kind:
        | "allergen"
        | "category"
        | "required_tag"
        | "unsupported"
      household_rule_kind:
        | "allergen_exclusion"
        | "food_exclusion"
        | "soft_preference"
      meal_option_role: "staple" | "main" | "vegetable" | "soup" | "side"
      meal_plan_budget_status: "within" | "over"
      meal_plan_revision_kind: "generation" | "regeneration" | "replacement"
      meal_plan_revision_state: "building" | "ready"
      meal_plan_status: "ready" | "archived"
      recipe_tag_kind: "cooking_style" | "protein_hint" | "dish_role"
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
      allergen_assessment_status: [
        "absent",
        "contains",
        "may_contain",
        "unknown",
      ],
      catalog_actor_kind: ["admin_user", "trusted_operation"],
      catalog_dimension: ["mass", "volume", "count"],
      catalog_identity_status: ["draft", "published", "retired"],
      catalog_publication_status: ["draft", "published"],
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
      household_rule_catalog_mapping_kind: [
        "allergen",
        "category",
        "required_tag",
        "unsupported",
      ],
      household_rule_kind: [
        "allergen_exclusion",
        "food_exclusion",
        "soft_preference",
      ],
      meal_option_role: ["staple", "main", "vegetable", "soup", "side"],
      meal_plan_budget_status: ["within", "over"],
      meal_plan_revision_kind: ["generation", "regeneration", "replacement"],
      meal_plan_revision_state: ["building", "ready"],
      meal_plan_status: ["ready", "archived"],
      recipe_tag_kind: ["cooking_style", "protein_hint", "dish_role"],
    },
  },
} as const
