import type { MemberProfileV1, HouseholdNutritionSetupV1 } from "@/domain/household/member-profile"
import { validateMemberProfiles } from "@/domain/household/validate-member-profiles"
import { parseMemberMeasurementInput } from "./member-profile-input"
export interface MemberProfileDraft extends Omit<
  MemberProfileV1,
  "heightCm" | "weightKg" | "ageYears"
> {
  readonly heightInput: string
  readonly weightInput: string
  readonly ageInput: string
}
export function createMemberProfileDraft(
  memberKind: "adult" | "elderly",
  id: string,
  sortOrder: number
): MemberProfileDraft {
  return {
    id,
    memberKind,
    sortOrder,
    label: null,
    heightInput: "",
    weightInput: "",
    ageInput: "",
    sexForEquation: null,
    activityLevel: null,
    goal: "maintain"
  }
}
export function memberProfileFromDraft(draft: MemberProfileDraft): MemberProfileV1 | null {
  const height = parseMemberMeasurementInput(draft.heightInput),
    weight = parseMemberMeasurementInput(draft.weightInput),
    age = draft.ageInput.trim()
  if (!height.ok || !weight.ok || (age !== "" && !/^\d{1,3}$/u.test(age))) return null
  const { heightInput, weightInput, ageInput, ...profile } = draft
  void heightInput
  void weightInput
  void ageInput
  const value = {
    ...profile,
    heightCm: height.value,
    weightKg: weight.value,
    ageYears: age === "" ? null : Number(age)
  }
  const result = validateMemberProfiles(
    [value],
    [{ memberKind: value.memberKind, ageBand: value.memberKind, memberCount: 1 }]
  )
  return result.ok ? result.value[0]! : null
}
function withProfiles(
  state: HouseholdFormState,
  profiles: readonly MemberProfileDraft[]
): HouseholdFormState {
  return {
    ...state,
    memberProfiles: profiles,
    memberCounts: {
      ...state.memberCounts,
      adult: profiles.filter((p) => p.memberKind === "adult").length,
      elderly: profiles.filter((p) => p.memberKind === "elderly").length
    }
  }
}
export function nutritionSetupFromForm(
  state: HouseholdFormState
): { readonly ok: true; readonly value: HouseholdNutritionSetupV1 } | { readonly ok: false } {
  const profiles = state.memberProfiles.map(memberProfileFromDraft),
    share = state.mealEnergyShareInput.trim()
  if (
    profiles.some((p) => p === null) ||
    !/^\d{2}$/u.test(share) ||
    Number(share) < 20 ||
    Number(share) > 50
  )
    return { ok: false }
  const validated = validateMemberProfiles(profiles, memberGroupsFromCounts(state.memberCounts))
  return validated.ok
    ? {
        ok: true,
        value: {
          version: "household-nutrition-v1",
          plannedMealSharePercent: Number(share),
          memberProfiles: validated.value
        }
      }
    : { ok: false }
}
import {
  DEFAULT_ALLERGEN_STRICTNESS,
  type AllergenStrictness
} from "@/domain/household/allergen-strictness"
import type { HouseholdMemberGroup, HouseholdSetup } from "@/domain/household/household"
import {
  HOUSEHOLD_RULE_OPTION_BY_CODE,
  type HouseholdRuleCode
} from "@/domain/household/household-rules"

export const MEMBER_COUNT_KEYS = [
  "adult",
  "child_1_3",
  "child_4_6",
  "child_7_9",
  "child_10_12",
  "child_13_17",
  "elderly"
] as const

export type MemberCountKey = (typeof MEMBER_COUNT_KEYS)[number]
export type MemberCounts = Readonly<Record<MemberCountKey, number>>

export const EMPTY_MEMBER_COUNTS: MemberCounts = Object.freeze({
  adult: 0,
  child_1_3: 0,
  child_4_6: 0,
  child_7_9: 0,
  child_10_12: 0,
  child_13_17: 0,
  elderly: 0
})

