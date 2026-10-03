export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]
export interface MemberProfileV1 {
  readonly id: string
  readonly memberKind: "adult" | "elderly"
  readonly sortOrder: number
  readonly label: string | null
  readonly heightCm: string | null
  readonly weightKg: string | null
  readonly ageYears: number | null
  readonly sexForEquation: "male" | "female" | null
  readonly activityLevel: ActivityLevel | null
  readonly goal: "maintain" | "gain" | "lose"
}
export interface HouseholdNutritionSetupV1 {
  readonly version: "household-nutrition-v1"
  readonly memberProfiles: readonly MemberProfileV1[]
  readonly plannedMealSharePercent: number
}
