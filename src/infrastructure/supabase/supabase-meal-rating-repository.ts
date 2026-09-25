import type { SupabaseClient } from "@supabase/supabase-js"

import {
  MealRatingRepositoryError,
  type MealRating,
  type MealRatingRepository,
  type MealRatings
} from "@/application/meal-rating/meal-rating-repository"

import type { Database } from "./database.types.js"

interface RpcError {
  readonly code?: string | undefined
}

function failure(error: RpcError): MealRatingRepositoryError {
  return new MealRatingRepositoryError(
    error.code === "42501" ? "UNAUTHORIZED" : "DEPENDENCY_UNAVAILABLE"
  )
}

function ids(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []
}

export function createSupabaseMealRatingRepository(
  client: SupabaseClient<Database>
): MealRatingRepository {
  return {
    async load(householdId: string): Promise<MealRatings> {
      const { data, error } = await client.rpc("get_meal_option_ratings", {
        p_household_id: householdId
      })
      if (error !== null) throw failure(error)
      // A household with no opinions is the common case and is not a fault, so an answer that is
      // not an object reads as "nothing said" rather than as corrupt storage.
      if (typeof data !== "object" || data === null) return { liked: [], disliked: [] }
      const record = data as Record<string, unknown>
      return { liked: ids(record.liked), disliked: ids(record.disliked) }
    },
    async set(householdId: string, mealOptionId: string, rating: MealRating | null): Promise<void> {
      const { error } = await client.rpc("set_meal_option_rating", {
        p_household_id: householdId,
        p_meal_option_id: mealOptionId,
        // The generated types describe every argument by its SQL type, which cannot express that
        // this one accepts NULL — and NULL is exactly how a household withdraws an opinion. The
        // cast states what the function's own contract already allows.
        p_rating: rating as string
      })
      if (error !== null) throw failure(error)
    }
  }
}
