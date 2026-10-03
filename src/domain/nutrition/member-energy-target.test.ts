import { describe, expect, test } from "vitest"
import type { MemberProfileV1 } from "@/domain/household/member-profile"
import { calculateBmi, calculateMemberEnergyTarget } from "./member-energy-target"

const member: MemberProfileV1 = {
  id: "10000000-0000-4000-8000-000000000001",
  memberKind: "adult",
  sortOrder: 1,
  label: null,
  heightCm: "170",
  weightKg: "65",
  ageYears: 30,
  sexForEquation: "male",
  activityLevel: "light",
  goal: "maintain"
}

describe("BMI", () => {
  test("uses exact decimal arithmetic and canonicalizes at 18 decimal places", () => {
    expect(calculateBmi("170", "65")).toEqual({ ok: true, value: "22.491349480968858131" })
  })
  test.each([
    ["0", "65"],
    ["170", "0"],
    ["1.7e2", "65"],
    ["170", "NaN"],
    ["170", "Infinity"],
    ["170.001", "65"],
    ["99.99", "65"]
  ])("rejects %s / %s", (height, weight) => {
    expect(calculateBmi(height, weight)).toMatchObject({ ok: false })
  })
})
describe("energy-target-v1", () => {
  test.each([
    ["maintain", "2155.3125", "711.253125"],
    ["lose", "1939.78125", "640.1278125"],
    ["gain", "2370.84375", "782.3784375"]
  ] as const)("calculates %s for a 33%% main meal", (goal, dailyTargetKcal, mealTargetKcal) => {
    expect(calculateMemberEnergyTarget({ ...member, goal }, 33)).toEqual({
      version: "energy-target-v1",
      status: "applied",
      memberId: member.id,
      bmi: "22.491349480968858131",
      bmrKcal: "1567.5",
      tdeeKcal: "2155.3125",
      dailyTargetKcal,
      mealTargetKcal
    })
  })
  test.each([
    ["sedentary", "1681.8"],
    ["light", "1927.0625"],
    ["moderate", "2172.325"],
    ["active", "2417.5875"],
    ["very_active", "2662.85"]
  ] as const)("uses the female equation and %s activity", (activityLevel, tdeeKcal) => {
    expect(
      calculateMemberEnergyTarget({ ...member, sexForEquation: "female", activityLevel }, 33)
    ).toMatchObject({ status: "applied", bmrKcal: "1401.5", tdeeKcal })
  })
  test.each(["heightCm", "weightKg", "ageYears", "sexForEquation", "activityLevel"] as const)(
    "does not apply a goal without %s",
    (field) => {
      expect(calculateMemberEnergyTarget({ ...member, [field]: null }, 33)).toMatchObject({
        status: "unapplied",
        reason: "INCOMPLETE_PROFILE"
      })
    }
  )
  test("retains BMI for an otherwise incomplete profile", () => {
    expect(calculateMemberEnergyTarget({ ...member, ageYears: null }, 33)).toMatchObject({
      status: "unapplied",
      bmi: "22.491349480968858131"
    })
  })
  test("does not automatically restrict an underweight member", () => {
    expect(
      calculateMemberEnergyTarget({ ...member, weightKg: "45", goal: "lose" }, 33)
    ).toMatchObject({ status: "unapplied", reason: "UNSUPPORTED_WEIGHT_LOSS" })
    expect(
      calculateMemberEnergyTarget({ ...member, weightKg: "45", goal: "maintain" }, 33).status
    ).toBe("applied")
  })
  test.each([19, 51, 33.5, NaN, Infinity])("rejects an invalid meal share %s", (share) => {
    expect(calculateMemberEnergyTarget(member, share)).toMatchObject({
      status: "unapplied",
      reason: "INVALID_ENERGY_ESTIMATE"
    })
  })
  test("does not create a nonpositive BMR for extreme but valid inputs", () => {
    expect(
      calculateMemberEnergyTarget(
        { ...member, heightCm: "100", weightKg: "25", ageYears: 100, sexForEquation: "female" },
        33
      )
    ).toMatchObject({ status: "applied", bmrKcal: "214" })
  })
})
