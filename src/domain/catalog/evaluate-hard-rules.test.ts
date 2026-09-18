import { describe, expect, test } from "vitest"

import { HOUSEHOLD_RULE_OPTIONS } from "@/domain/household/household-rules"
import { evaluateHardRules } from "@/domain/catalog/evaluate-hard-rules"
import {
  HARD_RULE_MAPPINGS,
  validateHardRuleMappingCoverage
} from "@/domain/catalog/hard-rule-mapping"

const absentAssessments = [
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
].map((allergenCode) => ({ allergenCode, status: "absent" as const }))

const vegetarianIngredient = {
  recipeIngredientId: "ingredient-tofu",
  allergenAssessments: absentAssessments,
  categoryAncestry: ["tofu"],
  dietaryTagCodes: ["vegetarian"]
} as const

describe("hard-rule catalog mapping", () => {
  test("maps every Phase 1 hard option exactly once and no soft option", () => {
    const hardCodes = HOUSEHOLD_RULE_OPTIONS.filter(
      (option) => option.ruleKind !== "soft_preference"
    ).map((option) => option.code)
    const softCodes = HOUSEHOLD_RULE_OPTIONS.filter(
      (option) => option.ruleKind === "soft_preference"
    ).map((option) => option.code)

    expect(Object.keys(HARD_RULE_MAPPINGS).sort()).toEqual([...hardCodes].sort())
    expect(softCodes.some((code) => code in HARD_RULE_MAPPINGS)).toBe(false)
    expect(validateHardRuleMappingCoverage(HOUSEHOLD_RULE_OPTIONS)).toEqual({ ok: true })
  })

  test("fails coverage when a hard option is unmapped or a soft option is mapped", () => {
    expect(
      validateHardRuleMappingCoverage([
        ...HOUSEHOLD_RULE_OPTIONS,
        {
          code: "new_hard_rule",
          targetKey: "new",
          ruleKind: "food_exclusion",
          labelVi: "Mới",
          sortOrder: 99
        }
      ])
    ).toEqual({ ok: false, error: { code: "INCOMPLETE_HARD_RULE_MAPPING" } })
  })
})

describe("evaluateHardRules", () => {
  test.each(["contains", "may_contain"] as const)(
    "excludes an ingredient assessed as %s",
    (status) => {
      expect(
        evaluateHardRules(
          ["allergen_soy"],
          [
            {
              ...vegetarianIngredient,
              allergenAssessments: absentAssessments.map((assessment) =>
                assessment.allergenCode === "soy" ? { ...assessment, status } : assessment
              )
            }
          ]
        )
      ).toEqual({
        status: "excluded",
        ruleCode: "allergen_soy",
        recipeIngredientId: "ingredient-tofu"
      })
    }
  )

  test("treats absent as assessed and eligible", () => {
    expect(evaluateHardRules(["allergen_soy"], [vegetarianIngredient])).toEqual({
      status: "eligible"
    })
  })

  test.each(
    [
      absentAssessments.filter((assessment) => assessment.allergenCode !== "soy"),
      absentAssessments.map((assessment) =>
        assessment.allergenCode === "soy"
          ? { ...assessment, status: "unknown" as const }
          : assessment
      )
    ].map((assessments) => [assessments] as const)
  )("fails closed for missing or unknown allergen lineage", (allergenAssessments) => {
    expect(
      evaluateHardRules(["allergen_soy"], [{ ...vegetarianIngredient, allergenAssessments }])
    ).toEqual({
      status: "unknown_lineage",
      ruleCode: "allergen_soy",
      recipeIngredientId: "ingredient-tofu"
    })
  })

  test("uses category ancestry for exclusions", () => {
    expect(
      evaluateHardRules(
        ["exclude_seafood"],
        [
          {
            ...vegetarianIngredient,
            categoryAncestry: ["crustacean", "seafood"],
            dietaryTagCodes: []
          }
        ]
      )
    ).toEqual({
      status: "excluded",
      ruleCode: "exclude_seafood",
      recipeIngredientId: "ingredient-tofu"
    })
  })

  test("requires the vegetarian tag on every ingredient", () => {
    expect(
      evaluateHardRules(
        ["diet_vegetarian"],
        [
          vegetarianIngredient,
          { ...vegetarianIngredient, recipeIngredientId: "ingredient-fish", dietaryTagCodes: [] }
        ]
      )
    ).toEqual({
      status: "excluded",
      ruleCode: "diet_vegetarian",
      recipeIngredientId: "ingredient-fish"
    })
  })

  test("always rejects the unsupported other-allergen rule", () => {
    expect(evaluateHardRules(["allergen_other"], [vegetarianIngredient])).toEqual({
      status: "unsupported_hard_rule",
      ruleCode: "allergen_other"
    })
  })

  test("fails closed for missing category lineage and unknown rule codes", () => {
    expect(
      evaluateHardRules(["exclude_beef"], [{ ...vegetarianIngredient, categoryAncestry: [] }])
    ).toEqual({
      status: "unknown_lineage",
      ruleCode: "exclude_beef",
      recipeIngredientId: "ingredient-tofu"
    })
    expect(evaluateHardRules(["future_hard_rule"], [vegetarianIngredient])).toEqual({
      status: "unsupported_hard_rule",
      ruleCode: "future_hard_rule"
    })
  })

  test("ignores soft preferences and instruction text by construction", () => {
    const firstRecipe = { instructionVi: "Rắc đậu phộng.", ingredients: [vegetarianIngredient] }
    const secondRecipe = { instructionVi: "Dọn món ăn.", ingredients: [vegetarianIngredient] }

    expect(evaluateHardRules(["prefer_tofu"], firstRecipe.ingredients)).toEqual({
      status: "eligible"
    })
    expect(evaluateHardRules(["allergen_peanut"], firstRecipe.ingredients)).toEqual(
      evaluateHardRules(["allergen_peanut"], secondRecipe.ingredients)
    )
  })
})

