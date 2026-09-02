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
          .select("food_fact_version_id,unit_id")
          .in("food_fact_version_id", factIds),
        client.from("units").select("id,code,name_vi")
      ])

      if (conversionsResult.error !== null || unitsResult.error !== null) dependencyFailure()
      const conversions = conversionsResult.data ?? []
      const unitById = new Map((unitsResult.data ?? []).map((unit) => [unit.id, unit]))

      const options: PantryFoodOption[] = foods.map((food) => {
        const foodFactVersionId = food.current_fact_version_id
        if (foodFactVersionId === null) dependencyFailure()
        const units = conversions
          .filter((conversion) => conversion.food_fact_version_id === foodFactVersionId)
          .map((conversion) => {
            const unit = unitById.get(conversion.unit_id)
            if (unit === undefined) dependencyFailure()
            return {
              unitId: unit.id,
              unitCode: unit.code,
              unitNameVi: unit.name_vi
            }
          })
          .sort((left, right) => left.unitCode.localeCompare(right.unitCode))

        if (units.length === 0) dependencyFailure()
        return {
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
