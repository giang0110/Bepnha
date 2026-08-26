import type { HouseholdMemberGroup } from "@/domain/household/household"
import {
  HOUSEHOLD_RULE_OPTION_BY_CODE,
  type HouseholdRuleCode
} from "@/domain/household/household-rules"

const CHILD_LABELS = {
  "1_3": "trẻ 1–3 tuổi",
  "4_6": "trẻ 4–6 tuổi",
  "7_9": "trẻ 7–9 tuổi",
  "10_12": "trẻ 10–12 tuổi",
  "13_17": "trẻ 13–17 tuổi"
} as const

export function memberGroupLabel(group: HouseholdMemberGroup): string {
  if (group.memberKind === "adult") return `${group.memberCount} người lớn`
  if (group.memberKind === "elderly") return `${group.memberCount} người cao tuổi`
  return `${group.memberCount} ${CHILD_LABELS[group.ageBand]}`
}

export function ruleLabel(code: string): string {
  return HOUSEHOLD_RULE_OPTION_BY_CODE.get(code as HouseholdRuleCode)?.labelVi ?? code
}
