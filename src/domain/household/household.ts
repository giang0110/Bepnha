import type { AllergenStrictness } from "./allergen-strictness.js"

export const CHILD_AGE_BANDS = ["1_3", "4_6", "7_9", "10_12", "13_17"] as const

export type ChildAgeBand = (typeof CHILD_AGE_BANDS)[number]

export type HouseholdMemberGroup =
  | { memberKind: "adult"; ageBand: "adult"; memberCount: number }
  | { memberKind: "child"; ageBand: ChildAgeBand; memberCount: number }
  | { memberKind: "elderly"; ageBand: "elderly"; memberCount: number }

export type HouseholdRuleKind = "allergen_exclusion" | "food_exclusion" | "soft_preference"

export interface HouseholdSetupInput {
  memberGroups: readonly HouseholdMemberGroup[]
  weeklyPlanBudgetVnd: number
  maxElapsedMinutes: number
  ruleCodes: readonly string[]
  /**
   * How far each allergy rule reaches, keyed by rule code. Only entries that departed from
   * {@link DEFAULT_ALLERGEN_STRICTNESS} need to appear; anything absent is strict.
   */
  allergenStrictness?: Readonly<Record<string, AllergenStrictness>>
}

export interface HouseholdSetup extends HouseholdSetupInput {
  householdId: string
  version: number
  onboardingCompletedAt: string
}
