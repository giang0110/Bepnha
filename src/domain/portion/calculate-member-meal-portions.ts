import { calculateAdultEquivalent } from "./calculate-adult-equivalent.js"
import { PORTION_CONFIG_V1 } from "./portion-config.js"
import { validateMemberProfiles } from "../household/validate-member-profiles.js"
import { calculateMemberEnergyTarget } from "../nutrition/member-energy-target.js"
import {
  ExactDecimal,
  parseCanonicalDecimal,
  roundDecimal,
  ROUND_HALF_UP
} from "../shared/decimal.js"
import type { HouseholdNutritionSetupV1 } from "../household/member-profile.js"
import type { UnappliedEnergyReason } from "../nutrition/member-energy-target.js"
import type { PortionMemberGroupInput } from "./calculate-adult-equivalent.js"
export interface MemberMealPortion {
  readonly recipientKey: string
  readonly memberId?: string
  readonly memberKind: "adult" | "child" | "elderly"
  readonly ageBand: string
  readonly label: string | null
  readonly memberCount: number
  readonly coefficientPerMember: string
  readonly totalCoefficient: string
  readonly sharePerMember: string
  readonly mealTargetKcal: string | null
  readonly energyTargetStatus: "applied" | "unapplied"
  readonly unappliedReason:
    UnappliedEnergyReason | "PROFILE_NOT_STATED" | "CHILD_AGE_COEFFICIENT" | null
}
export type MemberMealPortionsResult =
  | {
      readonly ok: true
      readonly value: {
        readonly adultEquivalent: string
        readonly portions: readonly MemberMealPortion[]
      }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code:
          "INVALID_MEMBER_GROUPS" | "INVALID_NUTRITION_SETUP" | "INVALID_STANDARD_SERVING_ENERGY"
      }
    }
export function calculateMemberMealPortions(
  groups: readonly PortionMemberGroupInput[],
  nutritionSetup: HouseholdNutritionSetupV1 | undefined,
  standardServingKcal: string
): MemberMealPortionsResult {
  const energy = parseCanonicalDecimal(standardServingKcal, {
    allowNegative: false,
    allowZero: false
  })
  if (!energy.ok) return { ok: false, error: { code: "INVALID_STANDARD_SERVING_ENERGY" } }
  const members = calculateAdultEquivalent(groups, PORTION_CONFIG_V1)
  if (!members.ok) return { ok: false, error: { code: "INVALID_MEMBER_GROUPS" } }
  const profiles =
    nutritionSetup === undefined
      ? undefined
      : validateMemberProfiles(nutritionSetup.memberProfiles, members.value.memberGroups)
  if (
    nutritionSetup !== undefined &&
    (nutritionSetup.version !== "household-nutrition-v1" ||
      !Number.isInteger(nutritionSetup.plannedMealSharePercent) ||
      nutritionSetup.plannedMealSharePercent < 20 ||
      nutritionSetup.plannedMealSharePercent > 50 ||
      !profiles?.ok)
  )
    return { ok: false, error: { code: "INVALID_NUTRITION_SETUP" } }
  const portions: Omit<MemberMealPortion, "sharePerMember">[] = []
  const canonical = (value: InstanceType<typeof ExactDecimal>) =>
    roundDecimal(value, 18, ROUND_HALF_UP)
  for (const group of members.value.memberGroups) {
    const defaultCoefficient =
      PORTION_CONFIG_V1.coefficients[
        group.memberKind === "child"
          ? (`child_${group.ageBand}` as keyof typeof PORTION_CONFIG_V1.coefficients)
          : group.memberKind
      ]
    if (group.memberKind === "child") {
      portions.push({
        recipientKey: `child:${group.ageBand}`,
        memberKind: "child",
        ageBand: group.ageBand,
        label: null,
        memberCount: group.memberCount,
        coefficientPerMember: defaultCoefficient,
        totalCoefficient: canonical(new ExactDecimal(defaultCoefficient).mul(group.memberCount)),
        mealTargetKcal: null,
        energyTargetStatus: "unapplied",
        unappliedReason: "CHILD_AGE_COEFFICIENT"
      })
      continue
    }
    const matching = profiles?.ok
      ? profiles.value.filter((p) => p.memberKind === group.memberKind)
      : []
    for (let index = 0; index < group.memberCount; index++) {
      const profile = matching[index]
      const estimate =
        profile === undefined
          ? undefined
          : calculateMemberEnergyTarget(profile, nutritionSetup!.plannedMealSharePercent)
      const coefficient =
        estimate?.status === "applied"
          ? canonical(
              ExactDecimal.max(
                "0.5",
                ExactDecimal.min("2", new ExactDecimal(estimate.mealTargetKcal).div(energy.value))
              )
            )
          : defaultCoefficient
      portions.push({
        recipientKey:
          profile === undefined ? `${group.memberKind}:${index + 1}` : `member:${profile.id}`,
        ...(profile === undefined ? {} : { memberId: profile.id }),
        memberKind: group.memberKind,
        ageBand: group.ageBand,
        // The saved allocation must identify the same card even when orders have gaps.
        label:
          profile?.label ??
          `${group.memberKind === "elderly" ? "Người cao tuổi" : "Người lớn"} ${profile?.sortOrder ?? index + 1}`,
        memberCount: 1,
        coefficientPerMember: coefficient,
        totalCoefficient: coefficient,
        mealTargetKcal: estimate?.status === "applied" ? estimate.mealTargetKcal : null,
        energyTargetStatus: estimate?.status ?? "unapplied",
        unappliedReason:
          estimate === undefined
            ? "PROFILE_NOT_STATED"
            : estimate.status === "unapplied"
              ? estimate.reason
              : null
      })
    }
  }
  const total = portions.reduce((sum, p) => sum.plus(p.totalCoefficient), new ExactDecimal(0))
  return {
    ok: true,
    value: {
      adultEquivalent: canonical(total),
      portions: portions.map((p) => ({
        ...p,
        sharePerMember: canonical(new ExactDecimal(p.coefficientPerMember).div(total))
      }))
    }
  }
}
