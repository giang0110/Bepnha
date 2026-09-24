import type { RecipeHeatLevel } from "@/domain/recipe/recipe"

export interface PlanIngredientView {
  readonly sourceId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly baseQuantity: string
  readonly grossGrams: string
}

export interface PlanRecipeIngredientView {
  readonly recipeIngredientId: string
  readonly foodId: string
}

export interface PlanStepView {
  readonly order: number
  readonly instructionVi: string
  readonly timerMinutes: number | null
  readonly heatLevel: RecipeHeatLevel | null
  readonly temperatureCelsius: number | null
  readonly ingredientIds: readonly string[]
}

export interface PlanItemView {
  readonly dayIndex: number
  readonly mealSlot: "primary"
  readonly mealOptionId: string
  readonly mealOptionVersionId: string
  readonly adultEquivalent: string
  readonly scaleFactor: string
  readonly mealOptionCode: string
  readonly mealOptionNameVi: string
  readonly elapsedMinutes: number
  readonly components: readonly {
    readonly mealRole: string
    readonly sortOrder: number
    readonly recipe: {
      readonly recipeId: string
      readonly recipeVersionId: string
      readonly ingredients: readonly PlanRecipeIngredientView[]
      readonly steps: readonly PlanStepView[]
    }
  }[]
  readonly scaledIngredients: readonly PlanIngredientView[]
  readonly nutrition: {
    readonly nutrients: readonly {
      readonly nutrientCode: string
      readonly displayAmount: string
      readonly unitCode: string
    }[]
  }
}

export interface PlannerReadyResponse {
  readonly planId: string
  readonly revisionId: string
  readonly planVersion: number
  readonly idempotent: boolean
  readonly status: "ready_within_budget" | "ready_over_budget"
  readonly budgetVnd: number
  readonly costDeltaVnd?: number
  readonly plan: {
    readonly items: readonly PlanItemView[]
    readonly totalEstimatedCostVnd: number
  }
  readonly warnings: readonly { readonly code: string; readonly [key: string]: unknown }[]
}

export interface PlannerPreviewResponse {
  readonly status: "ready_within_budget" | "ready_over_budget"
  readonly items: readonly PlanItemView[]
  readonly weeklyEstimatedCostVnd: number
  readonly costDeltaVnd: number
  readonly warnings: readonly { readonly code: string; readonly [key: string]: unknown }[]
  readonly previewFingerprint: string
}

export type PlannerApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string; readonly correlationId?: string }

export interface PlannerApi {
  readonly generate: (
    accessToken: string,
    input: {
      readonly householdId: string
      readonly weekStart: string
      readonly idempotencyKey: string
      /** Both together, and only when replacing a plan the week already has. */
      readonly expectedPlanVersion?: number
      readonly expectedCurrentRevisionId?: string
    }
  ) => Promise<PlannerApiResult<PlannerReadyResponse>>
  /** Resolves to `null` when the week has no plan yet — an answer, not a failure. */
  readonly current: (
    accessToken: string,
    input: { readonly householdId: string; readonly weekStart: string }
  ) => Promise<PlannerApiResult<PlannerReadyResponse | null>>
  readonly preview: (
    accessToken: string,
    input: {
      readonly planId: string
      readonly targetDayIndex: number
      readonly expectedPlanVersion: number
    }
  ) => Promise<PlannerApiResult<PlannerPreviewResponse>>
  readonly apply: (
    accessToken: string,
    input: {
      readonly planId: string
      readonly targetDayIndex: number
      readonly expectedPlanVersion: number
      readonly expectedCurrentRevisionId: string
      readonly previewCalculationFingerprint: string
      readonly idempotencyKey: string
    }
  ) => Promise<PlannerApiResult<PlannerReadyResponse>>
}

interface FetchResponse {
  readonly ok: boolean
  readonly headers?: { readonly get: (name: string) => string | null }
  readonly json: () => Promise<unknown>
}

