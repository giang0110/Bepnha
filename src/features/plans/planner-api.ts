export interface PlanIngredientView {
  readonly sourceId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly baseQuantity: string
  readonly grossGrams: string
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
      readonly steps: readonly {
        readonly order: number
        readonly instructionVi: string
        readonly timerMinutes: number | null
      }[]
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
    }
  ) => Promise<PlannerApiResult<PlannerReadyResponse>>
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

  return {
    generate: (token, input) => post("/api/plans/generate", token, input, isReady),
    preview: (token, input) => post("/api/plans/replacements-preview", token, input, isPreview),
    apply: (token, input) => post("/api/plans/replacements-apply", token, input, isReady)
  }
}
