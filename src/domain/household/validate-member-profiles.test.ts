import { describe, expect, test } from "vitest"

import type { MemberProfileV1 } from "./member-profile"
import { validateMemberProfiles } from "./validate-member-profiles"

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
const groups = [{ memberKind: "adult", ageBand: "adult", memberCount: 1 }] as const

describe("validateMemberProfiles", () => {
  test("canonicalizes measurements and optional label without changing identity", () => {
    expect(
      validateMemberProfiles(
        [{ ...member, heightCm: "170.00", weightKg: "65.50", label: "  Ba  " }],
        groups
      )
    ).toEqual({ ok: true, value: [{ ...member, weightKg: "65.5", label: "Ba" }] })
  })
  test("allows partial profiles", () => {
    expect(
      validateMemberProfiles(
        [
          {
            ...member,
            heightCm: null,
            weightKg: null,
            ageYears: null,
            sexForEquation: null,
            activityLevel: null
          }
        ],
        groups
      ).ok
    ).toBe(true)
  })
  test.each([
    { heightCm: "100", weightKg: "25", ageYears: 18 },
    { heightCm: "250", weightKg: "350", ageYears: 100 }
  ])("accepts measurement boundary %j", (fields) => {
    expect(validateMemberProfiles([{ ...member, ...fields }], groups).ok).toBe(true)
  })
  test.each([
    ["heightCm", "99.99"],
    ["heightCm", "250.01"],
    ["heightCm", "170.001"],
    ["heightCm", "170,5"],
    ["heightCm", "1.7e2"],
    ["heightCm", "NaN"],
    ["heightCm", "Infinity"],
    ["heightCm", 170],
    ["weightKg", "24.99"],
    ["weightKg", "350.01"],
    ["weightKg", "65.001"],
    ["weightKg", "-65"],
    ["ageYears", 17],
    ["ageYears", 101],
    ["ageYears", 30.5],
    ["ageYears", NaN],
    ["sexForEquation", "unknown"],
    ["activityLevel", "unknown"],
    ["goal", "other"],
    ["id", "not-a-uuid"],
    ["sortOrder", 0],
    ["sortOrder", 1.5],
    ["label", "x".repeat(41)],
    ["memberKind", "child"]
  ])("rejects invalid %s=%s with a field path", (field, value) => {
    const result = validateMemberProfiles([{ ...member, [field]: value }], groups)
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_MEMBER_PROFILE" } })
    if (!result.ok) expect(result.error.path).toContain(field)
  })
  test("rejects duplicate identity regardless of row order", () => {
    expect(
      validateMemberProfiles(
        [member, { ...member, sortOrder: 2 }],
        [{ ...groups[0], memberCount: 2 }]
      )
    ).toMatchObject({ ok: false, error: { code: "DUPLICATE_MEMBER_PROFILE_ID" } })
  })
  test("rejects duplicate order within a kind", () => {
    expect(
      validateMemberProfiles(
        [member, { ...member, id: "10000000-0000-4000-8000-000000000002" }],
        [{ ...groups[0], memberCount: 2 }]
      )
    ).toMatchObject({ ok: false, error: { code: "DUPLICATE_MEMBER_PROFILE_ORDER" } })
  })
  test("rejects missing adult and misplaced elderly profiles", () => {
    expect(validateMemberProfiles([], groups)).toMatchObject({
      ok: false,
      error: { code: "MEMBER_PROFILE_COUNT_MISMATCH" }
    })
    expect(validateMemberProfiles([{ ...member, memberKind: "elderly" }], groups).ok).toBe(false)
  })
  test("orders profiles deterministically while allowing the same order for different kinds", () => {
    const elderly = {
      ...member,
      id: "10000000-0000-4000-8000-000000000002",
      memberKind: "elderly" as const
    }
    expect(
      validateMemberProfiles(
        [elderly, member],
        [...groups, { memberKind: "elderly", ageBand: "elderly", memberCount: 1 }]
      )
    ).toEqual({ ok: true, value: [member, elderly] })
  })
  test("children require no body profile", () => {
    expect(
      validateMemberProfiles([], [{ memberKind: "child", ageBand: "4_6", memberCount: 2 }])
    ).toEqual({ ok: true, value: [] })
  })
})
