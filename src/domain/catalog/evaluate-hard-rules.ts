import type { RecipeIngredientLineage } from "@/domain/catalog/catalog"
import {
  HARD_RULE_MAPPINGS,
  isHardRuleCode,
  type HardRuleCode
} from "@/domain/catalog/hard-rule-mapping"
import {
  HOUSEHOLD_RULE_OPTION_BY_CODE,
  type HouseholdRuleCode
} from "@/domain/household/household-rules"

export type HardRuleEvaluation =
  | { readonly status: "eligible" }
  | {
      readonly status: "excluded" | "unknown_lineage"
      readonly ruleCode: string
      readonly recipeIngredientId: string
    }
  | { readonly status: "unsupported_hard_rule"; readonly ruleCode: string }

type NonEligibleEvaluation = Exclude<HardRuleEvaluation, { readonly status: "eligible" }>

function evaluateRule(
  ruleCode: HardRuleCode,
  ingredients: readonly RecipeIngredientLineage[]
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

const EVALUATION_PRIORITY: Readonly<Record<NonEligibleEvaluation["status"], number>> = {
  unsupported_hard_rule: 0,
  unknown_lineage: 1,
  excluded: 2
}

export function evaluateHardRules(
  ruleCodes: readonly string[],
  ingredients: readonly RecipeIngredientLineage[]
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

    const outcome = evaluateRule(ruleCode, ingredients)
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
