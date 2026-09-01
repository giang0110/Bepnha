import { ExactDecimal, decimalToCanonical, parseCanonicalDecimal } from "@/domain/shared/decimal"

export type PantryDeductionResult =
  | {
      readonly ok: true
      readonly value: {
        readonly deductedBaseQuantity: string
        readonly remainingBaseQuantity: string
      }
    }
  | {
      readonly ok: false
      readonly error: { readonly code: "INVALID_PANTRY_DEDUCTION_QUANTITY" }
    }

export function applyPantryDeduction(
  requiredBaseQuantity: string,
  availableBaseQuantity: string
): PantryDeductionResult {
  const required = parseCanonicalDecimal(requiredBaseQuantity, {
    maxScale: 18,
    maxIntegerDigits: 34,
    allowNegative: false
  })
  const available = parseCanonicalDecimal(availableBaseQuantity, {
    maxScale: 18,
    maxIntegerDigits: 34,
    allowNegative: false
  })

  if (!required.ok || !available.ok) {
    return { ok: false, error: { code: "INVALID_PANTRY_DEDUCTION_QUANTITY" } }
  }

  const deducted = ExactDecimal.min(required.value, available.value)
  const remaining = ExactDecimal.max(required.value.minus(deducted), new ExactDecimal(0))

  return {
    ok: true,
    value: {
      deductedBaseQuantity: decimalToCanonical(deducted),
      remainingBaseQuantity: decimalToCanonical(remaining)
    }
  }
}
