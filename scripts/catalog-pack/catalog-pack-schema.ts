import { z } from "zod"

const codeSchema = z.string()
const decimalTextSchema = z.string()
const labelSchema = z.string()

const foodSchema = z.strictObject({
  code: codeSchema,
  nameVi: labelSchema,
  baseDimension: z.enum(["mass", "volume", "count"]),
  baseUnitCode: codeSchema,
  fact: z.strictObject({
    versionNumber: z.number(),
    categoryCode: codeSchema,
    categoryAncestry: z.array(codeSchema),
    edibleFraction: decimalTextSchema,
    provenance: labelSchema,
    allergenAssessments: z.array(
      z.strictObject({
        allergenCode: codeSchema,
        status: z.enum(["absent", "contains", "may_contain", "unknown"]),
        provenance: labelSchema
      })
    ),
    nutrients: z.array(
      z.strictObject({
        nutrientCode: codeSchema,
        amountPer100g: decimalTextSchema,
        provenance: labelSchema
      })
    ),
    dietaryTagCodes: z.array(codeSchema),
    conversions: z.array(
      z.strictObject({
        unitCode: codeSchema,
        baseQuantityPerUnit: decimalTextSchema,
        grossGramsPerUnit: decimalTextSchema,
        displayStep: decimalTextSchema,
        provenance: labelSchema
      })
    )
  })
})

const recipeSchema = z.strictObject({
  code: codeSchema,
  nameVi: labelSchema,
  version: z.strictObject({
    versionNumber: z.number(),
    yieldAdultEquivalent: decimalTextSchema,
    activeMinutes: z.number(),
    elapsedMinutes: z.number(),
    ingredients: z.array(
      z.strictObject({
        ingredientCode: codeSchema,
        foodCode: codeSchema,
        foodFactVersionNumber: z.number(),
        quantity: decimalTextSchema,
        unitCode: codeSchema,
        preparationNoteVi: z.string().nullable(),
        order: z.number()
      })
    ),
    steps: z.array(
      z.strictObject({
        order: z.number(),
        instructionVi: labelSchema,
        timerMinutes: z.number().nullable(),
        ingredientCodes: z.array(codeSchema)
      })
    ),
    tagCodes: z.array(codeSchema)
  })
})

const priceSchema = z.strictObject({
  foodCode: codeSchema,
  foodFactVersionNumber: z.number(),
  packageQuantity: decimalTextSchema,
  packageUnitCode: codeSchema,
  packageBaseQuantity: decimalTextSchema,
  baseUnitCode: codeSchema,
  packagePriceVnd: z.number(),
  purchaseIncrement: decimalTextSchema,
  observedAt: z.string(),
  sourceReference: labelSchema
})

const priceBookSchema = z.strictObject({
  regionCode: z.literal("vn_baseline"),
  versionNumber: z.number(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  prices: z.array(priceSchema)
})

const mealOptionSchema = z.strictObject({
  code: codeSchema,
  nameVi: labelSchema,
  version: z.strictObject({
    versionNumber: z.number(),
    yieldAdultEquivalent: decimalTextSchema,
    activeMinutes: z.number(),
    elapsedMinutes: z.number(),
    proteinHintCode: codeSchema,
    cookingStyleCodes: z.array(codeSchema),
    dishRoleCodes: z.array(codeSchema),
    components: z.array(
      z.strictObject({
        recipeCode: codeSchema,
        recipeVersionNumber: z.number(),
        quantityMultiplier: decimalTextSchema,
        mealRole: z.enum(["staple", "main", "vegetable", "soup", "side"]),
        order: z.number()
      })
    )
  })
})

const catalogPackSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  catalogCode: z.string(),
  preparedAt: z.string(),
  source: z.strictObject({ name: z.string(), provenance: z.string() }),
  foods: z.array(foodSchema),
  recipes: z.array(recipeSchema),
  priceBook: priceBookSchema,
  mealOptions: z.array(mealOptionSchema)
})

export function parseCatalogPackShape(value: unknown) {
  return catalogPackSchema.safeParse(value)
}
