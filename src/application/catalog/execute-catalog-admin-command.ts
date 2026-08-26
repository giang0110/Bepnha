import type {
  CatalogAdminCommand,
  FoodFactDraftInput,
  PriceBookDraftInput,
  RecipeVersionDraftInput
} from "@/application/catalog/catalog-admin-command"
import type {
  CatalogAdminRepository,
  CatalogAdminResult,
  CatalogPublicationAggregate,
  FoodFactPublicationAggregate,
  RecipePublicationAggregate
} from "@/application/catalog/catalog-admin-repository"
import type { ContentHasher } from "@/application/catalog/content-hasher"
import { normalizeFoodFactLineage } from "@/domain/catalog/normalize-catalog"
import { normalizeRecipeSteps } from "@/domain/recipe/recipe"
import { canonicalUtf8 } from "@/domain/shared/canonical-json"
import { parseCanonicalDecimal } from "@/domain/shared/decimal"

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/u
const HASH_PATTERN = /^[0-9a-f]{64}$/u
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

function validationFailure(): CatalogAdminResult {
  return { ok: false, reason: "VALIDATION_FAILED" }
}

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function validLabel(value: string, maxLength: number): boolean {
  const trimmed = value.trim()
  return (
    trimmed === value && Array.from(trimmed).length >= 1 && Array.from(trimmed).length <= maxLength
  )
}

