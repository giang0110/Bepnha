export type PlannerWarning =
  | {
      readonly code: "STALE_PRICE"
      readonly foodId: string
      readonly foodPriceId: string
      readonly observedAt: string
      readonly ageDays: number
    }
  | {
      readonly code: "PLAN_OVER_BUDGET"
      readonly budgetVnd: number
      readonly estimatedPlanCostVnd: number
      readonly overageVnd: number
    }
  | { readonly code: "NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH" }

export type PlannerFatalCode =
  | "INVALID_PLANNER_INPUT"
  | "UNSUPPORTED_HARD_RULE"
  | "INCOMPLETE_CATALOG_LINEAGE"
  | "NO_USABLE_PRICE"
  | "HARD_FILTER_EXHAUSTED"
  | "CATALOG_CANDIDATE_LIMIT_EXCEEDED"
  | "NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH"
  | "REPLACEMENT_UNAVAILABLE_WITHIN_DETERMINISTIC_SEARCH"
  | "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED"
  | "STALE_PLAN_VERSION"
  | "UNAUTHORIZED"
  | "TRANSIENT_DEPENDENCY_FAILURE"
