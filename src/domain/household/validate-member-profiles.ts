import { z } from "zod"

import type { HouseholdMemberGroup } from "./household.js"
import { ACTIVITY_LEVELS, type MemberProfileV1 } from "./member-profile.js"
import { ExactDecimal, decimalToCanonical, parseCanonicalDecimal } from "../shared/decimal.js"

export function isMemberMeasurement(
  value: unknown,
  kind: "heightCm" | "weightKg"
): value is string {
  if (typeof value !== "string") return false
  const parsed = parseCanonicalDecimal(value, {
    maxScale: 2,
    allowNegative: false,
    allowZero: false
  })
  return (
    parsed.ok &&
    parsed.value.gte(kind === "heightCm" ? 100 : 25) &&
    parsed.value.lte(kind === "heightCm" ? 250 : 350)
  )
}

const measurementSchema = (kind: "heightCm" | "weightKg") =>
  z
    .string()
    .refine((value) => isMemberMeasurement(value, kind))
    .transform((value) => decimalToCanonical(new ExactDecimal(value)))
    .nullable()

const memberProfileSchema = z
  .object({
    id: z.uuid().transform((id) => id.toLowerCase()),
    memberKind: z.enum(["adult", "elderly"]),
    sortOrder: z.number().int().min(1).max(2_147_483_647),
    label: z
      .string()
      .trim()
      .max(40)
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    heightCm: measurementSchema("heightCm"),
    weightKg: measurementSchema("weightKg"),
    ageYears: z.number().int().min(18).max(100).nullable(),
    sexForEquation: z.enum(["male", "female"]).nullable(),
    activityLevel: z.enum(ACTIVITY_LEVELS).nullable(),
    goal: z.enum(["maintain", "gain", "lose"])
  })
  .strict()

export type MemberProfilesValidationErrorCode =
  | "INVALID_MEMBER_PROFILE"
  | "DUPLICATE_MEMBER_PROFILE_ID"
  | "DUPLICATE_MEMBER_PROFILE_ORDER"
  | "MEMBER_PROFILE_COUNT_MISMATCH"
export type MemberProfilesValidationResult =
  | { readonly ok: true; readonly value: readonly MemberProfileV1[] }
  | {
      readonly ok: false
      readonly error: { readonly code: MemberProfilesValidationErrorCode; readonly path: string }
    }

export function validateMemberProfiles(
  value: unknown,
  groups: readonly {
    readonly memberKind: HouseholdMemberGroup["memberKind"]
    readonly ageBand: string
    readonly memberCount: number
  }[]
): MemberProfilesValidationResult {
  const parsed = z.array(memberProfileSchema).max(20).safeParse(value)
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.map(String).join(".") ?? ""
    return {
      ok: false,
      error: { code: "INVALID_MEMBER_PROFILE", path: `memberProfiles${path ? `.${path}` : ""}` }
    }
  }
  const ids = new Set<string>()
  const orders = new Set<string>()
  for (const [index, profile] of parsed.data.entries()) {
    if (ids.has(profile.id))
      return {
        ok: false,
        error: { code: "DUPLICATE_MEMBER_PROFILE_ID", path: `memberProfiles.${index}.id` }
      }
    ids.add(profile.id)
    const orderKey = `${profile.memberKind}:${profile.sortOrder}`
    if (orders.has(orderKey))
      return {
        ok: false,
        error: { code: "DUPLICATE_MEMBER_PROFILE_ORDER", path: `memberProfiles.${index}.sortOrder` }
      }
    orders.add(orderKey)
  }
  for (const kind of ["adult", "elderly"] as const) {
    const expected = groups
      .filter((group) => group.memberKind === kind)
      .reduce((count, group) => count + group.memberCount, 0)
    if (parsed.data.filter((profile) => profile.memberKind === kind).length !== expected) {
      return { ok: false, error: { code: "MEMBER_PROFILE_COUNT_MISMATCH", path: "memberProfiles" } }
    }
  }
  return {
    ok: true,
    value: parsed.data.toSorted(
      (left, right) =>
        (left.memberKind === right.memberKind ? 0 : left.memberKind === "adult" ? -1 : 1) ||
        left.sortOrder - right.sortOrder
    )
  }
}
