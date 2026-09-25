export const PLANNER_ENGINE_VERSION = "planner-engine-v5" as const

/**
 * Every engine version a stored plan may carry.
 *
 * v4 added the recently-cooked penalty and v5 the household's own ratings of individual meals, each
 * of which changes which week the search returns. Older revisions keep their own version so a plan
 * is always read back as the engine that produced it, never reinterpreted by a later one.
 */
export type PersistedPlannerEngineVersion =
  | "planner-engine-v1"
  | "planner-engine-v2"
  | "planner-engine-v3"
  | "planner-engine-v4"
  | typeof PLANNER_ENGINE_VERSION