function validPositiveDecimal(value: string): boolean {
  return parseCanonicalDecimal(value, {
    maxScale: 18,
    maxIntegerDigits: 34,
    allowNegative: false,
    allowZero: false
  }).ok
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

function validateRecipeDraft(input: RecipeVersionDraftInput): boolean {
  if (
    !validRevision(input.expectedRevision) ||
    !validPositiveDecimal(input.yieldAdultEquivalent) ||
    !Number.isSafeInteger(input.activeMinutes) ||
    input.activeMinutes < 1 ||
    !Number.isSafeInteger(input.elapsedMinutes) ||
    input.elapsedMinutes < input.activeMinutes ||
    input.elapsedMinutes > 180 ||
    input.ingredients.length === 0
  ) {
    return false
  }

  const ingredientIds = input.ingredients.map((ingredient) => ingredient.recipeIngredientId)
  const foodIds = input.ingredients.map((ingredient) => ingredient.foodId)
  const orders = input.ingredients.map((ingredient) => String(ingredient.order))
  if (hasDuplicate(ingredientIds) || hasDuplicate(foodIds) || hasDuplicate(orders)) return false
  if (
    input.ingredients.some(
      (ingredient) =>
        !validPositiveDecimal(ingredient.quantity) ||
        ingredient.order < 1 ||
        !Number.isSafeInteger(ingredient.order)
    )
  ) {
    return false
  }

  const steps = normalizeRecipeSteps(input.steps, ingredientIds, input.elapsedMinutes)
  return steps.ok && !hasDuplicate(input.tagIds)
}

function validateFoodFactDraft(input: FoodFactDraftInput): boolean {
  if (
    !validRevision(input.expectedRevision) ||
    input.versionNumber < 1 ||
    !Number.isSafeInteger(input.versionNumber) ||
    !validLabel(input.provenance, 500) ||
    input.allergenAssessments.some((assessment) => !validLabel(assessment.provenance, 500)) ||
    input.nutrients.some((nutrient) => !validLabel(nutrient.provenance, 500)) ||
    input.conversions.length === 0 ||
    hasDuplicate(input.conversions.map((conversion) => conversion.unitId)) ||
    input.conversions.some(
      (conversion) =>
        !validPositiveDecimal(conversion.baseQuantityPerUnit) ||
        !validPositiveDecimal(conversion.grossGramsPerUnit) ||
        !validPositiveDecimal(conversion.displayStep) ||
        !validLabel(conversion.provenance, 500)
    )
  ) {
    return false
  }

  return normalizeFoodFactLineage({
    foodId: input.foodId,
    foodFactVersionId: input.foodFactVersionId,
    edibleFraction: input.edibleFraction,
    allergenAssessments: input.allergenAssessments,
    nutrients: input.nutrients,
    categoryAncestry: input.categoryAncestry,
    dietaryTagCodes: input.dietaryTagCodes
  }).ok
}

function dateIsValid(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function validatePriceBookDraft(input: PriceBookDraftInput): boolean {
  if (
    !validRevision(input.expectedRevision) ||
    !dateIsValid(input.effectiveFrom) ||
    (input.effectiveTo !== null &&
      (!dateIsValid(input.effectiveTo) || input.effectiveTo < input.effectiveFrom)) ||
    input.prices.length === 0 ||
    hasDuplicate(input.prices.map((price) => price.foodId))
  ) {
    return false
  }
  return input.prices.every(
    (price) =>
      validPositiveDecimal(price.packageQuantity) &&
      validPositiveDecimal(price.packageBaseQuantity) &&
      validPositiveDecimal(price.purchaseIncrement) &&
      Number.isSafeInteger(price.packagePriceVnd) &&
      price.packagePriceVnd > 0 &&
      dateIsValid(price.observedAt) &&
      validLabel(price.sourceReference, 500)
  )
}

function recipeAggregateAsDraft(aggregate: RecipePublicationAggregate): RecipeVersionDraftInput {
  const ingredientIdsByStep = new Map<string, string[]>()
  for (const link of aggregate.stepIngredients) {
    const ids = ingredientIdsByStep.get(link.recipeStepId) ?? []
    ids.push(link.recipeIngredientId)
    ingredientIdsByStep.set(link.recipeStepId, ids)
  }
  return {
    recipeVersionId: aggregate.version.recipeVersionId,
    expectedRevision: aggregate.version.revision,
    recipeId: aggregate.recipe.recipeId,
    versionNumber: aggregate.version.versionNumber,
    yieldAdultEquivalent: aggregate.version.yieldAdultEquivalent,
    activeMinutes: aggregate.version.activeMinutes,
    elapsedMinutes: aggregate.version.elapsedMinutes,
    ingredients: aggregate.ingredients.map((ingredient) => ({
      recipeIngredientId: ingredient.recipeIngredientId,
      foodId: ingredient.foodId,
      foodFactVersionId: ingredient.foodFactVersionId,
      quantity: ingredient.quantity,
      unitId: ingredient.unitId,
      preparationNoteVi: ingredient.preparationNoteVi,
      order: ingredient.order
    })),
    steps: aggregate.steps.map((step) => ({
      order: step.order,
      instructionVi: step.instructionVi,
      timerMinutes: step.timerMinutes,
      ingredientIds: ingredientIdsByStep.get(step.recipeStepId) ?? []
    })),
    tagIds: aggregate.tags.map((tag) => tag.recipeTagId)
  }
}

function foodAggregateIsComplete(aggregate: FoodFactPublicationAggregate): boolean {
  return (
    aggregate.fact.publicationStatus === "draft" &&
    aggregate.fact.contentHash === null &&
    validateFoodFactDraft({
      foodFactVersionId: aggregate.fact.foodFactVersionId,
      expectedRevision: aggregate.fact.revision,
      foodId: aggregate.food.foodId,
      versionNumber: aggregate.fact.versionNumber,
      categoryId: aggregate.fact.categoryId,
      edibleFraction: aggregate.fact.edibleFraction,
      provenance: aggregate.fact.provenance,
      allergenAssessments: aggregate.assessments,
      nutrients: aggregate.nutrients,
      categoryAncestry: [aggregate.fact.categoryId],
      dietaryTagCodes: aggregate.dietaryTags.map((tag) => tag.code),
      conversions: aggregate.conversions
    })
  )
}

function aggregateIsComplete(aggregate: CatalogPublicationAggregate): boolean {
  if (aggregate.aggregateType === "food_fact_version") return foodAggregateIsComplete(aggregate)
  if (aggregate.aggregateType === "recipe_version") {
    return (
      aggregate.version.publicationStatus === "draft" &&
      aggregate.version.contentHash === null &&
      aggregate.ingredients.every(
        (ingredient) =>
          ingredient.foodFactPublicationStatus === "published" &&
          HASH_PATTERN.test(ingredient.foodFactContentHash) &&
          ingredient.hasPinnedConversion
      ) &&
      validateRecipeDraft(recipeAggregateAsDraft(aggregate))
    )
  }
  return (
    aggregate.book.publicationStatus === "draft" &&
    aggregate.book.contentHash === null &&
    aggregate.prices.every(
      (price) =>
        price.foodFactPublicationStatus === "published" &&
        HASH_PATTERN.test(price.foodFactContentHash)
    ) &&
    validatePriceBookDraft({
      priceBookId: aggregate.book.priceBookId,
      expectedRevision: aggregate.book.revision,
      effectiveFrom: aggregate.book.effectiveFrom,
      effectiveTo: aggregate.book.effectiveTo,
      prices: aggregate.prices.map((price) => ({
        foodPriceId: price.foodPriceId,
        foodId: price.foodId,
        foodFactVersionId: price.foodFactVersionId,
        packageQuantity: price.packageQuantity,
        packageUnitId: price.packageUnitId,
        packageBaseQuantity: price.packageBaseQuantity,
        baseUnitId: price.baseUnitId,
        packagePriceVnd: price.packagePriceVnd,
        purchaseIncrement: price.purchaseIncrement,
        observedAt: price.observedAt,
        sourceReference: price.sourceReference
      }))
    })
  )
}

function normalizeAggregateForHash(aggregate: CatalogPublicationAggregate): unknown {
  if (aggregate.aggregateType === "food_fact_version") {
    return {
      ...aggregate,
      conversions: [...aggregate.conversions].sort((left, right) =>
        left.unitId < right.unitId ? -1 : 1
      ),
      assessments: [...aggregate.assessments].sort((left, right) =>
        left.allergenCode < right.allergenCode ? -1 : 1
      ),
      nutrients: [...aggregate.nutrients].sort((left, right) =>
        left.nutrientCode < right.nutrientCode ? -1 : 1
      ),
      dietaryTags: [...aggregate.dietaryTags].sort((left, right) =>
        left.code < right.code ? -1 : 1
      )
    }
  }
  if (aggregate.aggregateType === "recipe_version") {
    return {
      ...aggregate,
      ingredients: [...aggregate.ingredients].sort((left, right) => left.order - right.order),
      steps: [...aggregate.steps].sort((left, right) => left.order - right.order),
      stepIngredients: [...aggregate.stepIngredients].sort((left, right) => {
        if (left.recipeStepId !== right.recipeStepId) {
          return left.recipeStepId < right.recipeStepId ? -1 : 1
        }
        return left.referenceOrder - right.referenceOrder
      }),
      tags: [...aggregate.tags].sort((left, right) => (left.code < right.code ? -1 : 1))
    }
  }
  return {
    ...aggregate,
    prices: [...aggregate.prices].sort((left, right) => (left.foodId < right.foodId ? -1 : 1))
  }
}

async function publishAggregate(
  repository: CatalogAdminRepository,
  hasher: ContentHasher,
  aggregateType: CatalogPublicationAggregate["aggregateType"],
  id: string,
  expectedRevision: number
): Promise<CatalogAdminResult> {
  if (!validRevision(expectedRevision)) return validationFailure()
  const loaded = await repository.getAggregateForPublication(aggregateType, id)
  if (!loaded.ok) return loaded
  const aggregate = loaded.value
  const aggregateId =
    aggregate.aggregateType === "food_fact_version"
      ? aggregate.fact.foodFactVersionId
      : aggregate.aggregateType === "recipe_version"
        ? aggregate.version.recipeVersionId
        : aggregate.book.priceBookId
  const aggregateRevision =
    aggregate.aggregateType === "food_fact_version"
      ? aggregate.fact.revision
      : aggregate.aggregateType === "recipe_version"
        ? aggregate.version.revision
        : aggregate.book.revision
  if (
    aggregate.aggregateType !== aggregateType ||
    aggregateId !== id ||
    aggregateRevision !== expectedRevision
  ) {
    return { ok: false, reason: "STALE_CATALOG_REVISION" }
  }
  if (!aggregateIsComplete(aggregate)) {
    return { ok: false, reason: "PUBLICATION_INCOMPLETE" }
  }
  const contentHash = await hasher.sha256(canonicalUtf8(normalizeAggregateForHash(aggregate)))
  if (!HASH_PATTERN.test(contentHash)) return { ok: false, reason: "DEPENDENCY_UNAVAILABLE" }
  const publicationInput = { id, expectedRevision, contentHash }
  if (aggregateType === "food_fact_version") return repository.publishFoodFact(publicationInput)
  if (aggregateType === "recipe_version") return repository.publishRecipe(publicationInput)
  return repository.publishPriceBook(publicationInput)
}

export async function executeCatalogAdminCommand(
  repository: CatalogAdminRepository,
  hasher: ContentHasher,
  command: CatalogAdminCommand
): Promise<CatalogAdminResult> {
  switch (command.action) {
    case "create_food":
      if (
        !CODE_PATTERN.test(command.input.code) ||
        !validLabel(command.input.nameVi, 120) ||
        command.input.baseUnitId.length === 0
      )
        return validationFailure()
      return repository.createFood(command.input)
    case "save_food_fact_draft":
      return validateFoodFactDraft(command.input)
        ? repository.saveFoodFactDraft(command.input)
        : validationFailure()
    case "publish_food_fact":
      return publishAggregate(
        repository,
        hasher,
        "food_fact_version",
        command.input.foodFactVersionId,
        command.input.expectedRevision
      )
    case "retire_food":
      return validRevision(command.input.expectedRevision)
        ? repository.retireFood({
            id: command.input.foodId,
            expectedRevision: command.input.expectedRevision
          })
        : validationFailure()
    case "create_recipe":
      return CODE_PATTERN.test(command.input.code) && validLabel(command.input.nameVi, 120)
        ? repository.createRecipe(command.input)
        : validationFailure()
    case "save_recipe_version_draft":
      return validateRecipeDraft(command.input)
        ? repository.saveRecipeVersionDraft(command.input)
        : validationFailure()
    case "publish_recipe":
      return publishAggregate(
        repository,
        hasher,
        "recipe_version",
        command.input.recipeVersionId,
        command.input.expectedRevision
      )
    case "retire_recipe":
      return validRevision(command.input.expectedRevision)
        ? repository.retireRecipe({
            id: command.input.recipeId,
            expectedRevision: command.input.expectedRevision
          })
        : validationFailure()
    case "create_price_book":
      return Number.isSafeInteger(command.input.versionNumber) &&
        command.input.versionNumber > 0 &&
        dateIsValid(command.input.effectiveFrom) &&
        (command.input.effectiveTo === null ||
          (dateIsValid(command.input.effectiveTo) &&
            command.input.effectiveTo >= command.input.effectiveFrom))
        ? repository.createPriceBook(command.input)
        : validationFailure()
    case "save_price_book_draft":
      return validatePriceBookDraft(command.input)
        ? repository.savePriceBookDraft(command.input)
        : validationFailure()
    case "publish_price_book":
      return publishAggregate(
        repository,
        hasher,
        "price_book",
        command.input.priceBookId,
        command.input.expectedRevision
      )
    case "retire_price_book":
      return validRevision(command.input.expectedRevision)
        ? repository.retirePriceBook({
            id: command.input.priceBookId,
            expectedRevision: command.input.expectedRevision
          })
        : validationFailure()
  }
}