type Fetcher = (url: string, init: RequestInit) => Promise<FetchResponse>

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,96}$/u

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function safePlannerCorrelationId(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_CORRELATION_ID.test(value) ? value : undefined
}

function responseCorrelationId(response: FetchResponse): string | undefined {
  try {
    return safePlannerCorrelationId(response.headers?.get("x-correlation-id"))
  } catch {
    return undefined
  }
}

function failure(error: string, response?: FetchResponse): PlannerApiResult<never> {
  const correlationId = response === undefined ? undefined : responseCorrelationId(response)
  return correlationId === undefined ? { ok: false, error } : { ok: false, error, correlationId }
}

function isReady(value: unknown): value is PlannerReadyResponse {
  return (
    isRecord(value) &&
    (value.status === "ready_within_budget" || value.status === "ready_over_budget") &&
    typeof value.planId === "string" &&
    typeof value.revisionId === "string" &&
    typeof value.planVersion === "number" &&
    typeof value.budgetVnd === "number" &&
    isRecord(value.plan) &&
    Array.isArray(value.plan.items) &&
    typeof value.plan.totalEstimatedCostVnd === "number" &&
    Array.isArray(value.warnings)
  )
}

/**
 * A week nobody has generated yet comes back as `{ plan: null }`, not as a bare `null`: the route
 * needs a 200 with a body, because a 404 would read as an error. Callers want the absence, not the
 * envelope, so the envelope is unwrapped here rather than at every call site.
 */
function isEmptyWeek(value: unknown): boolean {
  return isRecord(value) && value.plan === null
}

function isCurrent(value: unknown): value is PlannerReadyResponse {
  return isReady(value)
}

function isPreview(value: unknown): value is PlannerPreviewResponse {
  return (
    isRecord(value) &&
    (value.status === "ready_within_budget" || value.status === "ready_over_budget") &&
    Array.isArray(value.items) &&
    typeof value.weeklyEstimatedCostVnd === "number" &&
    typeof value.costDeltaVnd === "number" &&
    typeof value.previewFingerprint === "string" &&
    Array.isArray(value.warnings)
  )
}

export function createPlannerApi(fetcher: Fetcher = fetch): PlannerApi {
  async function post<T>(
    url: string,
    accessToken: string,
    body: unknown,
    validate: (value: unknown) => value is T
  ): Promise<PlannerApiResult<T>> {
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      const payload = await response.json()
      if (!response.ok) {
        return failure(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "PLANNER_UNAVAILABLE",
          response
        )
      }
      return validate(payload)
        ? { ok: true, value: payload }
        : failure("PLANNER_UNAVAILABLE", response)
    } catch {
      return failure("PLANNER_UNAVAILABLE")
    }
  }

  async function get<T>(
    url: string,
    accessToken: string,
    validate: (value: unknown) => value is T
  ): Promise<PlannerApiResult<T>> {
    try {
      const response = await fetcher(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      const payload = await response.json()
      if (!response.ok) {
        return failure(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "PLANNER_UNAVAILABLE",
          response
        )
      }
      return validate(payload)
        ? { ok: true, value: payload }
        : failure("PLANNER_UNAVAILABLE", response)
    } catch {
      return failure("PLANNER_UNAVAILABLE")
    }
  }

  return {
    generate: (token, input) => post("/api/plans/generate", token, input, isReady),
    current: async (token, input) => {
      const result = await get<PlannerReadyResponse | null>(
        `/api/plans/current?householdId=${encodeURIComponent(input.householdId)}&weekStart=${encodeURIComponent(input.weekStart)}`,
        token,
        (value): value is PlannerReadyResponse | null => isEmptyWeek(value) || isCurrent(value)
      )
      return result.ok && isEmptyWeek(result.value) ? { ok: true, value: null } : result
    },
    preview: (token, input) => post("/api/plans/replacements-preview", token, input, isPreview),
    apply: (token, input) => post("/api/plans/replacements-apply", token, input, isReady)
  }
}
