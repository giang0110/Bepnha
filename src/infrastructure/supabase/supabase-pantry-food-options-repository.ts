import { ExactDecimal, decimalToCanonical } from "../../domain/shared/decimal.js"
import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  PantryFoodOption,
  PantryFoodOptionsRepository
} from "@/application/pantry/pantry-food-options-repository"

import type { Database } from "./database.types.js"

const VI_COLLATOR = new Intl.Collator("vi", { sensitivity: "base" })

function dependencyFailure(): never {
  throw new Error("PANTRY_FOOD_OPTIONS_UNAVAILABLE")
}

export function createSupabasePantryFoodOptionsRepository(
  client: SupabaseClient<Database>
): PantryFoodOptionsRepository {
  return {
    async load() {
      const foodsResult = await client
        .from("foods")
        .select("id,name_vi,current_fact_version_id,base_unit_id")
        .eq("status", "published")
        .not("current_fact_version_id", "is", null)

      if (foodsResult.error !== null) dependencyFailure()
      const foods = foodsResult.data ?? []
      const factIds = foods
        .map((food) => food.current_fact_version_id)
        .filter((value): value is string => value !== null)

      if (factIds.length === 0) return []

      const [conversionsResult, unitsResult] = await Promise.all([
        client
          .from("food_fact_unit_conversions")
          .select("food_fact_version_id,unit_id,base_quantity_per_unit::text")
          .in("food_fact_version_id", factIds),
        client.from("units").select("id,code,name_vi,dimension,to_dimension_base")
      ])

      if (conversionsResult.error !== null || unitsResult.error !== null) dependencyFailure()
      const conversions = conversionsResult.data ?? []
      const unitById = new Map((unitsResult.data ?? []).map((unit) => [unit.id, unit]))

      const { loadFoodQuantityPolicies, PlannerDependencySchemaNotReadyError } =
        await import("../server/load-food-quantity-policies.js")
      const policies = await loadFoodQuantityPolicies(client, factIds).catch((error: unknown) => {
        if (error instanceof PlannerDependencySchemaNotReadyError) return []
        throw error
      })
      const options: PantryFoodOption[] = foods.map((food) => {
        const foodFactVersionId = food.current_fact_version_id
        if (foodFactVersionId === null) dependencyFailure()
        const policy = policies.find(
          (p) =>
            p.foodFactVersionId === foodFactVersionId &&
            ["whole_piece", "whole_count"].includes(p.foodForm)
        )
        let piece: string | undefined
        if (policy?.foodForm === "whole_count") {
          const base = unitById.get(food.base_unit_id)
          if (!base || !base.to_dimension_base) dependencyFailure()
          piece = decimalToCanonical(new ExactDecimal(1).div(base.to_dimension_base))
        } else if (policy?.foodForm === "whole_piece") {
          const countConversions = conversions.filter(
            (c) =>
              c.food_fact_version_id === foodFactVersionId &&
              unitById.get(c.unit_id)?.dimension === "count"
          )
          const values = countConversions.map((c) =>
            decimalToCanonical(
              new ExactDecimal(c.base_quantity_per_unit).div(
                unitById.get(c.unit_id)!.to_dimension_base
              )
            )
          )
          if (!values.length || new Set(values).size !== 1) dependencyFailure()
          piece = values[0]
        }
        const units = conversions
          .filter((conversion) => conversion.food_fact_version_id === foodFactVersionId)
          .map((conversion) => {
            const unit = unitById.get(conversion.unit_id)
            if (unit === undefined) dependencyFailure()
            return {
              ...(policy ? { baseQuantityPerUnit: String(conversion.base_quantity_per_unit) } : {}),
              unitId: unit.id,
              unitCode: unit.code,
              unitNameVi: unit.name_vi
            }
          })
          .sort((left, right) => left.unitCode.localeCompare(right.unitCode))

        if (units.length === 0) dependencyFailure()
        return {
          ...(policy && piece
            ? {
                wholeUnitPolicy: {
                  policyId: policy.id,
                  contentHash: policy.contentHash,
                  baseQuantityPerPiece: piece
                }
              }
            : {}),
          foodId: food.id,
          foodNameVi: food.name_vi,
          foodFactVersionId,
          baseUnitId: food.base_unit_id,
          units
        }
      })

      return options.sort((left, right) => {
        const byName = VI_COLLATOR.compare(left.foodNameVi, right.foodNameVi)
        return byName !== 0 ? byName : left.foodId.localeCompare(right.foodId)
      })
    }
  }
}
