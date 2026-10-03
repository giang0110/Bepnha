import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../supabase/database.types.js"
import type { FoodQuantityPolicyV1 } from "../../domain/recipe/food-quantity-policy.js"
import {
  ExactDecimal,
  parseCanonicalDecimal,
  decimalToCanonical
} from "../../domain/shared/decimal.js"
export const PLANNER_MISSING_SCHEMA_CODES = new Set(["42703", "42P01", "42883", "PGRST202"])
export class PlannerDependencySchemaNotReadyError extends Error {
  readonly code = "DEPENDENCY_SCHEMA_NOT_READY"
  constructor() {
    super("DEPENDENCY_SCHEMA_NOT_READY")
    this.name = "PlannerDependencySchemaNotReadyError"
  }
}
export async function loadFoodQuantityPolicies(
  client: SupabaseClient<Database>,
  factVersionIds: readonly string[],
  pinnedPolicyIds?: readonly string[]
): Promise<readonly FoodQuantityPolicyV1[]> {
  const facts = new Set(factVersionIds),
    ids = [...new Set(pinnedPolicyIds ?? factVersionIds)].sort(),
    policies: FoodQuantityPolicyV1[] = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await client
      .from("food_quantity_policy_versions")
      .select(
        "id,food_fact_version_id,version_number,base_unit_id,base_dimension,food_form,step_base_quantity::text,rounding,provenance,content_hash,publication_status"
      )
      .eq("publication_status", "published")
      .in(
        pinnedPolicyIds === undefined ? "food_fact_version_id" : "id",
        ids.slice(offset, offset + 100)
      )
      .order("food_fact_version_id")
      .order("version_number", { ascending: false })
    if (error !== null) {
      if (PLANNER_MISSING_SCHEMA_CODES.has(error.code))
        throw new PlannerDependencySchemaNotReadyError()
      throw new Error("QUANTITY_POLICY_UNAVAILABLE")
    }
    for (const r of data ?? []) {
      const rawStep = String(r.step_base_quantity)
      if (!/^[0-9]+(\.[0-9]+)?$/u.test(rawStep)) throw new Error("INVALID_QUANTITY_POLICY_DATA")
      const step = parseCanonicalDecimal(decimalToCanonical(new ExactDecimal(rawStep)), {
        allowZero: false,
        allowNegative: false
      })
      if (
        !facts.has(r.food_fact_version_id) ||
        r.publication_status !== "published" ||
        !r.content_hash ||
        !/^[a-f0-9]{64}$/u.test(r.content_hash) ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(r.id) ||
        !Number.isInteger(r.version_number) ||
        r.version_number < 1 ||
        !step.ok ||
        !r.provenance.trim() ||
        ![
          "portionable_mass",
          "seasoning_mass",
          "divisible_volume",
          "whole_count",
          "whole_piece"
        ].includes(r.food_form) ||
        !["ceil", "half_up"].includes(r.rounding)
      )
        throw new Error("INVALID_QUANTITY_POLICY_DATA")
      policies.push({
        id: r.id,
        version: "food-quantity-v1",
        foodFactVersionId: r.food_fact_version_id,
        versionNumber: r.version_number,
        baseUnitId: r.base_unit_id,
        baseDimension: r.base_dimension,
        foodForm: r.food_form as FoodQuantityPolicyV1["foodForm"],
        stepBaseQuantity: decimalToCanonical(step.value),
        rounding: r.rounding as FoodQuantityPolicyV1["rounding"],
        provenance: r.provenance,
        contentHash: r.content_hash
      })
    }
  }
  const byFact = new Map<string, FoodQuantityPolicyV1>()
  for (const p of policies.toSorted(
    (a, b) => b.versionNumber - a.versionNumber || a.id.localeCompare(b.id)
  ))
    if (!byFact.has(p.foodFactVersionId)) byFact.set(p.foodFactVersionId, p)
  return [...byFact.values()].sort((a, b) => a.foodFactVersionId.localeCompare(b.foodFactVersionId))
}