export interface HouseholdFormState {
  memberProfiles: readonly MemberProfileDraft[]
  mealEnergyShareInput: string
  allergenStrictness: Readonly<Record<string, AllergenStrictness>>
  budgetInput: string
  hardRuleCodes: readonly HouseholdRuleCode[]
  maxElapsedMinutes: number
  memberCounts: MemberCounts
  preferenceCodes: readonly HouseholdRuleCode[]
  step: 1 | 2 | 3 | 4 | 5
}

export type HouseholdFormAction =
  | { type: "add-member-profile"; profile: MemberProfileDraft }
  | { type: "remove-member-profile"; id: string }
  | {
      type: "update-member-profile"
      id: string
      changes: Partial<Omit<MemberProfileDraft, "id" | "memberKind" | "sortOrder">>
    }
  | { type: "set-meal-energy-share"; value: string }
  | { type: "set-member-count"; key: MemberCountKey; count: number }
  | { type: "set-budget"; value: string }
  | { type: "set-max-elapsed-minutes"; minutes: number }
  | { type: "toggle-rule"; code: HouseholdRuleCode; selected: boolean }
  | { type: "set-allergen-strictness"; code: HouseholdRuleCode; strictness: AllergenStrictness }
  | { type: "go-to-step"; step: HouseholdFormState["step"] }

export const INITIAL_HOUSEHOLD_FORM_STATE: HouseholdFormState = {
  memberProfiles: [],
  mealEnergyShareInput: "33",
  allergenStrictness: {},
  budgetInput: "",
  hardRuleCodes: [],
  maxElapsedMinutes: 30,
  memberCounts: EMPTY_MEMBER_COUNTS,
  preferenceCodes: [],
  step: 1
}

function withoutRule(
  strictness: Readonly<Record<string, AllergenStrictness>>,
  code: HouseholdRuleCode
): Readonly<Record<string, AllergenStrictness>> {
  if (!Object.hasOwn(strictness, code)) return strictness
  const next = { ...strictness }
  delete next[code]
  return next
}

function updateCodes(
  codes: readonly HouseholdRuleCode[],
  code: HouseholdRuleCode,
  selected: boolean
): readonly HouseholdRuleCode[] {
  const next = new Set(codes)
  if (selected) next.add(code)
  else next.delete(code)
  return [...next].toSorted(
    (left, right) =>
      (HOUSEHOLD_RULE_OPTION_BY_CODE.get(left)?.sortOrder ?? 0) -
      (HOUSEHOLD_RULE_OPTION_BY_CODE.get(right)?.sortOrder ?? 0)
  )
}

export function householdFormReducer(
  state: HouseholdFormState,
  action: HouseholdFormAction
): HouseholdFormState {
  switch (action.type) {
    case "add-member-profile":
      return state.memberProfiles.some((p) => p.id === action.profile.id)
        ? state
        : withProfiles(state, [...state.memberProfiles, action.profile])
    case "remove-member-profile":
      return withProfiles(
        state,
        state.memberProfiles.filter((p) => p.id !== action.id)
      )
    case "update-member-profile":
      return withProfiles(
        state,
        state.memberProfiles.map((p) => (p.id === action.id ? { ...p, ...action.changes } : p))
      )
    case "set-meal-energy-share":
      return { ...state, mealEnergyShareInput: action.value }
    case "set-member-count":
      if (action.key === "adult" || action.key === "elderly") return state
      return {
        ...state,
        memberCounts: { ...state.memberCounts, [action.key]: action.count }
      }
    case "set-budget":
      return { ...state, budgetInput: action.value }
    case "set-max-elapsed-minutes":
      return { ...state, maxElapsedMinutes: action.minutes }
    case "toggle-rule": {
      const option = HOUSEHOLD_RULE_OPTION_BY_CODE.get(action.code)
      if (option?.ruleKind === "soft_preference") {
        return {
          ...state,
          preferenceCodes: updateCodes(state.preferenceCodes, action.code, action.selected)
        }
      }
      // Deselecting an allergy drops the answer with it. Leaving it behind would silently reapply
      // a relaxed reach if the same allergy were selected again later.
      const allergenStrictness = action.selected
        ? state.allergenStrictness
        : withoutRule(state.allergenStrictness, action.code)
      return {
        ...state,
        allergenStrictness,
        hardRuleCodes: updateCodes(state.hardRuleCodes, action.code, action.selected)
      }
    }
    case "set-allergen-strictness": {
      const next = { ...state.allergenStrictness }
      if (action.strictness === DEFAULT_ALLERGEN_STRICTNESS) delete next[action.code]
      else next[action.code] = action.strictness
      return { ...state, allergenStrictness: next }
    }
    case "go-to-step":
      return { ...state, step: action.step }
  }
}

