import { describe, expect, test } from "vitest"

import { normalizeFoodFactLineage } from "@/domain/catalog/normalize-catalog"

const allergens = [
  "peanut",
  "tree_nut",
  "dairy",
  "egg",
  "soy",
  "wheat",
  "fish",
  "crustacean",
  "mollusc",
  "sesame"
] as const

const nutrients = ["energy_kcal", "protein_g", "carbohydrate_g", "fat_g", "fibre_g", "sodium_mg"]

const completeFact = {
  foodId: "food-tofu",
  foodFactVersionId: "fact-tofu-v1",
  edibleFraction: "1",
  allergenAssessments: allergens.map((allergenCode) => ({
    allergenCode,
    status: "absent" as const
  })),
  nutrients: nutrients.map((nutrientCode) => ({ nutrientCode, amountPer100g: "0" })),
  categoryAncestry: ["tofu"],
  dietaryTagCodes: ["vegetarian"]
} as const

describe("normalizeFoodFactLineage", () => {
  test("sorts set-like lineage into canonical order", () => {
    const result = normalizeFoodFactLineage({
      ...completeFact,
      allergenAssessments: [...completeFact.allergenAssessments].reverse(),
      nutrients: [...completeFact.nutrients].reverse()
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value.allergenAssessments.map((item) => item.allergenCode)).toEqual(
      [...allergens].sort()
    )
    expect(result.value.nutrients.map((item) => item.nutrientCode)).toEqual([...nutrients].sort())
  })

  test("rejects duplicate or incomplete allergen lineage", () => {
    expect(
      normalizeFoodFactLineage({
        ...completeFact,
        allergenAssessments: [
          ...completeFact.allergenAssessments,
          completeFact.allergenAssessments[0]!
        ]
      })
    ).toEqual({ ok: false, error: { code: "DUPLICATE_CATALOG_ENTRY" } })
    expect(
      normalizeFoodFactLineage({
        ...completeFact,
        allergenAssessments: completeFact.allergenAssessments.slice(1)
      })
    ).toEqual({ ok: false, error: { code: "UNKNOWN_ALLERGEN_LINEAGE" } })
  })

  test("rejects unknown assessments and missing required nutrients", () => {
    expect(
      normalizeFoodFactLineage({
        ...completeFact,
        allergenAssessments: completeFact.allergenAssessments.map((assessment) =>
          assessment.allergenCode === "soy"
            ? { ...assessment, status: "unknown" as const }
            : assessment
        )
      })
    ).toEqual({ ok: false, error: { code: "UNKNOWN_ALLERGEN_LINEAGE" } })
    expect(
      normalizeFoodFactLineage({
        ...completeFact,
        nutrients: completeFact.nutrients.filter((item) => item.nutrientCode !== "sodium_mg")
      })
    ).toEqual({ ok: false, error: { code: "INCOMPLETE_NUTRITION" } })
  })
})
