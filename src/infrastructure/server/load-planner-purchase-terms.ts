import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../supabase/database.types.js"
import type { PlannerCandidateInput } from "../../domain/planner/planner-input.js"
import type { FoodPriceInputV2 } from "../../domain/pricing/purchasing-v2.js"
import { normalizeFoodPriceV2 } from "../../domain/pricing/purchasing-v2.js"
import { ExactDecimal, decimalToCanonical } from "../../domain/shared/decimal.js"
import { legacyFixedPackPriceV2 } from "./legacy-fixed-pack-terms.js"
import {
  PLANNER_MISSING_SCHEMA_CODES,
  PlannerDependencySchemaNotReadyError
} from "./load-food-quantity-policies.js"
const decimal = (v: unknown) => {
  if ((typeof v !== "string" && typeof v !== "number") || !/^[0-9]+(\.[0-9]+)?$/u.test(String(v)))
    throw new Error("INVALID_PURCHASE_TERMS_DATA")
  return decimalToCanonical(new ExactDecimal(v))
}
export async function loadPlannerPurchaseTerms(
  client: SupabaseClient<Database>,
  candidates: readonly PlannerCandidateInput[],
  priceBookId: string
): Promise<ReadonlyMap<string, FoodPriceInputV2>> {
  const book = await client
    .from("price_books")
    .select("purchase_contract_version,publication_status")
    .eq("id", priceBookId)
    .maybeSingle()
  if (book.error !== null) {
    if (PLANNER_MISSING_SCHEMA_CODES.has(book.error.code))
      throw new PlannerDependencySchemaNotReadyError()
    throw new Error("PRICE_BOOK_UNAVAILABLE")
  }
  if (book.data?.publication_status !== "published") throw new Error("PRICE_BOOK_NOT_PUBLISHED")
  const priceById = new Map(candidates.flatMap((c) => c.prices).map((p) => [p.foodPriceId, p])),
    ids = [...priceById.keys()].sort(),
    mapped = new Map<string, FoodPriceInputV2>()
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100)
    const [prices, terms] = await Promise.all([
      client
        .from("food_prices")
        .select("id,source_reference")
        .eq("price_book_id", priceBookId)
        .in("id", batch),
      client
        .from("food_price_purchase_terms")
        .select(
          "food_price_id,price_book_id,version,base_dimension,purchase_mode,pack_increment::text,sale_step_base_quantity::text,provenance,content_hash"
        )
        .eq("price_book_id", priceBookId)
        .in("food_price_id", batch)
    ])
    for (const result of [prices, terms])
      if (result.error !== null) {
        if (PLANNER_MISSING_SCHEMA_CODES.has(result.error.code))
          throw new PlannerDependencySchemaNotReadyError()
        throw new Error("PURCHASE_TERMS_UNAVAILABLE")
      }
    for (const id of batch) {
      const p = priceById.get(id)!,
        source = prices.data?.find((r) => r.id === id),
        t = terms.data?.find((r) => r.food_price_id === id),
        lineage = candidates.flatMap((c) => c.ingredientLineage).find((l) => l.foodId === p.foodId)
      if (!source || !lineage) throw new Error("PRICE_LINEAGE_UNAVAILABLE")
      let v: FoodPriceInputV2
      if (book.data.purchase_contract_version === null) {
        if (t !== undefined) throw new Error("INVALID_LEGACY_PURCHASE_TERMS")
        v = legacyFixedPackPriceV2(p, lineage.baseDimension, source.source_reference)
      } else {
        if (
          !t ||
          t.version !== "purchase-v2" ||
          !t.content_hash ||
          t.price_book_id !== priceBookId ||
          t.base_dimension !== lineage.baseDimension
        )
          throw new Error("PUBLISHED_PURCHASE_TERMS_REQUIRED")
        const rule: FoodPriceInputV2["purchaseRule"] | null =
          t.purchase_mode === "fixed_pack" && t.sale_step_base_quantity === null
            ? { mode: "fixed_pack" as const, packIncrement: decimal(t.pack_increment) }
            : (t.purchase_mode === "loose_mass" || t.purchase_mode === "loose_count") &&
                t.pack_increment === null
              ? { mode: t.purchase_mode, saleStepBaseQuantity: decimal(t.sale_step_base_quantity) }
              : null
        if (!rule || book.data.purchase_contract_version !== "purchase-v2")
          throw new Error("INVALID_PURCHASE_TERMS_DATA")
        v = {
          version: "purchase-v2",
          foodPriceId: p.foodPriceId,
          priceBookId: p.priceBookId,
          foodId: p.foodId,
          foodFactVersionId: p.foodFactVersionId,
          baseUnitId: p.baseUnitId,
          baseDimension: t.base_dimension,
          quoteBaseQuantity: p.packageBaseQuantity,
          quotePriceVnd: p.packagePriceVnd,
          purchaseRule: rule,
          purchaseProvenance: t.provenance,
          purchaseTermsContentHash: t.content_hash,
          observedAt: p.observedAt
        }
      }
      const n = normalizeFoodPriceV2(v)
      if (!n.ok) throw new Error("INVALID_PURCHASE_TERMS_DATA")
      mapped.set(id, n.value)
    }
  }
  return mapped
}
