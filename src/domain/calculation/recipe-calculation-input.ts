import type { AllergenAssessmentStatus } from "@/domain/catalog/catalog"
import type { PortionConfigV1 } from "@/domain/portion/portion-config"
import type { PriceFreshnessConfigV1 } from "@/domain/pricing/pricing"
import { canonicalJson } from "@/domain/shared/canonical-json"

export interface RecipeCalculationInputV1 {
  readonly calculationVersion: "recipe-calculation-v1"
  readonly portionConfig: PortionConfigV1
  readonly priceFreshnessConfig: PriceFreshnessConfigV1
  readonly calculationDate: string
  readonly memberGroups: readonly {
    readonly memberKind: string
    readonly ageBand: string
    readonly memberCount: number
  }[]
  readonly recipe: {
    readonly recipeId: string
    readonly recipeVersionId: string
    readonly recipeVersionNumber: number
    readonly contentHash: string
    readonly yieldAdultEquivalent: string
    readonly activeMinutes: number
    readonly elapsedMinutes: number
    readonly ingredients: readonly {
      readonly recipeIngredientId: string
      readonly order: number
      readonly quantity: string
      readonly unitId: string
      readonly food: {
        readonly foodId: string
        readonly code: string
        readonly baseUnitId: string
      }
      readonly fact: {
        readonly foodFactVersionId: string
        readonly versionNumber: number
        readonly contentHash: string
        readonly edibleFraction: string
        readonly conversion: {
          readonly unitId: string
          readonly baseQuantityPerUnit: string
          readonly grossGramsPerUnit: string
        }
        readonly nutrients: readonly {
          readonly nutrientCode: string
          readonly amountPer100g: string
        }[]
        readonly allergenAssessments: readonly {
          readonly allergenCode: string
          readonly status: AllergenAssessmentStatus
        }[]
        readonly categoryAncestry: readonly string[]
        readonly dietaryTagCodes: readonly string[]
      }
    }[]
  }
  readonly priceBook: {
    readonly regionId: string
    readonly regionCode: string
    readonly priceBookId: string
    readonly versionNumber: number
    readonly contentHash: string
    readonly prices: readonly {
      readonly foodPriceId: string
      readonly foodId: string
      readonly foodFactVersionId: string
      readonly baseUnitId: string
      readonly packageBaseQuantity: string
      readonly packagePriceVnd: number
      readonly observedAt: string
    }[]
  }
}

const MEMBER_BAND_ORDER = ["adult", "1_3", "4_6", "7_9", "10_12", "13_17", "elderly"]

export function canonicalRecipeCalculationInput<T extends RecipeCalculationInputV1>(
  input: T
): string {
  const normalized = {
    calculationVersion: input.calculationVersion,
    portionConfig: {
      version: input.portionConfig.version,
      coefficients: {
        adult: input.portionConfig.coefficients.adult,
        child_1_3: input.portionConfig.coefficients.child_1_3,
        child_4_6: input.portionConfig.coefficients.child_4_6,
        child_7_9: input.portionConfig.coefficients.child_7_9,
        child_10_12: input.portionConfig.coefficients.child_10_12,
        child_13_17: input.portionConfig.coefficients.child_13_17,
        elderly: input.portionConfig.coefficients.elderly
      }
    },
    priceFreshnessConfig: {
      version: input.priceFreshnessConfig.version,
      currentMaxAgeDays: input.priceFreshnessConfig.currentMaxAgeDays,
      usableMaxAgeDays: input.priceFreshnessConfig.usableMaxAgeDays
    },
    calculationDate: input.calculationDate,
    memberGroups: [...input.memberGroups]
      .sort(
        (left, right) =>
          MEMBER_BAND_ORDER.indexOf(left.ageBand) - MEMBER_BAND_ORDER.indexOf(right.ageBand)
      )
      .map((group) => ({
        memberKind: group.memberKind,
        ageBand: group.ageBand,
        memberCount: group.memberCount
      })),
    recipe: {
      recipeId: input.recipe.recipeId,
      recipeVersionId: input.recipe.recipeVersionId,
      recipeVersionNumber: input.recipe.recipeVersionNumber,
      contentHash: input.recipe.contentHash,
      yieldAdultEquivalent: input.recipe.yieldAdultEquivalent,
      activeMinutes: input.recipe.activeMinutes,
      elapsedMinutes: input.recipe.elapsedMinutes,
      ingredients: [...input.recipe.ingredients]
        .sort((left, right) => {
          if (left.order !== right.order) return left.order - right.order
          return left.recipeIngredientId < right.recipeIngredientId ? -1 : 1
        })
        .map((ingredient) => ({
          recipeIngredientId: ingredient.recipeIngredientId,
          order: ingredient.order,
          quantity: ingredient.quantity,
          unitId: ingredient.unitId,
          food: {
            foodId: ingredient.food.foodId,
            code: ingredient.food.code,
            baseUnitId: ingredient.food.baseUnitId
          },
          fact: {
            foodFactVersionId: ingredient.fact.foodFactVersionId,
            versionNumber: ingredient.fact.versionNumber,
            contentHash: ingredient.fact.contentHash,
            edibleFraction: ingredient.fact.edibleFraction,
            conversion: {
              unitId: ingredient.fact.conversion.unitId,
              baseQuantityPerUnit: ingredient.fact.conversion.baseQuantityPerUnit,
              grossGramsPerUnit: ingredient.fact.conversion.grossGramsPerUnit
            },
            nutrients: [...ingredient.fact.nutrients]
              .sort((left, right) => (left.nutrientCode < right.nutrientCode ? -1 : 1))
              .map((nutrient) => ({
                nutrientCode: nutrient.nutrientCode,
                amountPer100g: nutrient.amountPer100g
              })),
            allergenAssessments: [...ingredient.fact.allergenAssessments]
              .sort((left, right) => (left.allergenCode < right.allergenCode ? -1 : 1))
              .map((assessment) => ({
                allergenCode: assessment.allergenCode,
                status: assessment.status
              })),
            categoryAncestry: [...ingredient.fact.categoryAncestry].sort(),
            dietaryTagCodes: [...ingredient.fact.dietaryTagCodes].sort()
          }
        }))
    },
    priceBook: {
      regionId: input.priceBook.regionId,
      regionCode: input.priceBook.regionCode,
      priceBookId: input.priceBook.priceBookId,
      versionNumber: input.priceBook.versionNumber,
      contentHash: input.priceBook.contentHash,
      prices: [...input.priceBook.prices]
        .sort((left, right) => {
          if (left.foodId !== right.foodId) return left.foodId < right.foodId ? -1 : 1
          return left.foodPriceId < right.foodPriceId ? -1 : 1
        })
        .map((price) => ({
          foodPriceId: price.foodPriceId,
          foodId: price.foodId,
          foodFactVersionId: price.foodFactVersionId,
          baseUnitId: price.baseUnitId,
          packageBaseQuantity: price.packageBaseQuantity,
          packagePriceVnd: price.packagePriceVnd,
          observedAt: price.observedAt
        }))
    }
  }

  return canonicalJson(normalized)
}
