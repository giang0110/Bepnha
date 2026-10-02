import { describe, expect, test } from "vitest"
import type { MemberProfileV1, HouseholdNutritionSetupV1 } from "../household/member-profile"
import { calculateMemberMealPortions } from "./calculate-member-meal-portions"
const groups = [
  { memberKind: "adult", ageBand: "adult", memberCount: 2 },
  { memberKind: "child", ageBand: "4_6", memberCount: 2 }
]
const profile: MemberProfileV1 = {
  id: "10000000-0000-4000-8000-000000000001",
  memberKind: "adult",
  sortOrder: 1,
  label: "Anh",
  heightCm: "170",
  weightKg: "65",
  ageYears: 30,
  sexForEquation: "male",
  activityLevel: "light",
  goal: "lose"
}
const nutrition: HouseholdNutritionSetupV1 = {
  version: "household-nutrition-v1",
  plannedMealSharePercent: 33,
  memberProfiles: [
    profile,
    {
      ...profile,
      id: "10000000-0000-4000-8000-000000000002",
      sortOrder: 2,
      label: "Chị",
      goal: "gain"
    }
  ]
}
describe("member meal portion weights", () => {
  test("mixed goals change individual weights while children retain per-child shares", () => {
    const r = calculateMemberMealPortions(groups, nutrition, "711.253125")
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error.code)
    expect(r.value.adultEquivalent).toBe("3.1")
    expect(r.value.portions.map((p) => p.coefficientPerMember)).toEqual(["0.9", "1.1", "0.55"])
    expect(r.value.portions[2]).toMatchObject({
      memberCount: 2,
      totalCoefficient: "1.1",
      unappliedReason: "CHILD_AGE_COEFFICIENT",
      sharePerMember: "0.177419354838709677"
    })
  })
  test("partial profiles keep explicit age coefficients and a reason", () => {
    const r = calculateMemberMealPortions(
      [{ memberKind: "adult", ageBand: "adult", memberCount: 1 }],
      { ...nutrition, memberProfiles: [{ ...profile, heightCm: null }] },
      "600"
    )
    expect(r.ok).toBe(true)
    if (r.ok)
      expect(r.value.portions[0]).toMatchObject({
        memberId: profile.id,
        coefficientPerMember: "1",
        energyTargetStatus: "unapplied",
        unappliedReason: "INCOMPLETE_PROFILE",
        mealTargetKcal: null
      })
  })
  test("freezes unnamed identities by stable order, including gaps after removal", () => {
    const setup: HouseholdNutritionSetupV1 = {
      ...nutrition,
      memberProfiles: [
        { ...profile, label: null },
        { ...nutrition.memberProfiles[1]!, sortOrder: 3, label: null },
        {
          ...profile,
          id: "10000000-0000-4000-8000-000000000004",
          memberKind: "elderly",
          sortOrder: 4,
          label: null
        }
      ]
    }
    const result = calculateMemberMealPortions(
      [...groups, { memberKind: "elderly", ageBand: "elderly", memberCount: 1 }],
      setup,
      "711.253125"
    )
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value.portions.map((p) => p.label)).toEqual([
      "Người lớn 1",
      "Người lớn 3",
      null,
      "Người cao tuổi 4"
    ])
    expect(result.value.portions.slice(0, 2).map((p) => p.coefficientPerMember)).toEqual([
      "0.9",
      "1.1"
    ])
    expect(nutrition.memberProfiles.map((p) => p.label)).toEqual(["Anh", "Chị"])
  })
  test.each([
    ["3000", "0.5"],
    ["100", "2"]
  ])("clamps with a retained target at standard energy %s", (energy, coefficient) => {
    const r = calculateMemberMealPortions(
      [{ memberKind: "adult", ageBand: "adult", memberCount: 1 }],
      { ...nutrition, memberProfiles: [profile] },
      energy
    )
    expect(r.ok).toBe(true)
    if (r.ok)
      expect(r.value.portions[0]).toMatchObject({
        coefficientPerMember: coefficient,
        mealTargetKcal: "640.1278125",
        energyTargetStatus: "applied"
      })
  })
  test("underweight loss is retained but unapplied", () => {
    const r = calculateMemberMealPortions(
      [{ memberKind: "adult", ageBand: "adult", memberCount: 1 }],
      { ...nutrition, memberProfiles: [{ ...profile, heightCm: "180", weightKg: "50" }] },
      "600"
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.portions[0]?.unappliedReason).toBe("UNSUPPORTED_WEIGHT_LOSS")
  })
  test("legacy count-only members have local keys without invented IDs", () => {
    const r = calculateMemberMealPortions(
      [...groups, { memberKind: "elderly", ageBand: "elderly", memberCount: 1 }],
      undefined,
      "600"
    )
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error.code)
    expect(r.value.adultEquivalent).toBe("3.95")
    expect(r.value.portions.map((p) => p.recipientKey)).toEqual([
      "adult:1",
      "adult:2",
      "child:4_6",
      "elderly:1"
    ])
    expect(r.value.portions[0]).not.toHaveProperty("memberId")
  })
  test.each(["0", "-1", "NaN", "1e3"])("rejects invalid standard serving energy %s", (energy) => {
    expect(calculateMemberMealPortions(groups, nutrition, energy)).toEqual({
      ok: false,
      error: { code: "INVALID_STANDARD_SERVING_ENERGY" }
    })
  })
  test("rejects mismatched profiles and invalid meal share", () => {
    for (const changed of [
      { ...nutrition, memberProfiles: [profile] },
      { ...nutrition, plannedMealSharePercent: 51 }
    ])
      expect(calculateMemberMealPortions(groups, changed, "600")).toEqual({
        ok: false,
        error: { code: "INVALID_NUTRITION_SETUP" }
      })
  })
  test("is invariant to group/profile input order", () => {
    expect(
      calculateMemberMealPortions(
        [...groups].reverse(),
        { ...nutrition, memberProfiles: [...nutrition.memberProfiles].reverse() },
        "711.253125"
      )
    ).toEqual(calculateMemberMealPortions(groups, nutrition, "711.253125"))
  })
})
