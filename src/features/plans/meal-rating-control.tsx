import type { MealRating } from "@/application/meal-rating/meal-rating-repository"

/**
 * What the household thought of this meal.
 *
 * Two buttons rather than stars: the planner only understands liked and disliked, and offering a
 * five-point scale would promise a precision the scoring does not have. Pressing the active one
 * again withdraws the opinion, because "I no longer mind" is a real thing to want to say and the
 * alternative is a rating nobody can take back.
 */
export function MealRatingControl({
  mealOptionId,
  rating,
  onRate
}: Readonly<{
  mealOptionId: string
  rating: MealRating | null
  onRate: (mealOptionId: string, rating: MealRating | null) => void
}>) {
  const choices: readonly { readonly value: MealRating; readonly label: string }[] = [
    { value: "liked", label: "Thích món này" },
    { value: "disliked", label: "Không thích" }
  ]
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
      <span className="text-xs font-semibold text-ink-soft">Gia đình thấy sao?</span>
      {choices.map((choice) => (
        <button
          aria-pressed={rating === choice.value}
          className={`min-h-11 rounded-full px-4 text-sm font-bold transition-colors ${
            rating === choice.value
              ? "bg-herb-600 text-white"
              : "bg-paper-raised text-ink-soft hover:text-ink"
          }`}
          key={choice.value}
          type="button"
          onClick={() => onRate(mealOptionId, rating === choice.value ? null : choice.value)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  )
}
