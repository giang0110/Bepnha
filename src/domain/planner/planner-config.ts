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
    preferences: 1500
  },
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
