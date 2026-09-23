export const PLANNER_CONFIG_V1 = {
  version: "planner-v1",
  dayCount: 7,
  mealSlot: "primary",
  candidateLimit: 500,
  frontier: { maxSize: 250, qualitySize: 125, costSize: 125 },
  hard: {
    maxSameMealOptionIdentity: 1,
    disallowAdjacentSharedMainRecipe: true
  },
  scoringWeights: {
    diversity: 3500,
    nutritionComposition: 2500,
    ingredientReuseAndLeftover: 2500,
    preferences: 1500,
    /**
     * Repeating a meal the household cooked in the last few weeks.
     *
     * Weighted above every other diversity term because this is the complaint that makes people
     * abandon a meal planner: the first month is fine, and then it is the same eight dinners
     * forever. It is a penalty rather than a bar, deliberately — see `recentWeekLookback`.
     */
    recentWeekRepetition: 2000
  },
  /**
   * How many weeks back count as "recently cooked".
   *
   * Two, which is fourteen meals. A hard exclusion over that window would be the obvious design and
   * the wrong one: a catalogue only a little larger than fourteen would have no complete week left
   * to find, and the planner would answer NO_COMPLETE_PLAN_FOUND rather than repeat a dish. A
   * penalty degrades instead — with a big catalogue nothing repeats, with a small one the planner
   * still returns a week and pays for the repetition.
   */
  recentWeekLookback: 2,
  diversityWeights: {
    primaryProteinRepetition: 1500,
    primaryCookingStyleVariety: 1000,
    adjacentPrimaryProteinReuse: 1000
  },
  reuseWeights: {
    distinctFoodReuse: 800,
    packageLeftover: 1200,
    pantryReuse: 500
  },
  ignoredReuseCategoryCodes: ["staple", "seasoning"]
} as const

export type PlannerConfigV1 = typeof PLANNER_CONFIG_V1
