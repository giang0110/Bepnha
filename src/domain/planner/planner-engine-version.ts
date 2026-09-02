export const PLANNER_ENGINE_VERSION = "planner-engine-v3" as const

export type PersistedPlannerEngineVersion =
  | "planner-engine-v1"
  | "planner-engine-v2"
  | typeof PLANNER_ENGINE_VERSION
