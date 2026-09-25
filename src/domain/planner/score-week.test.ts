import { describe, expect, test } from "vitest"

import { calculatePurchaseBasket } from "@/domain/pricing/calculate-purchase-basket"

import { evaluatePlannerEligibility } from "./evaluate-eligibility"
import { normalizePlannerInput } from "./normalize-planner-input"
import { plannerCandidate, plannerInput } from "./planner-test-fixture"
import { scoreWeeklyPlan } from "./score-week"

function option(id: string, protein: string) {
  const candidate = plannerCandidate(id)
  const changed = {
    ...candidate,
    mealOption: {
      ...candidate.mealOption,
      tags: candidate.mealOption.tags.map((tag) =>
        tag.kind === "protein_hint" ? { ...tag, code: protein } : tag
      )
    }
  }
  const input = normalizePlannerInput(plannerInput([changed]))
  if (!input.ok) throw new Error("invalid fixture")
  const result = evaluatePlannerEligibility(input.value)
  if (!result.ok) throw new Error("ineligible fixture")
  return result.value.eligible[0]!
}

function basket(options: ReturnType<typeof option>[]) {
  const prices = options.flatMap((item) => item.prices)
  const result = calculatePurchaseBasket(
    options.flatMap((item) => item.requirements),
    prices,
    "2026-08-26"
  )
  if (!result.ok) throw new Error("invalid basket")
  return result.value
}

describe("scoreWeeklyPlan", () => {
  test("makes primary-protein repetition a strictly monotonic soft penalty", () => {
    const diverse = ["poultry", "beef", "pork", "fish", "tofu", "egg", "seafood"].map(
      (protein, index) => option(`diverse-${index}-v1`, protein)
    )
    const repeated = diverse.map((item) => ({ ...item, primaryProteinGroup: "poultry" }))
    const diverseScore = scoreWeeklyPlan(diverse, basket(diverse), [])
    const repeatedScore = scoreWeeklyPlan(repeated, basket(repeated), [])
    expect(repeatedScore.metrics.repeatedPrimaryProteinOccurrences).toBe(6)
    expect(repeatedScore.components.primaryProteinRepetition).toBeGreaterThan(
      diverseScore.components.primaryProteinRepetition
    )
  })

  test("treats a fully pantry-covered zero-purchase line as zero package leftover", () => {
    const selected = option("covered-v1", "poultry")
    const price = selected.prices[0]!
    const result = calculatePurchaseBasket(
      selected.requirements,
      selected.prices,
      "2026-08-26",
      undefined,
      [
        {
          foodId: price.foodId,
          baseUnitId: price.baseUnitId,
          availableBaseQuantity: "100000"
        }
      ]
    )
    if (!result.ok) throw new Error("invalid pantry-covered basket")
    expect(result.value.lines[0]).toMatchObject({
      purchaseRequiredBaseQuantity: "0",
      purchaseBaseQuantity: "0",
      leftoverBaseQuantity: "0"
    })

    const score = scoreWeeklyPlan([selected], result.value, [])
    expect(score.components.packageLeftover).toBe(0)
    expect(Number.isSafeInteger(score.totalQualityPenalty)).toBe(true)
  })

  test("scores transparent role/diversity/reuse/preferences without budget or medical terms", () => {
    const options = Array.from({ length: 7 }, (_, index) => option(`score-${index}-v1`, "poultry"))
    const score = scoreWeeklyPlan(options, basket(options), ["prefer_soup"])
    expect(score.totalQualityPenalty).toBeGreaterThan(0)
    expect(score.explanations).toEqual([
      "DIVERSITY_PRIMARY_PROTEIN_REPETITION",
      "DIVERSITY_COOKING_STYLE_VARIETY",
      "DIVERSITY_ADJACENT_PRIMARY_PROTEIN",
      "COMPOSITION_MEAL_ROLES",
      "REUSE_DISTINCT_FOODS",
      "REUSE_PACKAGE_LEFTOVER",
      "REUSE_PANTRY_COVERAGE",
      "PREFERENCES_MATCH",
      "DIVERSITY_RECENT_WEEK_REPETITION",
      "PREFERENCES_MEAL_RATING"
    ])
    expect(JSON.stringify(score)).not.toMatch(/budget|healthy|medical|adequacy/i)
  })
})