describe("evaluateHardRules with cross-contact lineage", () => {
  const withSoy = (status: "absent" | "cross_contact_unverified" | "contains") => [
    {
      ...vegetarianIngredient,
      allergenAssessments: absentAssessments.map((assessment) =>
        assessment.allergenCode === "soy" ? { ...assessment, status } : assessment
      )
    }
  ]

  test("excludes cross_contact_unverified when the household said nothing", () => {
    expect(evaluateHardRules(["allergen_soy"], withSoy("cross_contact_unverified"))).toEqual({
      status: "cross_contact_unverified",
      ruleCode: "allergen_soy",
      recipeIngredientId: "ingredient-tofu"
    })
  })

  test.each(["strict", undefined, "STRICT", "", "absent", null] as const)(
    "excludes cross_contact_unverified for a strictness of %o",
    (declared) => {
      const result = evaluateHardRules(["allergen_soy"], withSoy("cross_contact_unverified"), {
        allergen_soy: declared as never
      })

      expect(result.status).toBe("cross_contact_unverified")
    }
  )

  test("admits cross_contact_unverified only for a household that asked for ingredient_only", () => {
    expect(
      evaluateHardRules(["allergen_soy"], withSoy("cross_contact_unverified"), {
        allergen_soy: "ingredient_only"
      })
    ).toEqual({ status: "eligible" })
  })

  test("ingredient_only never admits an allergen that is actually an ingredient", () => {
    expect(
      evaluateHardRules(["allergen_soy"], withSoy("contains"), {
        allergen_soy: "ingredient_only"
      })
    ).toEqual({
      status: "excluded",
      ruleCode: "allergen_soy",
      recipeIngredientId: "ingredient-tofu"
    })
  })

  test("a relaxed rule does not relax a different allergy", () => {
    const ingredients = [
      {
        ...vegetarianIngredient,
        allergenAssessments: absentAssessments.map((assessment) =>
          assessment.allergenCode === "soy" || assessment.allergenCode === "peanut"
            ? { ...assessment, status: "cross_contact_unverified" as const }
            : assessment
        )
      }
    ]

    expect(
      evaluateHardRules(["allergen_soy", "allergen_peanut"], ingredients, {
        allergen_soy: "ingredient_only"
      })
    ).toEqual({
      status: "cross_contact_unverified",
      ruleCode: "allergen_peanut",
      recipeIngredientId: "ingredient-tofu"
    })
  })

  test("reports the ingredient that contains the allergen over one merely unverified", () => {
    const ingredients = [
      {
        ...vegetarianIngredient,
        recipeIngredientId: "ingredient-a-unverified",
        allergenAssessments: absentAssessments.map((assessment) =>
          assessment.allergenCode === "soy"
            ? { ...assessment, status: "cross_contact_unverified" as const }
            : assessment
        )
      },
      {
        ...vegetarianIngredient,
        recipeIngredientId: "ingredient-b-contains",
        allergenAssessments: absentAssessments.map((assessment) =>
          assessment.allergenCode === "peanut"
            ? { ...assessment, status: "contains" as const }
            : assessment
        )
      }
    ]

    expect(evaluateHardRules(["allergen_soy", "allergen_peanut"], ingredients)).toEqual({
      status: "excluded",
      ruleCode: "allergen_peanut",
      recipeIngredientId: "ingredient-b-contains"
    })
  })

  test("an unassessed allergen stays unknown_lineage however lenient the household is", () => {
    const ingredients = [
      {
        ...vegetarianIngredient,
        allergenAssessments: absentAssessments.map((assessment) =>
          assessment.allergenCode === "soy"
            ? { ...assessment, status: "unknown" as const }
            : assessment
        )
      }
    ]

    expect(
      evaluateHardRules(["allergen_soy"], ingredients, { allergen_soy: "ingredient_only" })
    ).toEqual({
      status: "unknown_lineage",
      ruleCode: "allergen_soy",
      recipeIngredientId: "ingredient-tofu"
    })
  })

  test("absent stays eligible for a strict household", () => {
    expect(
      evaluateHardRules(["allergen_soy"], withSoy("absent"), { allergen_soy: "strict" })
    ).toEqual({ status: "eligible" })
  })
})
