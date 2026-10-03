import { createHash } from "node:crypto"
import type { CatalogDimension } from "../../domain/catalog/catalog.js"
import type { FoodPriceInput } from "../../domain/pricing/pricing.js"
import type { FoodPriceInputV2 } from "../../domain/pricing/purchasing-v2.js"
/** Published legacy quotes already specify fixed packages. This adapter preserves that contract. */
export function legacyFixedPackPriceV2(
  price: FoodPriceInput,
  baseDimension: CatalogDimension,
  sourceReference: string
): FoodPriceInputV2 {
  if (!sourceReference.trim()) throw new Error("LEGACY_PRICE_SOURCE_REQUIRED")
  const contract = [
    "legacy-fixed-pack-v1",
    price.foodPriceId,
    price.priceBookId,
    price.foodId,
    price.foodFactVersionId,
    price.baseUnitId,
    baseDimension,
    price.packageBaseQuantity,
    String(price.packagePriceVnd),
    price.purchaseIncrement,
    price.observedAt,
    sourceReference
  ].join("|")
  return {
    version: "purchase-v2",
    foodPriceId: price.foodPriceId,
    priceBookId: price.priceBookId,
    foodId: price.foodId,
    foodFactVersionId: price.foodFactVersionId,
    baseUnitId: price.baseUnitId,
    baseDimension,
    quoteBaseQuantity: price.packageBaseQuantity,
    quotePriceVnd: price.packagePriceVnd,
    purchaseRule: { mode: "fixed_pack", packIncrement: price.purchaseIncrement },
    purchaseProvenance: `Published legacy fixed-pack terms: ${sourceReference}`,
    purchaseTermsContentHash: createHash("sha256").update(contract, "utf8").digest("hex"),
    observedAt: price.observedAt
  }
}
