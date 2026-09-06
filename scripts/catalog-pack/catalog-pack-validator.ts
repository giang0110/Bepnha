import { parseCanonicalDecimal } from "../../src/domain/shared/decimal.ts"
import { parseCatalogPackShape } from "./catalog-pack-schema.ts"
import {
  LAUNCH_ALLERGEN_CODES,
  LAUNCH_CATEGORY_CODES,
  LAUNCH_REQUIRED_NUTRIENT_CODES,
  LAUNCH_UNIT_CODES,
  type CatalogPackDiagnostic,
  type CatalogPackFood,
  type CatalogPackV1,
  type CatalogPackValidationReport
} from "./catalog-pack-types.ts"

export interface CatalogPackValidationCoreResult {
  readonly pack: CatalogPackV1 | null
  readonly catalogCode: string | null
  readonly diagnostics: readonly CatalogPackDiagnostic[]
  readonly blockers: readonly string[]
  readonly summary: CatalogPackValidationReport["summary"]
}

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/u
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u
const PLACEHOLDER_SOURCE = /^(?:unknown|n\/a|na|todo|tbd)$/iu

const LAUNCH_UNIT_SET = new Set<string>(LAUNCH_UNIT_CODES)
const LAUNCH_CATEGORY_SET = new Set<string>(LAUNCH_CATEGORY_CODES)
const LAUNCH_ALLERGEN_SET = new Set<string>(LAUNCH_ALLERGEN_CODES)
const LAUNCH_REQUIRED_NUTRIENT_SET = new Set<string>(LAUNCH_REQUIRED_NUTRIENT_CODES)

const UNIT_DIMENSIONS: Readonly<Record<string, CatalogPackFood["baseDimension"]>> = {
  g: "mass",
  kg: "mass",
  ml: "volume",
  l: "volume",
  tsp: "volume",
  tbsp: "volume",
  item: "count"
}

const ZERO_SUMMARY: CatalogPackValidationReport["summary"] = {
  foods: 0,
  recipes: 0,
  priceRows: 0,
  mealOptions: 0,
  primaryProteinGroups: 0,
  reachableFoods: 0,
  pricedReachableFoods: 0
}

function addError(
  diagnostics: CatalogPackDiagnostic[],
  code: string,
  path: string,
  message: string
): void {
  diagnostics.push({ severity: "error", code, path, message })
}

function addWarning(
  diagnostics: CatalogPackDiagnostic[],
  code: string,
  path: string,
  message: string
): void {
  diagnostics.push({ severity: "warning", code, path, message })
}

function issuePath(path: readonly PropertyKey[]): string {
  let result = "$"
  for (const segment of path) {
    if (typeof segment === "number") {
      result += `[${segment}]`
    } else {
      result += `.${String(segment)}`
    }
  }
  return result
}

function isTrimmedLength(value: string, min: number, max: number): boolean {
  const length = Array.from(value).length
  return value.trim() === value && length >= min && length <= max
}

function isValidDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function isValidRfc3339(value: string): boolean {
  return RFC3339_PATTERN.test(value) && Number.isFinite(Date.parse(value))
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function validateCode(value: string, path: string, diagnostics: CatalogPackDiagnostic[]): void {
  if (!CODE_PATTERN.test(value)) {
    addError(
      diagnostics,
      "INVALID_CODE",
      path,
      "Code must use lower-case ASCII letters, digits, and underscores"
    )
  }
}

function validateLabel(
  value: string,
  path: string,
  diagnostics: CatalogPackDiagnostic[],
  maxLength = 120
): void {
  if (!isTrimmedLength(value, 1, maxLength)) {
    addError(
      diagnostics,
      "INVALID_LABEL",
      path,
      `Label must be trimmed and 1..${maxLength} characters`
    )
  }
}

function validateProvenance(
  value: string,
  path: string,
  diagnostics: CatalogPackDiagnostic[]
): void {
  if (!isTrimmedLength(value, 1, 500)) {
    addError(
      diagnostics,
      "INVALID_PROVENANCE",
      path,
      "Provenance must be trimmed and 1..500 characters"
    )
  }
}

function validatePositiveDecimal(
  value: string,
  path: string,
  diagnostics: CatalogPackDiagnostic[],
  maxScale?: number
): boolean {
  const parsed = parseCanonicalDecimal(value, {
    allowNegative: false,
    allowZero: false,
    ...(maxScale === undefined ? {} : { maxScale })
  })
  if (!parsed.ok) {
    addError(diagnostics, "INVALID_DECIMAL", path, "Expected a positive canonical decimal")
    return false
  }
  return true
}

function validateNonNegativeDecimal(
  value: string,
  path: string,
  diagnostics: CatalogPackDiagnostic[]
): boolean {
  const parsed = parseCanonicalDecimal(value, { allowNegative: false, allowZero: true })
  if (!parsed.ok) {
    addError(diagnostics, "INVALID_DECIMAL", path, "Expected a non-negative canonical decimal")
    return false
  }
  return true
}

function validateEdibleFraction(
  value: string,
  path: string,
  diagnostics: CatalogPackDiagnostic[]
): void {
  const parsed = parseCanonicalDecimal(value, {
    allowNegative: false,
    allowZero: false,
    maxScale: 6
  })
  if (!parsed.ok || parsed.value.gt(1)) {
    addError(
      diagnostics,
      "INVALID_DECIMAL",
      path,
      "Edible fraction must be a canonical decimal in (0, 1]"
    )
  }
}

function validatePositiveVersion(
  value: number,
  path: string,
  diagnostics: CatalogPackDiagnostic[]
): void {
  if (!isPositiveSafeInteger(value)) {
    addError(diagnostics, "INVALID_VERSION", path, "Version must be a positive safe integer")
  }
}

function validateDuration(
  activeMinutes: number,
  elapsedMinutes: number,
  path: string,
  diagnostics: CatalogPackDiagnostic[]
): void {
  if (
    !isPositiveSafeInteger(activeMinutes) ||
    !isPositiveSafeInteger(elapsedMinutes) ||
    elapsedMinutes < activeMinutes ||
    elapsedMinutes > 180
  ) {
    addError(
      diagnostics,
      "INVALID_DURATION",
      path,
      "Active/elapsed minutes must be positive safe integers with active <= elapsed <= 180"
    )
  }
}

function validateContiguousOrder(
  items: readonly { readonly order: number }[],
  path: string,
  diagnostics: CatalogPackDiagnostic[]
): void {
  if (items.some((item, index) => !isPositiveSafeInteger(item.order) || item.order !== index + 1)) {
    addError(
      diagnostics,
      "INVALID_ORDER",
      path,
      "Order values must be contiguous from 1 in array order"
    )
  }
}

function duplicateValues(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

function validateUniqueCodes(
  values: readonly string[],
  path: string,
  diagnostics: CatalogPackDiagnostic[]
): void {
  if (duplicateValues(values)) {
    addError(diagnostics, "DUPLICATE_CATALOG_ENTRY", path, "Duplicate code is not allowed")
  }
}

function validateSupportedUnit(
  value: string,
  path: string,
  diagnostics: CatalogPackDiagnostic[],
  blockers: Set<string>
): void {
  validateCode(value, path, diagnostics)
  if (!LAUNCH_UNIT_SET.has(value)) {
    addError(diagnostics, "REFERENCE_CODE_UNSUPPORTED", path, `Unsupported launch unit: ${value}`)
    blockers.add("REFERENCE_CODE_UNSUPPORTED")
  }
}

function validateTopLevelFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void {
  validateCode(pack.catalogCode, "$.catalogCode", diagnostics)
  if (!isValidRfc3339(pack.preparedAt)) {
    addError(
      diagnostics,
      "INVALID_TIMESTAMP",
      "$.preparedAt",
      "preparedAt must be RFC3339 with an explicit offset or Z"
    )
  }
  validateLabel(pack.source.name, "$.source.name", diagnostics)
  validateProvenance(pack.source.provenance, "$.source.provenance", diagnostics)
}

function validateFoodFields(
  pack: CatalogPackV1,
  diagnostics: CatalogPackDiagnostic[],
  blockers: Set<string>
): void {
  validateUniqueCodes(
    pack.foods.map((food) => food.code),
    "$.foods",
    diagnostics
  )

  pack.foods.forEach((food, foodIndex) => {
    const path = `$.foods[${foodIndex}]`
    validateCode(food.code, `${path}.code`, diagnostics)
    validateLabel(food.nameVi, `${path}.nameVi`, diagnostics)
    validateSupportedUnit(food.baseUnitCode, `${path}.baseUnitCode`, diagnostics, blockers)

    const expectedDimension = UNIT_DIMENSIONS[food.baseUnitCode]
    if (expectedDimension !== undefined && expectedDimension !== food.baseDimension) {
      addError(
        diagnostics,
        "BASE_UNIT_DIMENSION_MISMATCH",
        `${path}.baseUnitCode`,
        `Unit ${food.baseUnitCode} is not valid for ${food.baseDimension}`
      )
    }

    validatePositiveVersion(food.fact.versionNumber, `${path}.fact.versionNumber`, diagnostics)
    validateCode(food.fact.categoryCode, `${path}.fact.categoryCode`, diagnostics)
    if (!LAUNCH_CATEGORY_SET.has(food.fact.categoryCode)) {
      addError(
        diagnostics,
        "REFERENCE_CODE_UNSUPPORTED",
        `${path}.fact.categoryCode`,
        `Unsupported launch category: ${food.fact.categoryCode}`
      )
      blockers.add("REFERENCE_CODE_UNSUPPORTED")
    }

    const ancestry = food.fact.categoryAncestry
    ancestry.forEach((categoryCode, ancestryIndex) => {
      validateCode(categoryCode, `${path}.fact.categoryAncestry[${ancestryIndex}]`, diagnostics)
      if (!LAUNCH_CATEGORY_SET.has(categoryCode)) {
        addError(
          diagnostics,
          "REFERENCE_CODE_UNSUPPORTED",
          `${path}.fact.categoryAncestry[${ancestryIndex}]`,
          `Unsupported launch category: ${categoryCode}`
        )
        blockers.add("REFERENCE_CODE_UNSUPPORTED")
      }
    })
    if (
      ancestry.length === 0 ||
      duplicateValues(ancestry) ||
      ancestry[0] !== food.fact.categoryCode ||
      ancestry.at(-1) !== "food"
    ) {
      addError(
        diagnostics,
        "INVALID_CATEGORY_ANCESTRY",
        `${path}.fact.categoryAncestry`,
        "Category ancestry must be unique, start with categoryCode, and end with food"
      )
    }

    validateEdibleFraction(food.fact.edibleFraction, `${path}.fact.edibleFraction`, diagnostics)
    validateProvenance(food.fact.provenance, `${path}.fact.provenance`, diagnostics)

    const allergenCodes = food.fact.allergenAssessments.map((assessment) => assessment.allergenCode)
    let allergenCoverageInvalid = duplicateValues(allergenCodes)
    if (duplicateValues(allergenCodes)) {
      addError(
        diagnostics,
        "DUPLICATE_CATALOG_ENTRY",
        `${path}.fact.allergenAssessments`,
        "Allergen codes must be unique per food fact"
      )
    }
    food.fact.allergenAssessments.forEach((assessment, assessmentIndex) => {
      const assessmentPath = `${path}.fact.allergenAssessments[${assessmentIndex}]`
      validateCode(assessment.allergenCode, `${assessmentPath}.allergenCode`, diagnostics)
      if (!LAUNCH_ALLERGEN_SET.has(assessment.allergenCode)) {
        addError(
          diagnostics,
          "REFERENCE_CODE_UNSUPPORTED",
          `${assessmentPath}.allergenCode`,
          `Unsupported launch allergen: ${assessment.allergenCode}`
        )
        blockers.add("REFERENCE_CODE_UNSUPPORTED")
        allergenCoverageInvalid = true
      }
      if (assessment.status === "unknown") {
        addError(
          diagnostics,
          "UNKNOWN_ALLERGEN_LINEAGE",
          `${assessmentPath}.status`,
          "Unknown allergen lineage is not allowed in a production catalog pack"
        )
        allergenCoverageInvalid = true
      }
      validateProvenance(assessment.provenance, `${assessmentPath}.provenance`, diagnostics)
    })
    if (
      allergenCodes.length !== LAUNCH_ALLERGEN_CODES.length ||
      LAUNCH_ALLERGEN_CODES.some((code) => !allergenCodes.includes(code))
    ) {
      allergenCoverageInvalid = true
    }
    if (allergenCoverageInvalid) {
      addError(
        diagnostics,
        "ALLERGEN_COVERAGE_INCOMPLETE",
        `${path}.fact.allergenAssessments`,
        "All ten launch allergens must have exactly one non-unknown assessment"
      )
      blockers.add("ALLERGEN_COVERAGE_INCOMPLETE")
    }

    const nutrientCodes = food.fact.nutrients.map((nutrient) => nutrient.nutrientCode)
    let nutritionCoverageInvalid = duplicateValues(nutrientCodes)
    if (duplicateValues(nutrientCodes)) {
      addError(
        diagnostics,
        "DUPLICATE_CATALOG_ENTRY",
        `${path}.fact.nutrients`,
        "Nutrient codes must be unique per food fact"
      )
    }
    food.fact.nutrients.forEach((nutrient, nutrientIndex) => {
      const nutrientPath = `${path}.fact.nutrients[${nutrientIndex}]`
      validateCode(nutrient.nutrientCode, `${nutrientPath}.nutrientCode`, diagnostics)
      if (!LAUNCH_REQUIRED_NUTRIENT_SET.has(nutrient.nutrientCode)) {
        addError(
          diagnostics,
          "REFERENCE_CODE_UNSUPPORTED",
          `${nutrientPath}.nutrientCode`,
          `Unsupported launch nutrient: ${nutrient.nutrientCode}`
        )
        blockers.add("REFERENCE_CODE_UNSUPPORTED")
        nutritionCoverageInvalid = true
      }
      validateNonNegativeDecimal(
        nutrient.amountPer100g,
        `${nutrientPath}.amountPer100g`,
        diagnostics
      )
      validateProvenance(nutrient.provenance, `${nutrientPath}.provenance`, diagnostics)
    })
    if (
      nutrientCodes.length !== LAUNCH_REQUIRED_NUTRIENT_CODES.length ||
      LAUNCH_REQUIRED_NUTRIENT_CODES.some((code) => !nutrientCodes.includes(code))
    ) {
      nutritionCoverageInvalid = true
    }
    if (nutritionCoverageInvalid) {
      addError(
        diagnostics,
        "REQUIRED_NUTRITION_COVERAGE_INCOMPLETE",
        `${path}.fact.nutrients`,
        "All required launch nutrients must be present exactly once"
      )
      blockers.add("REQUIRED_NUTRITION_COVERAGE_INCOMPLETE")
    }

    const conversionCodes = food.fact.conversions.map((conversion) => conversion.unitCode)
    if (duplicateValues(conversionCodes)) {
      addError(
        diagnostics,
        "DUPLICATE_CATALOG_ENTRY",
        `${path}.fact.conversions`,
        "Conversion unit codes must be unique per food fact"
      )
    }
    food.fact.conversions.forEach((conversion, conversionIndex) => {
      const conversionPath = `${path}.fact.conversions[${conversionIndex}]`
      validateSupportedUnit(
        conversion.unitCode,
        `${conversionPath}.unitCode`,
        diagnostics,
        blockers
      )
      validatePositiveDecimal(
        conversion.baseQuantityPerUnit,
        `${conversionPath}.baseQuantityPerUnit`,
        diagnostics
      )
      validatePositiveDecimal(
        conversion.grossGramsPerUnit,
        `${conversionPath}.grossGramsPerUnit`,
        diagnostics
      )
      validatePositiveDecimal(conversion.displayStep, `${conversionPath}.displayStep`, diagnostics)
      validateProvenance(conversion.provenance, `${conversionPath}.provenance`, diagnostics)
    })

    food.fact.dietaryTagCodes.forEach((code, index) => {
      validateCode(code, `${path}.fact.dietaryTagCodes[${index}]`, diagnostics)
    })
    validateUniqueCodes(food.fact.dietaryTagCodes, `${path}.fact.dietaryTagCodes`, diagnostics)
  })
}

function validateRecipeFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void {
  validateUniqueCodes(
    pack.recipes.map((recipe) => recipe.code),
    "$.recipes",
    diagnostics
  )

  pack.recipes.forEach((recipe, recipeIndex) => {
    const path = `$.recipes[${recipeIndex}]`
    validateCode(recipe.code, `${path}.code`, diagnostics)
    validateLabel(recipe.nameVi, `${path}.nameVi`, diagnostics)
    validatePositiveVersion(
      recipe.version.versionNumber,
      `${path}.version.versionNumber`,
      diagnostics
    )
    validatePositiveDecimal(
      recipe.version.yieldAdultEquivalent,
      `${path}.version.yieldAdultEquivalent`,
      diagnostics
    )
    validateDuration(
      recipe.version.activeMinutes,
      recipe.version.elapsedMinutes,
      `${path}.version`,
      diagnostics
    )

    validateContiguousOrder(recipe.version.ingredients, `${path}.version.ingredients`, diagnostics)
    validateUniqueCodes(
      recipe.version.ingredients.map((ingredient) => ingredient.ingredientCode),
      `${path}.version.ingredients`,
      diagnostics
    )
    recipe.version.ingredients.forEach((ingredient, ingredientIndex) => {
      const ingredientPath = `${path}.version.ingredients[${ingredientIndex}]`
      validateCode(ingredient.ingredientCode, `${ingredientPath}.ingredientCode`, diagnostics)
      validateCode(ingredient.foodCode, `${ingredientPath}.foodCode`, diagnostics)
      validatePositiveVersion(
        ingredient.foodFactVersionNumber,
        `${ingredientPath}.foodFactVersionNumber`,
        diagnostics
      )
      validatePositiveDecimal(ingredient.quantity, `${ingredientPath}.quantity`, diagnostics)
      validateCode(ingredient.unitCode, `${ingredientPath}.unitCode`, diagnostics)
      if (!LAUNCH_UNIT_SET.has(ingredient.unitCode)) {
        addError(
          diagnostics,
          "REFERENCE_CODE_UNSUPPORTED",
          `${ingredientPath}.unitCode`,
          `Unsupported launch unit: ${ingredient.unitCode}`
        )
      }
      if (
        ingredient.preparationNoteVi !== null &&
        !isTrimmedLength(ingredient.preparationNoteVi, 1, 120)
      ) {
        addError(
          diagnostics,
          "INVALID_LABEL",
          `${ingredientPath}.preparationNoteVi`,
          "Preparation note must be null or a trimmed 1..120 character label"
        )
      }
    })

    validateContiguousOrder(recipe.version.steps, `${path}.version.steps`, diagnostics)
    recipe.version.steps.forEach((step, stepIndex) => {
      const stepPath = `${path}.version.steps[${stepIndex}]`
      validateLabel(step.instructionVi, `${stepPath}.instructionVi`, diagnostics, 500)
      if (step.timerMinutes !== null && !isNonNegativeSafeInteger(step.timerMinutes)) {
        addError(
          diagnostics,
          "INVALID_DURATION",
          `${stepPath}.timerMinutes`,
          "Timer minutes must be null or a non-negative safe integer"
        )
      }
      step.ingredientCodes.forEach((code, ingredientCodeIndex) => {
        validateCode(code, `${stepPath}.ingredientCodes[${ingredientCodeIndex}]`, diagnostics)
      })
      validateUniqueCodes(step.ingredientCodes, `${stepPath}.ingredientCodes`, diagnostics)
    })

    recipe.version.tagCodes.forEach((code, tagIndex) => {
      validateCode(code, `${path}.version.tagCodes[${tagIndex}]`, diagnostics)
    })
    validateUniqueCodes(recipe.version.tagCodes, `${path}.version.tagCodes`, diagnostics)
  })
}

function validatePriceFields(
  pack: CatalogPackV1,
  diagnostics: CatalogPackDiagnostic[],
  blockers: Set<string>
): void {
  validatePositiveVersion(pack.priceBook.versionNumber, "$.priceBook.versionNumber", diagnostics)

  const effectiveFromValid = isValidDate(pack.priceBook.effectiveFrom)
  if (!effectiveFromValid) {
    addError(
      diagnostics,
      "INVALID_DATE",
      "$.priceBook.effectiveFrom",
      "effectiveFrom must be YYYY-MM-DD"
    )
  }
  const effectiveToValid =
    pack.priceBook.effectiveTo === null || isValidDate(pack.priceBook.effectiveTo)
  if (!effectiveToValid) {
    addError(
      diagnostics,
      "INVALID_DATE",
      "$.priceBook.effectiveTo",
      "effectiveTo must be null or YYYY-MM-DD"
    )
  }
  if (
    effectiveFromValid &&
    pack.priceBook.effectiveTo !== null &&
    effectiveToValid &&
    pack.priceBook.effectiveTo < pack.priceBook.effectiveFrom
  ) {
    addError(
      diagnostics,
      "INVALID_DATE_RANGE",
      "$.priceBook.effectiveTo",
      "effectiveTo must be greater than or equal to effectiveFrom"
    )
  }

  const priceKeys = pack.priceBook.prices.map(
    (price) => `${price.foodCode}:${price.foodFactVersionNumber}`
  )
  validateUniqueCodes(priceKeys, "$.priceBook.prices", diagnostics)

  pack.priceBook.prices.forEach((price, priceIndex) => {
    const path = `$.priceBook.prices[${priceIndex}]`
    validateCode(price.foodCode, `${path}.foodCode`, diagnostics)
    validatePositiveVersion(
      price.foodFactVersionNumber,
      `${path}.foodFactVersionNumber`,
      diagnostics
    )
    validatePositiveDecimal(price.packageQuantity, `${path}.packageQuantity`, diagnostics)
    validateSupportedUnit(price.packageUnitCode, `${path}.packageUnitCode`, diagnostics, blockers)
    validatePositiveDecimal(price.packageBaseQuantity, `${path}.packageBaseQuantity`, diagnostics)
    validateSupportedUnit(price.baseUnitCode, `${path}.baseUnitCode`, diagnostics, blockers)
    validatePositiveDecimal(price.purchaseIncrement, `${path}.purchaseIncrement`, diagnostics)

    if (!Number.isSafeInteger(price.packagePriceVnd) || price.packagePriceVnd <= 0) {
      addError(
        diagnostics,
        "INVALID_PRICE",
        `${path}.packagePriceVnd`,
        "VND price must be a positive safe integer"
      )
    }
    if (!isValidDate(price.observedAt)) {
      addError(diagnostics, "INVALID_DATE", `${path}.observedAt`, "observedAt must be YYYY-MM-DD")
    }
    if (
      !isTrimmedLength(price.sourceReference, 1, 500) ||
      PLACEHOLDER_SOURCE.test(price.sourceReference)
    ) {
      addError(
        diagnostics,
        "INVALID_SOURCE_REFERENCE",
        `${path}.sourceReference`,
        "Price source reference must be concrete, trimmed, and 1..500 characters"
      )
    }
  })
}

function validateMealOptionFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void {
  validateUniqueCodes(
    pack.mealOptions.map((meal) => meal.code),
    "$.mealOptions",
    diagnostics
  )

  pack.mealOptions.forEach((meal, mealIndex) => {
    const path = `$.mealOptions[${mealIndex}]`
    validateCode(meal.code, `${path}.code`, diagnostics)
    validateLabel(meal.nameVi, `${path}.nameVi`, diagnostics)
    validatePositiveVersion(
      meal.version.versionNumber,
      `${path}.version.versionNumber`,
      diagnostics
    )
    validatePositiveDecimal(
      meal.version.yieldAdultEquivalent,
      `${path}.version.yieldAdultEquivalent`,
      diagnostics
    )
    validateDuration(
      meal.version.activeMinutes,
      meal.version.elapsedMinutes,
      `${path}.version`,
      diagnostics
    )
    validateCode(meal.version.proteinHintCode, `${path}.version.proteinHintCode`, diagnostics)

    meal.version.cookingStyleCodes.forEach((code, styleIndex) => {
      validateCode(code, `${path}.version.cookingStyleCodes[${styleIndex}]`, diagnostics)
    })
    validateUniqueCodes(
      meal.version.cookingStyleCodes,
      `${path}.version.cookingStyleCodes`,
      diagnostics
    )
    if (meal.version.cookingStyleCodes.length === 0) {
      addError(
        diagnostics,
        "INVALID_CODE",
        `${path}.version.cookingStyleCodes`,
        "At least one cooking style code is required"
      )
    }

    meal.version.dishRoleCodes.forEach((code, roleIndex) => {
      validateCode(code, `${path}.version.dishRoleCodes[${roleIndex}]`, diagnostics)
    })
    validateUniqueCodes(meal.version.dishRoleCodes, `${path}.version.dishRoleCodes`, diagnostics)

    validateContiguousOrder(meal.version.components, `${path}.version.components`, diagnostics)
    validateUniqueCodes(
      meal.version.components.map((component) => component.recipeCode),
      `${path}.version.components`,
      diagnostics
    )
    meal.version.components.forEach((component, componentIndex) => {
      const componentPath = `${path}.version.components[${componentIndex}]`
      validateCode(component.recipeCode, `${componentPath}.recipeCode`, diagnostics)
      validatePositiveVersion(
        component.recipeVersionNumber,
        `${componentPath}.recipeVersionNumber`,
        diagnostics
      )
      validatePositiveDecimal(
        component.quantityMultiplier,
        `${componentPath}.quantityMultiplier`,
        diagnostics
      )
    })

    if (
      meal.version.components.length === 0 ||
      !meal.version.components.some((component) => component.mealRole === "main")
    ) {
      addError(
        diagnostics,
        "MEAL_MAIN_COMPONENT_REQUIRED",
        `${path}.version.components`,
        "Meal option must contain at least one main component"
      )
    }
  })
}

interface GraphResult {
  readonly reachableFoodCodes: ReadonlySet<string>
  readonly reachableRecipeCodes: ReadonlySet<string>
  readonly pricedReachableFoodCodes: ReadonlySet<string>
}

function hasDuplicateGraphKeys(pack: CatalogPackV1): boolean {
  const foodCodes = pack.foods.map((food) => food.code)
  const recipeCodes = pack.recipes.map((recipe) => recipe.code)
  const priceKeys = pack.priceBook.prices.map(
    (price) => `${price.foodCode}:${price.foodFactVersionNumber}`
  )
  return duplicateValues(foodCodes) || duplicateValues(recipeCodes) || duplicateValues(priceKeys)
}

function validateGraph(
  pack: CatalogPackV1,
  diagnostics: CatalogPackDiagnostic[],
  blockers: Set<string>
): GraphResult {
  const reachableFoodCodes = new Set<string>()
  const reachableRecipeCodes = new Set<string>()
  const pricedReachableFoodCodes = new Set<string>()

  if (hasDuplicateGraphKeys(pack)) {
    return { reachableFoodCodes, reachableRecipeCodes, pricedReachableFoodCodes }
  }

  const foodsByCode = new Map(pack.foods.map((food) => [food.code, food]))
  const recipesByCode = new Map(pack.recipes.map((recipe) => [recipe.code, recipe]))
  const priceByFoodVersion = new Map(
    pack.priceBook.prices.map((price) => [
      `${price.foodCode}:${price.foodFactVersionNumber}`,
      price
    ])
  )

  pack.recipes.forEach((recipe, recipeIndex) => {
    const recipePath = `$.recipes[${recipeIndex}].version`
    const ingredientCodes = new Set(
      recipe.version.ingredients.map((ingredient) => ingredient.ingredientCode)
    )
    const referencedIngredientCodes = new Set<string>()

    recipe.version.ingredients.forEach((ingredient, ingredientIndex) => {
      const ingredientPath = `${recipePath}.ingredients[${ingredientIndex}]`
      const food = foodsByCode.get(ingredient.foodCode)
      if (food === undefined) {
        addError(
          diagnostics,
          "UNRESOLVED_FOOD_REFERENCE",
          `${ingredientPath}.foodCode`,
          `Food ${ingredient.foodCode} does not exist in this catalog pack`
        )
        blockers.add("CATALOG_LINEAGE_INCOMPLETE")
        return
      }

      if (food.fact.versionNumber !== ingredient.foodFactVersionNumber) {
        addError(
          diagnostics,
          "FOOD_FACT_VERSION_MISMATCH",
          `${ingredientPath}.foodFactVersionNumber`,
          `Food ${ingredient.foodCode} is not pinned to its exact fact version`
        )
        blockers.add("CATALOG_LINEAGE_INCOMPLETE")
      }

      const unitPinned =
        ingredient.unitCode === food.baseUnitCode ||
        food.fact.conversions.some((conversion) => conversion.unitCode === ingredient.unitCode)
      if (!unitPinned) {
        addError(
          diagnostics,
          "UNPINNED_UNIT_CONVERSION",
          `${ingredientPath}.unitCode`,
          `Unit ${ingredient.unitCode} has no pinned conversion for ${ingredient.foodCode}`
        )
        blockers.add("CATALOG_LINEAGE_INCOMPLETE")
      }
    })

    recipe.version.steps.forEach((step, stepIndex) => {
      step.ingredientCodes.forEach((ingredientCode, ingredientCodeIndex) => {
        if (!ingredientCodes.has(ingredientCode)) {
          addError(
            diagnostics,
            "UNRESOLVED_INGREDIENT_REFERENCE",
            `${recipePath}.steps[${stepIndex}].ingredientCodes[${ingredientCodeIndex}]`,
            `Ingredient ${ingredientCode} does not exist in this recipe version`
          )
          blockers.add("CATALOG_LINEAGE_INCOMPLETE")
          return
        }
        referencedIngredientCodes.add(ingredientCode)
      })
    })

    recipe.version.ingredients.forEach((ingredient, ingredientIndex) => {
      if (!referencedIngredientCodes.has(ingredient.ingredientCode)) {
        addError(
          diagnostics,
          "UNUSED_RECIPE_INGREDIENT",
          `${recipePath}.ingredients[${ingredientIndex}].ingredientCode`,
          `Ingredient ${ingredient.ingredientCode} is not referenced by any recipe step`
        )
        blockers.add("CATALOG_LINEAGE_INCOMPLETE")
      }
    })
  })

  pack.mealOptions.forEach((meal, mealIndex) => {
    meal.version.components.forEach((component, componentIndex) => {
      const componentPath = `$.mealOptions[${mealIndex}].version.components[${componentIndex}]`
      const recipe = recipesByCode.get(component.recipeCode)
      if (recipe === undefined) {
        addError(
          diagnostics,
          "UNRESOLVED_RECIPE_REFERENCE",
          `${componentPath}.recipeCode`,
          `Recipe ${component.recipeCode} does not exist in this catalog pack`
        )
        blockers.add("CATALOG_LINEAGE_INCOMPLETE")
        return
      }

      if (recipe.version.versionNumber !== component.recipeVersionNumber) {
        addError(
          diagnostics,
          "RECIPE_VERSION_MISMATCH",
          `${componentPath}.recipeVersionNumber`,
          `Recipe ${component.recipeCode} is not pinned to its exact version`
        )
        blockers.add("CATALOG_LINEAGE_INCOMPLETE")
        return
      }

      reachableRecipeCodes.add(component.recipeCode)
    })
  })

  for (const recipeCode of reachableRecipeCodes) {
    const recipe = recipesByCode.get(recipeCode)
    if (recipe === undefined) continue
    for (const ingredient of recipe.version.ingredients) {
      const food = foodsByCode.get(ingredient.foodCode)
      if (food !== undefined && food.fact.versionNumber === ingredient.foodFactVersionNumber) {
        reachableFoodCodes.add(food.code)
      }
    }
  }

  for (const foodCode of reachableFoodCodes) {
    const food = foodsByCode.get(foodCode)
    if (food === undefined) continue
    const priceKey = `${food.code}:${food.fact.versionNumber}`
    if (priceByFoodVersion.has(priceKey)) {
      pricedReachableFoodCodes.add(food.code)
    } else {
      addError(
        diagnostics,
        "MISSING_REACHABLE_PRICE",
        `$.foods[${pack.foods.findIndex((item) => item.code === food.code)}].code`,
        `Reachable food ${food.code} has no exact-version price row`
      )
      blockers.add("PRICE_COVERAGE_INCOMPLETE")
    }
  }

  pack.recipes.forEach((recipe, recipeIndex) => {
    if (!reachableRecipeCodes.has(recipe.code)) {
      addWarning(
        diagnostics,
        "UNUSED_RECIPE",
        `$.recipes[${recipeIndex}].code`,
        `Recipe ${recipe.code} is not reachable from any meal option`
      )
    }
  })

  pack.foods.forEach((food, foodIndex) => {
    if (reachableFoodCodes.has(food.code)) return
    addWarning(
      diagnostics,
      "UNUSED_FOOD",
      `$.foods[${foodIndex}].code`,
      `Food ${food.code} is not reachable from any meal option`
    )
    const priceKey = `${food.code}:${food.fact.versionNumber}`
    if (!priceByFoodVersion.has(priceKey)) {
      addWarning(
        diagnostics,
        "UNUSED_FOOD_WITHOUT_PRICE",
        `$.foods[${foodIndex}].code`,
        `Unused food ${food.code} has no exact-version price row`
      )
    }
  })

  return { reachableFoodCodes, reachableRecipeCodes, pricedReachableFoodCodes }
}

export function validateCatalogPackValue(value: unknown): CatalogPackValidationCoreResult {
  const parsed = parseCatalogPackShape(value)
  if (!parsed.success) {
    return {
      pack: null,
      catalogCode: null,
      diagnostics: parsed.error.issues.map((issue) => ({
        severity: "error" as const,
        code: "INVALID_SHAPE",
        path: issuePath(issue.path),
        message: issue.message
      })),
      blockers: [],
      summary: ZERO_SUMMARY
    }
  }

  const pack = parsed.data
  const diagnostics: CatalogPackDiagnostic[] = []
  const blockers = new Set<string>()

  validateTopLevelFields(pack, diagnostics)
  validateFoodFields(pack, diagnostics, blockers)
  validateRecipeFields(pack, diagnostics)
  validatePriceFields(pack, diagnostics, blockers)
  validateMealOptionFields(pack, diagnostics)

  const graph = validateGraph(pack, diagnostics, blockers)
  const proteinGroups = new Set(pack.mealOptions.map((meal) => meal.version.proteinHintCode))
  if (pack.mealOptions.length < 21) blockers.add("MINIMUM_MEAL_OPTIONS_NOT_MET")
  if (proteinGroups.size < 3) {
    blockers.add("INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY")
  }

  return {
    pack,
    catalogCode: pack.catalogCode,
    diagnostics,
    blockers: [...blockers],
    summary: {
      foods: pack.foods.length,
      recipes: pack.recipes.length,
      priceRows: pack.priceBook.prices.length,
      mealOptions: pack.mealOptions.length,
      primaryProteinGroups: proteinGroups.size,
      reachableFoods: graph.reachableFoodCodes.size,
      pricedReachableFoods: graph.pricedReachableFoodCodes.size
    }
  }
}