describe("scoreWeeklyPlan and recently cooked meals", () => {
  const week = [
    option("recent-0-v1", "protein_poultry"),
    option("recent-1-v1", "protein_pork"),
    option("recent-2-v1", "protein_seafood"),
    option("recent-3-v1", "protein_poultry"),
    option("recent-4-v1", "protein_pork"),
    option("recent-5-v1", "protein_seafood"),
    option("recent-6-v1", "protein_poultry")
  ]

  test("scores a week the same as before when no history is stated", () => {
    // An input built before this field existed must plan the week it always did.
    expect(scoreWeeklyPlan(week, basket(week), []).totalQualityPenalty).toBe(
      scoreWeeklyPlan(week, basket(week), [], undefined, [], []).totalQualityPenalty
    )
  })

  test("charges for each meal the household cooked in the lookback window", () => {
    const clean = scoreWeeklyPlan(week, basket(week), [], undefined, [], [])
    const oneRepeat = scoreWeeklyPlan(
      week,
      basket(week),
      [],
      undefined,
      [],
      [week[0]!.mealOptionId]
    )
    const twoRepeats = scoreWeeklyPlan(
      week,
      basket(week),
      [],
      undefined,
      [],
      [week[0]!.mealOptionId, week[3]!.mealOptionId]
    )

    expect(clean.components.recentWeekRepetition).toBe(0)
    expect(oneRepeat.components.recentWeekRepetition).toBeGreaterThan(0)
    expect(twoRepeats.components.recentWeekRepetition).toBeGreaterThan(
      oneRepeat.components.recentWeekRepetition
    )
    expect(twoRepeats.metrics.recentlyCookedOccurrences).toBe(2)
  })

  test("ignores a history entry the week does not contain", () => {
    const score = scoreWeeklyPlan(week, basket(week), [], undefined, [], ["never-cooked-here"])

    expect(score.metrics.recentlyCookedOccurrences).toBe(0)
    expect(score.components.recentWeekRepetition).toBe(0)
  })

  test("counts a meal once however many times the history names it", () => {
    // History is a list of weeks flattened, so the same dish appears once per week it was cooked.
    // The week being scored contains it once, and that is what is being charged for.
    const once = scoreWeeklyPlan(week, basket(week), [], undefined, [], [week[0]!.mealOptionId])
    const listedTwice = scoreWeeklyPlan(
      week,
      basket(week),
      [],
      undefined,
      [],
      [week[0]!.mealOptionId, week[0]!.mealOptionId]
    )

    expect(listedTwice.components.recentWeekRepetition).toBe(once.components.recentWeekRepetition)
    expect(listedTwice.metrics.recentlyCookedOccurrences).toBe(1)
  })

  test("caps the penalty when every meal is a repeat rather than letting it run away", () => {
    const allRepeated = scoreWeeklyPlan(
      week,
      basket(week),
      [],
      undefined,
      [],
      week.map((item) => item.mealOptionId)
    )

    expect(allRepeated.metrics.recentlyCookedOccurrences).toBe(7)
    expect(allRepeated.components.recentWeekRepetition).toBe(2000)
  })

  test("names the new penalty in the explanations so a plan can be read back", () => {
    expect(scoreWeeklyPlan(week, basket(week), []).explanations).toContain(
      "DIVERSITY_RECENT_WEEK_REPETITION"
    )
  })

  test("prefers meals the household liked and charges for the ones it disliked", () => {
    const week = ["poultry", "beef", "pork", "fish", "tofu", "egg", "seafood"].map(
      (protein, index) => option(`rated-${index}-v1`, protein)
    )
    const ids = week.map((item) => item.mealOptionId)
    const purchases = basket(week)

    const allLiked = scoreWeeklyPlan(week, purchases, [], undefined, [], [], {
      liked: ids,
      disliked: []
    })
    // "Unrated" here means this week's meals carry no opinion, not that the household has none at
    // all — the second is a different case, covered below, and it costs nothing.
    const unrated = scoreWeeklyPlan(week, purchases, [], undefined, [], [], {
      liked: ["some-other-meal-the-household-liked"],
      disliked: []
    })
    const allDisliked = scoreWeeklyPlan(week, purchases, [], undefined, [], [], {
      liked: [],
      disliked: ids
    })

    // Monotone across the three: a week of loved meals costs nothing, a week of rejected ones costs
    // the most, and a week nobody has an opinion on sits between.
    expect(allLiked.components.mealRating).toBe(0)
    expect(unrated.components.mealRating).toBeGreaterThan(allLiked.components.mealRating)
    expect(allDisliked.components.mealRating).toBeGreaterThan(unrated.components.mealRating)
    expect(allDisliked.metrics.dislikedOccurrences).toBe(7)
    expect(allLiked.metrics.likedOccurrences).toBe(7)
  })

  test("charges a household that has rated nothing exactly nothing", () => {
    const week = ["poultry", "beef", "pork", "fish", "tofu", "egg", "seafood"].map(
      (protein, index) => option(`silent-${index}-v1`, protein)
    )
    // Most households never rate anything. Carrying a standing penalty for that would be a charge
    // for silence, and it would show up in a plan summary as a fault the household cannot fix.
    const score = scoreWeeklyPlan(week, basket(week), [], undefined, [], [], {
      liked: [],
      disliked: []
    })
    expect(score.components.mealRating).toBe(0)
  })

  test("never lets a rating decide whether a meal may be served at all", () => {
    // Ratings are taste, not safety. Scoring may push a disliked meal down the list; only allergies
    // and explicit exclusions remove it, and those are settled before scoring ever runs.
    const week = ["poultry", "beef", "pork", "fish", "tofu", "egg", "seafood"].map(
      (protein, index) => option(`still-eligible-${index}-v1`, protein)
    )
    const score = scoreWeeklyPlan(week, basket(week), [], undefined, [], [], {
      liked: [],
      disliked: week.map((item) => item.mealOptionId)
    })
    expect(score.totalQualityPenalty).toBeGreaterThan(0)
    expect(Number.isFinite(score.totalQualityPenalty)).toBe(true)
  })
})
