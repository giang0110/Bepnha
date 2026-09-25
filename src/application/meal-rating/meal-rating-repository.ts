export type MealRating = "liked" | "disliked"

export type MealRatingRepositoryErrorCode =
  "UNAUTHORIZED" | "DEPENDENCY_UNAVAILABLE" | "INVALID_STORED_DATA"

export class MealRatingRepositoryError extends Error {
  readonly code: MealRatingRepositoryErrorCode

  constructor(code: MealRatingRepositoryErrorCode) {
    super("Meal rating repository request failed.")
    this.name = "MealRatingRepositoryError"
    this.code = code
  }
}

/**
 * What a household thinks of individual meals.
 *
 * Grouped rather than a map because that is the shape the planner scores with, and because a meal
 * with no entry is not "rated neutral" — nobody has said anything about it, which is why clearing a
 * rating removes the row rather than storing a third value.
 */
export interface MealRatings {
  readonly liked: readonly string[]
  readonly disliked: readonly string[]
}

export interface MealRatingRepository {
  load(householdId: string): Promise<MealRatings>
  /** `null` clears the rating, putting the meal back to nothing-said. */
  set(householdId: string, mealOptionId: string, rating: MealRating | null): Promise<void>
}
