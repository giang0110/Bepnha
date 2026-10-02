import { ExactDecimal, decimalToCanonical } from "@/domain/shared/decimal"
export type MemberMeasurementInputResult =
  { readonly ok: true; readonly value: string | null } | { readonly ok: false }
export function parseMemberMeasurementInput(value: string): MemberMeasurementInputResult {
  const trimmed = value.trim()
  if (trimmed === "") return { ok: true, value: null }
  if (!/^\d{1,3}(?:[.,]\d{1,2})?$/u.test(trimmed)) return { ok: false }
  return { ok: true, value: decimalToCanonical(new ExactDecimal(trimmed.replace(",", "."))) }
}
