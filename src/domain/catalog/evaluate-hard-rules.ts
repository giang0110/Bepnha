import type { RecipeIngredientLineage } from "./catalog.js"
import { HARD_RULE_MAPPINGS, isHardRuleCode, type HardRuleCode } from "./hard-rule-mapping.js"
import {
  resolveAllergenStrictness,
  type AllergenStrictness
} from "../household/allergen-strictness.js"
import {
  HOUSEHOLD_RULE_OPTION_BY_CODE,
  type HouseholdRuleCode
} from "../household/household-rules.js"

export type HardRuleEvaluation =
  | { readonly status: "eligible" }
  | {
      readonly status: "excluded" | "unknown_lineage" | "cross_contact_unverified"
      readonly ruleCode: string
      readonly recipeIngredientId: string
    }
  | { readonly status: "unsupported_hard_rule"; readonly ruleCode: string }

type NonEligibleEvaluation = Exclude<HardRuleEvaluation, { readonly status: "eligible" }>

function evaluateRule(
  ruleCode: HardRuleCode,
  ingredients: readonly RecipeIngredientLineage[],
  strictness: AllergenStrictness
): NonEligibleEvaluation | null {
  const mapping = HARD_RULE_MAPPINGS[ruleCode]
  if (mapping.kind === "unsupported") {
    return { status: "unsupported_hard_rule", ruleCode }
  }

  for (const ingredient of [...ingredients].sort((left, right) =>
    left.recipeIngredientId < right.recipeIngredientId ? -1 : 1
  )) {
    if (mapping.kind === "allergen") {
      const assessments = ingredient.allergenAssessments.filter(
        (assessment) => assessment.allergenCode === mapping.targetCode
      )
      const assessment = assessments[0]
      if (assessments.length !== 1 || assessment === undefined || assessment.status === "unknown") {
        return {
          status: "unknown_lineage",
          ruleCode,
          recipeIngredientId: ingredient.recipeIngredientId
        }
      }
      if (assessment.status === "contains" || assessment.status === "may_contain") {
        return {
          status: "excluded",
          ruleCode,
          recipeIngredientId: ingredient.recipeIngredientId
        }
      }
      // Not an ingredient, but nobody has cleared the supplier's handling. Only a household that
      // asked for ingredient-level filtering accepts that; `strict` is both the default and what an
      // absent or unreadable preference resolves to, so this never opens up by accident.
      if (assessment.status === "cross_contact_unverified" && strictness === "strict") {
        return {
          status: "cross_contact_unverified",
          ruleCode,
          recipeIngredientId: ingredient.recipeIngredientId
        }
      }
    }

    if (mapping.kind === "category") {
      if (ingredient.categoryAncestry.length === 0) {
        return {
          status: "unknown_lineage",
          ruleCode,
          recipeIngredientId: ingredient.recipeIngredientId
        }
      }
      if (ingredient.categoryAncestry.includes(mapping.targetCode)) {
        return {
          status: "excluded",
          ruleCode,
          recipeIngredientId: ingredient.recipeIngredientId
        }
      }
    }

    if (
      mapping.kind === "required_tag" &&
      !ingredient.dietaryTagCodes.includes(mapping.targetCode)
    ) {
      return {
        status: "excluded",
        ruleCode,
        recipeIngredientId: ingredient.recipeIngredientId
      }
    }
  }

  return null
}

// Lowest wins. A meal rejected for several reasons reports the one the cook can least act on
// first, and `excluded` outranks `cross_contact_unverified` because "this dish uses peanut" is a
// better answer than "we could not clear the peanut handling" when both are true.
const EVALUATION_PRIORITY: Readonly<Record<NonEligibleEvaluation["status"], number>> = {
  unsupported_hard_rule: 0,
  unknown_lineage: 1,
  excluded: 2,
  cross_contact_unverified: 3
}

export function evaluateHardRules(
  ruleCodes: readonly string[],
  ingredients: readonly RecipeIngredientLineage[],
  strictnessByRuleCode?: Readonly<Record<string, AllergenStrictness>>
): HardRuleEvaluation {
  const outcomes: NonEligibleEvaluation[] = []

  for (const ruleCode of [...new Set(ruleCodes)].sort()) {
    const knownOption = HOUSEHOLD_RULE_OPTION_BY_CODE.get(ruleCode as HouseholdRuleCode)
    if (knownOption?.ruleKind === "soft_preference") {
      continue
    }

    if (!isHardRuleCode(ruleCode)) {
      outcomes.push({ status: "unsupported_hard_rule", ruleCode })
      continue
    }

    const outcome = evaluateRule(
      ruleCode,
      ingredients,
      resolveAllergenStrictness(strictnessByRuleCode, ruleCode)
    )
    if (outcome !== null) {
      outcomes.push(outcome)
    }
  }

  outcomes.sort((left, right) => {
    const priority = EVALUATION_PRIORITY[left.status] - EVALUATION_PRIORITY[right.status]
    if (priority !== 0) return priority
    if (left.ruleCode !== right.ruleCode) return left.ruleCode < right.ruleCode ? -1 : 1
    const leftIngredient = "recipeIngredientId" in left ? left.recipeIngredientId : ""
    const rightIngredient = "recipeIngredientId" in right ? right.recipeIngredientId : ""
    return leftIngredient < rightIngredient ? -1 : leftIngredient > rightIngredient ? 1 : 0
  })

  return outcomes[0] ?? { status: "eligible" }
}
