import { describe, expect, test } from "vitest"

import { plannerCandidate, plannerInput } from "@/domain/planner/planner-test-fixture"

import { evaluateCatalogReadiness } from "./catalog-readiness"

type Candidate = ReturnType<typeof plannerCandidate>

const proteinGroups = ["poultry", "pork", "seafood"] as const

function candidate(id: string, proteinGroup: string): Candidate {
  const value = plannerCandidate(id)
  return {
    ...value,
    mealOption: {
      ...value.mealOption,
      tags: value.mealOption.tags.map((tag) =>
        tag.kind === "protein_hint" ? { ...tag, code: proteinGroup } : tag
      )
    },
    ingredientLineage: value.ingredientLineage.map((lineage) => ({
      ...lineage,
      categoryAncestry: [proteinGroup]
    }))
  }
}

function diverseCandidates(count: number): Candidate[] {
  return Array.from({ length: count }, (_, index) =>
    candidate(
      `readiness-${String(index).padStart(3, "0")}-v1`,
      proteinGroups[index % proteinGroups.length]!
    )
  )
}

function withBadUnit(value: Candidate): Candidate {
  return {
    ...value,
    mealOption: {
      ...value.mealOption,
      components: value.mealOption.components.map((component, componentIndex) => ({
        ...component,
        recipe: {
          ...component.recipe,
          ingredients: component.recipe.ingredients.map((ingredient, ingredientIndex) =>
            componentIndex === 0 && ingredientIndex === 0
              ? { ...ingredient, conversion: null }
              : ingredient
          )
        }
      }))
    }
  }
}

function withBadAllergen(value: Candidate): Candidate {
  return {
    ...value,
    ingredientLineage: value.ingredientLineage.map((lineage, index) =>
      index === 0
        ? { ...lineage, allergenAssessments: lineage.allergenAssessments.slice(1) }
        : lineage
    )
  }
}

function withBadNutrition(value: Candidate): Candidate {
  return {
    ...value,
    ingredientLineage: value.ingredientLineage.map((lineage, index) =>
      index === 0 ? { ...lineage, nutrients: lineage.nutrients.slice(1) } : lineage
    )
  }
}

function withMissingPrice(value: Candidate): Candidate {
  return { ...value, prices: [] }
}

describe("catalog launch readiness", () => {
  test("requires at least 21 eligible meal options", () => {
    const below = evaluateCatalogReadiness(plannerInput(diverseCandidates(20)), "two-adults")
    const atThreshold = evaluateCatalogReadiness(plannerInput(diverseCandidates(21)), "two-adults")

    expect(below).toMatchObject({
      scenarioCode: "two-adults",
      eligibleMealOptionCount: 20,
      minimumEligibleMealOptionCount: 21,
      proteinCapacityOk: true,
      coverageOk: true,
      ready: false
    })
    expect(below.blockers).toContain("MINIMUM_ELIGIBLE_MEAL_OPTIONS_NOT_MET")
    expect(atThreshold).toMatchObject({
      eligibleMealOptionCount: 21,
      minimumEligibleMealOptionCount: 21,
      proteinCapacityOk: true,
      coverageOk: true,
      ready: true,
      blockers: []
    })
  })

  test("uses authoritative hard filtering before counting launch capacity", () => {
    const input = {
      ...plannerInput(diverseCandidates(21)),
      hardRuleCodes: ["exclude_poultry"] as const
    }
    const result = evaluateCatalogReadiness(input, "exclude-poultry")

    expect(result.eligibleMealOptionCount).toBe(14)
    expect(result.coverageOk).toBe(true)
    expect(result.ready).toBe(false)
    expect(result.blockers).toContain("MINIMUM_ELIGIBLE_MEAL_OPTIONS_NOT_MET")
  })

  test("requires at least three primary protein groups in the eligible launch pool", () => {
    const result = evaluateCatalogReadiness(
      plannerInput(
        Array.from({ length: 21 }, (_, index) =>
          candidate(`single-protein-${String(index).padStart(3, "0")}-v1`, "poultry")
        )
      ),
      "single-protein"
    )

    expect(result.eligibleMealOptionCount).toBe(21)
    expect(result.proteinCapacityOk).toBe(false)
    expect(result.coverageOk).toBe(true)
    expect(result.ready).toBe(false)
    expect(result.blockers).toContain("INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY")
  })

  test("accepts one plant protein group for a vegetarian launch scenario", () => {
    const candidates = Array.from({ length: 21 }, (_, index) =>
      candidate(`vegetarian-${String(index).padStart(3, "0")}-v1`, "plant")
    ).map((value) => ({
      ...value,
      ingredientLineage: value.ingredientLineage.map((lineage) => ({
        ...lineage,
        dietaryTagCodes: ["vegetarian"]
      }))
    }))
    const input = {
      ...plannerInput(candidates),
      hardRuleCodes: ["diet_vegetarian"] as const
    }
    const result = evaluateCatalogReadiness(input, "vegetarian")

    expect(result).toMatchObject({
      eligibleMealOptionCount: 21,
      proteinCapacityOk: true,
      coverageOk: true,
      ready: true,
      blockers: []
    })
  })

  test.each([
    ["allergen", withBadAllergen],
    ["unit", withBadUnit],
    ["nutrition", withBadNutrition],
    ["price", withMissingPrice]
  ] as const)(
    "fails coverage when a published candidate has incomplete %s data",
    (_label, mutate) => {
      const candidates = diverseCandidates(21)
      candidates.push(mutate(candidate("incomplete-v1", "poultry")))
      const result = evaluateCatalogReadiness(plannerInput(candidates), "incomplete-coverage")

      expect(result.eligibleMealOptionCount).toBe(21)
      expect(result.coverageOk).toBe(false)
      expect(result.ready).toBe(false)
      expect(result.blockers).toContain("CATALOG_COVERAGE_INCOMPLETE")
    }
  )

  test("accepts stale-but-usable prices without treating them as incomplete coverage", () => {
    const result = evaluateCatalogReadiness(
      plannerInput(diverseCandidates(21)),
      "stale-usable-prices"
    )

    expect(result).toMatchObject({
      eligibleMealOptionCount: 21,
      coverageOk: true,
      ready: true
    })
  })

  test("rejects prices older than the authoritative usable window", () => {
    const candidates = diverseCandidates(21).map((value) => ({
      ...value,
      prices: value.prices.map((price) => ({ ...price, observedAt: "2026-01-01" }))
    }))
    const result = evaluateCatalogReadiness(plannerInput(candidates), "too-old-prices")

    expect(result.eligibleMealOptionCount).toBe(0)
    expect(result.coverageOk).toBe(false)
    expect(result.ready).toBe(false)
    expect(result.blockers).toContain("CATALOG_COVERAGE_INCOMPLETE")
    expect(result.blockers).toContain("NO_USABLE_PRICE")
  })
})
