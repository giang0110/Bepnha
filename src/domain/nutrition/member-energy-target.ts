import type { MemberProfileV1 } from "@/domain/household/member-profile"
import {
  isMemberMeasurement,
  validateMemberProfiles
} from "@/domain/household/validate-member-profiles"
import { ExactDecimal, ROUND_HALF_UP, roundDecimal } from "@/domain/shared/decimal"

export const ENERGY_TARGET_VERSION = "energy-target-v1" as const
export const ACTIVITY_FACTORS = {
  sedentary: "1.2",
  light: "1.375",
  moderate: "1.55",
  active: "1.725",
  very_active: "1.9"
} as const
export const GOAL_FACTORS = { maintain: "1", gain: "1.1", lose: "0.9" } as const
export type BmiResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: { readonly code: "INVALID_MEASUREMENT" } }
export type UnappliedEnergyReason =
  "INCOMPLETE_PROFILE" | "UNSUPPORTED_WEIGHT_LOSS" | "INVALID_ENERGY_ESTIMATE"
export type MemberEnergyEstimate =
  | {
      readonly version: typeof ENERGY_TARGET_VERSION
      readonly status: "applied"
      readonly memberId: string
      readonly bmi: string
      readonly bmrKcal: string
      readonly tdeeKcal: string
      readonly dailyTargetKcal: string
      readonly mealTargetKcal: string
    }
  | {
      readonly version: typeof ENERGY_TARGET_VERSION
      readonly status: "unapplied"
      readonly memberId: string
      readonly bmi: string | null
      readonly reason: UnappliedEnergyReason
    }

export function calculateBmi(heightCm: string, weightKg: string): BmiResult {
  if (!isMemberMeasurement(heightCm, "heightCm") || !isMemberMeasurement(weightKg, "weightKg"))
    return { ok: false, error: { code: "INVALID_MEASUREMENT" } }
  return {
    ok: true,
    value: roundDecimal(
      new ExactDecimal(weightKg).div(new ExactDecimal(heightCm).div(100).pow(2)),
      18,
      ROUND_HALF_UP
    )
  }
}

export function calculateMemberEnergyTarget(
  profile: MemberProfileV1,
  plannedMealSharePercent: number
): MemberEnergyEstimate {
  const unapplied = (
    reason: UnappliedEnergyReason,
    bmi: string | null = null
  ): MemberEnergyEstimate => ({
    version: ENERGY_TARGET_VERSION,
    status: "unapplied",
    memberId: profile.id,
    bmi,
    reason
  })
  const validated = validateMemberProfiles(
    [profile],
    [
      profile.memberKind === "adult"
        ? { memberKind: "adult", ageBand: "adult", memberCount: 1 }
        : { memberKind: "elderly", ageBand: "elderly", memberCount: 1 }
    ]
  )
  if (
    !validated.ok ||
    !Number.isInteger(plannedMealSharePercent) ||
    plannedMealSharePercent < 20 ||
    plannedMealSharePercent > 50
  )
    return unapplied("INVALID_ENERGY_ESTIMATE")
  const bmi =
    profile.heightCm !== null && profile.weightKg !== null
      ? calculateBmi(profile.heightCm, profile.weightKg)
      : null
  const bmiValue = bmi?.ok ? bmi.value : null
  if (
    profile.heightCm === null ||
    profile.weightKg === null ||
    profile.ageYears === null ||
    profile.sexForEquation === null ||
    profile.activityLevel === null
  )
    return unapplied("INCOMPLETE_PROFILE", bmiValue)
  if (bmiValue === null) return unapplied("INVALID_ENERGY_ESTIMATE")
  if (new ExactDecimal(bmiValue).lt("18.5") && profile.goal === "lose")
    return unapplied("UNSUPPORTED_WEIGHT_LOSS", bmiValue)
  const bmr = new ExactDecimal(profile.weightKg)
    .mul(10)
    .plus(new ExactDecimal(profile.heightCm).mul("6.25"))
    .minus(new ExactDecimal(profile.ageYears).mul(5))
    .plus(profile.sexForEquation === "male" ? 5 : -161)
  if (!bmr.isFinite() || !bmr.gt(0)) return unapplied("INVALID_ENERGY_ESTIMATE", bmiValue)
  const bmrKcal = roundDecimal(bmr, 18, ROUND_HALF_UP)
  const tdeeKcal = roundDecimal(
    new ExactDecimal(bmrKcal).mul(ACTIVITY_FACTORS[profile.activityLevel]),
    18,
    ROUND_HALF_UP
  )
  const dailyTargetKcal = roundDecimal(
    new ExactDecimal(tdeeKcal).mul(GOAL_FACTORS[profile.goal]),
    18,
    ROUND_HALF_UP
  )
  const mealTargetKcal = roundDecimal(
    new ExactDecimal(dailyTargetKcal).mul(plannedMealSharePercent).div(100),
    18,
    ROUND_HALF_UP
  )
  return {
    version: ENERGY_TARGET_VERSION,
    status: "applied",
    memberId: profile.id,
    bmi: bmiValue,
    bmrKcal,
    tdeeKcal,
    dailyTargetKcal,
    mealTargetKcal
  }
}
