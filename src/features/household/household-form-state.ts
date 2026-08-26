import type { HouseholdMemberGroup } from "@/domain/household/household"

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
  memberCounts: MemberCounts
  step: 1 | 2 | 3 | 4 | 5
}

export type HouseholdFormAction =
  | { type: "set-member-count"; key: MemberCountKey; count: number }
  | { type: "set-budget"; value: string }
  | { type: "go-to-step"; step: HouseholdFormState["step"] }

export const INITIAL_HOUSEHOLD_FORM_STATE: HouseholdFormState = {
  budgetInput: "",
  memberCounts: EMPTY_MEMBER_COUNTS,
  step: 1
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
