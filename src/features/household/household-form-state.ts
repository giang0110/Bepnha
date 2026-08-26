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
  budgetInput: string
  hardRuleCodes: readonly HouseholdRuleCode[]
  maxElapsedMinutes: number
  memberCounts: MemberCounts
  preferenceCodes: readonly HouseholdRuleCode[]
  step: 1 | 2 | 3 | 4 | 5
}

export type HouseholdFormAction =
  | { type: "set-member-count"; key: MemberCountKey; count: number }
  | { type: "set-budget"; value: string }
  | { type: "set-max-elapsed-minutes"; minutes: number }
  | { type: "toggle-rule"; code: HouseholdRuleCode; selected: boolean }
  | { type: "go-to-step"; step: HouseholdFormState["step"] }

export const INITIAL_HOUSEHOLD_FORM_STATE: HouseholdFormState = {
  budgetInput: "",
  hardRuleCodes: [],
  maxElapsedMinutes: 30,
  memberCounts: EMPTY_MEMBER_COUNTS,
  preferenceCodes: [],
  step: 1
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
    case "set-member-count":
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
      return {
        ...state,
        hardRuleCodes: updateCodes(state.hardRuleCodes, action.code, action.selected)
      }
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

export function householdFormStateFromSetup(household: HouseholdSetup): HouseholdFormState {
  const memberCounts: Record<MemberCountKey, number> = { ...EMPTY_MEMBER_COUNTS }
  for (const group of household.memberGroups) {
    const key: MemberCountKey =
      group.memberKind === "child" ? `child_${group.ageBand}` : group.memberKind
    memberCounts[key] = group.memberCount
  }
  const hardRuleCodes: HouseholdRuleCode[] = []
  const preferenceCodes: HouseholdRuleCode[] = []
  for (const rawCode of household.ruleCodes) {
    const code = rawCode as HouseholdRuleCode
    const option = HOUSEHOLD_RULE_OPTION_BY_CODE.get(code)
    if (option?.ruleKind === "soft_preference") preferenceCodes.push(code)
    else if (option !== undefined) hardRuleCodes.push(code)
  }
  return {
    budgetInput: household.weeklyPlanBudgetVnd.toLocaleString("vi-VN"),
    hardRuleCodes,
    maxElapsedMinutes: household.maxElapsedMinutes,
    memberCounts,
    preferenceCodes,
    step: 1
  }
}