export function memberGroupsFromCounts(counts: MemberCounts): readonly HouseholdMemberGroup[] {
  const groups: HouseholdMemberGroup[] = []
  if (counts.adult > 0)
    groups.push({ memberKind: "adult", ageBand: "adult", memberCount: counts.adult })
  for (const ageBand of ["1_3", "4_6", "7_9", "10_12", "13_17"] as const) {
    const count = counts[`child_${ageBand}`]
    if (count > 0) groups.push({ memberKind: "child", ageBand, memberCount: count })
  }
  if (counts.elderly > 0)
    groups.push({ memberKind: "elderly", ageBand: "elderly", memberCount: counts.elderly })
  return groups
}

export function totalMemberCount(counts: MemberCounts): number {
  return MEMBER_COUNT_KEYS.reduce((total, key) => total + counts[key], 0)
}

export function householdFormStateFromSetup(
  household: HouseholdSetup,
  idFactory: () => string = () => crypto.randomUUID()
): HouseholdFormState {
  const memberCounts: Record<MemberCountKey, number> = { ...EMPTY_MEMBER_COUNTS }
  for (const group of household.memberGroups) {
    const key: MemberCountKey =
      group.memberKind === "child" ? `child_${group.ageBand}` : group.memberKind
    memberCounts[key] = group.memberCount
  }
  const profiles: MemberProfileDraft[] = household.nutritionSetup
    ? household.nutritionSetup.memberProfiles.map((p) => {
        const { heightCm, weightKg, ageYears, ...identity } = p
        return {
          ...identity,
          heightInput: heightCm?.replace(".", ",") ?? "",
          weightInput: weightKg?.replace(".", ",") ?? "",
          ageInput: ageYears === null ? "" : String(ageYears)
        }
      })
    : (["adult", "elderly"] as const).flatMap((kind) =>
        Array.from({ length: memberCounts[kind] }, (_, i) =>
          createMemberProfileDraft(kind, idFactory(), i + 1)
        )
      )
  const hardRuleCodes: HouseholdRuleCode[] = []
  const preferenceCodes: HouseholdRuleCode[] = []
  for (const rawCode of household.ruleCodes) {
    const code = rawCode as HouseholdRuleCode
    const option = HOUSEHOLD_RULE_OPTION_BY_CODE.get(code)
    if (option?.ruleKind === "soft_preference") preferenceCodes.push(code)
    else if (option !== undefined) hardRuleCodes.push(code)
  }
  return {
    memberProfiles: profiles,
    mealEnergyShareInput: String(household.nutritionSetup?.plannedMealSharePercent ?? 33),
    allergenStrictness: { ...household.allergenStrictness },
    budgetInput: household.weeklyPlanBudgetVnd.toLocaleString("vi-VN"),
    hardRuleCodes,
    maxElapsedMinutes: household.maxElapsedMinutes,
    memberCounts,
    preferenceCodes,
    step: 1
  }
}
