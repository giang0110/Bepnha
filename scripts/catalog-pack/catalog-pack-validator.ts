import { parseCanonicalDecimal } from "../../src/domain/shared/decimal.ts"
import { validateCatalogPackValue as validateCatalogPackValueCore } from "./catalog-pack-validator-core.ts"
import type { CatalogPackValidationCoreResult } from "./catalog-pack-validator-core.ts"

export type { CatalogPackValidationCoreResult } from "./catalog-pack-validator-core.ts"

function nutrientAmountMatchesAuthority(value: string): boolean {
  return parseCanonicalDecimal(value, {
    maxScale: 6,
    maxIntegerDigits: 12,
    allowNegative: false
  }).ok
}

export function validateCatalogPackValue(value: unknown): CatalogPackValidationCoreResult {
  const result = validateCatalogPackValueCore(value)
  if (result.pack === null) return result

  const diagnostics = [...result.diagnostics]
  result.pack.foods.forEach((food, foodIndex) => {
    food.fact.nutrients.forEach((nutrient, nutrientIndex) => {
      if (nutrientAmountMatchesAuthority(nutrient.amountPer100g)) return

      const path = `$.foods[${foodIndex}].fact.nutrients[${nutrientIndex}].amountPer100g`
      if (
        diagnostics.some(
          (diagnostic) => diagnostic.code === "INVALID_DECIMAL" && diagnostic.path === path
        )
      ) {
        return
      }

      diagnostics.push({
        severity: "error",
        code: "INVALID_DECIMAL",
        path,
        message: "Nutrient amount must match the authoritative decimal limits"
      })
    })
  })

  return { ...result, diagnostics }
}
