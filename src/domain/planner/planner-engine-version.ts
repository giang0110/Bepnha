export const PLANNER_ENGINE_VERSION = "planner-engine-v2" as const

export type PersistedPlannerEngineVersion = "planner-engine-v1" | typeof PLANNER_ENGINE_VERSION
