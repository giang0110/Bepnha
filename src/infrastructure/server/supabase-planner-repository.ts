import type {
  CurrentPlanView,
  PersistPlannerRevisionCommand,
  PlannerRepository,
  ReplacementAuthoritativeInput
} from "../../application/planner/planner-use-cases.js"
import type { PlannerInputV1 } from "../../domain/planner/planner-input.js"
import { buildPlanTrustView } from "../../application/planner/plan-trust.js"

type DbError = { readonly code?: string; readonly message?: string }
type RpcResult = Promise<{ readonly data: unknown; readonly error: DbError | null }>

export interface PlannerRpcClient {
  readonly rpc: (name: string, args: Record<string, unknown>) => RpcResult
}

export interface PlannerInputLoader {
  readonly hydrateGeneration: (
    raw: unknown,
    userClient: PlannerRpcClient
  ) => Promise<PlannerInputV1>
  readonly hydrateReplacement: (
    raw: unknown,
    userClient: PlannerRpcClient
  ) => Promise<ReplacementAuthoritativeInput>
}

interface Dependencies {
  readonly userClient: PlannerRpcClient
  readonly secretClientFactory: () => PlannerRpcClient
  readonly loader: PlannerInputLoader
}

const unavailable = {
  ok: false as const,
  error: { code: "TRANSIENT_DEPENDENCY_FAILURE" as const }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * Reads the stored revision rather than recomputing anything.
 *
 * Budget status is a decision the planner already made and persistence already checked against its
 * own invariant; deriving it again here from cost and budget would be a second opinion that can
 * disagree with the row. The row wins.
 */
function currentPlanFrom(
  raw: unknown,
  plan: ReplacementAuthoritativeInput
): CurrentPlanView | null {
  const payload = record(raw)
  const revision = payload === null ? null : record(payload.revision)
  const planRow = payload === null ? null : record(payload.plan)
  if (revision === null || planRow === null) return null

  const planId = planRow.id
  const revisionId = revision.id
  const budgetVnd = positiveInteger(revision.budget_vnd)
  const budgetStatus = revision.budget_status
  const calculationDate = revision.calculation_date
  if (
    typeof planId !== "string" ||
    typeof revisionId !== "string" ||
    budgetVnd === null ||
    typeof calculationDate !== "string" ||
    (budgetStatus !== "within" && budgetStatus !== "over") ||
    !Array.isArray(revision.warnings)
  ) {
    return null
  }

  return {
    planId,
    revisionId,
    planVersion: plan.planVersion,
    status: budgetStatus === "within" ? "ready_within_budget" : "ready_over_budget",
    budgetVnd,
    plan: plan.currentPlan,
    warnings: revision.warnings as CurrentPlanView["warnings"],
    trust: buildPlanTrustView(plan.currentPlan, calculationDate)
  }
}

function persistenceFailure(error: DbError | null) {
  if (error?.code === "P0001" && error.message?.includes("STALE_PLAN_VERSION") === true) {
    return { ok: false as const, error: { code: "STALE_PLAN_VERSION" as const } }
  }
  if (error?.code === "42501") {
    return { ok: false as const, error: { code: "UNAUTHORIZED" as const } }
  }
  return unavailable
}

export function createSupabasePlannerRepository(dependencies: Dependencies): PlannerRepository {
  return {
    async loadGenerationInput(input) {
      const { data, error } = await dependencies.userClient.rpc("get_planner_generation_input", {
        p_household_id: input.householdId,
        p_week_start: input.weekStart,
        p_calculation_date: input.calculationDate
      })
      if (error !== null) return unavailable
      if (data === null) return { ok: false, error: { code: "UNAUTHORIZED" } }
      try {
        return {
          ok: true,
          value: await dependencies.loader.hydrateGeneration(data, dependencies.userClient)
        }
      } catch {
        return unavailable
      }
    },

    async loadReplacementInput(input) {
      const { data, error } = await dependencies.userClient.rpc("get_plan_replacement_input", {
        p_plan_id: input.planId
      })
      if (error !== null) return unavailable
      if (data === null) return { ok: false, error: { code: "UNAUTHORIZED" } }
      try {
        return {
          ok: true,
          value: await dependencies.loader.hydrateReplacement(data, dependencies.userClient)
        }
      } catch {
        return unavailable
      }
    },

    async loadCurrentPlan(input) {
      const { data, error } = await dependencies.userClient.rpc("get_current_plan_for_week", {
        p_household_id: input.householdId,
        p_week_start: input.weekStart
      })
      if (error !== null) return unavailable
      // No row means the week has no plan yet. That is the ordinary state before the first
      // generation, so it is an answer, not a refusal — the caller shows the generate button.
      if (data === null) return { ok: true as const, value: null }
      try {
        const hydrated = await dependencies.loader.hydrateReplacement(data, dependencies.userClient)
        const view = currentPlanFrom(data, hydrated)
        return view === null ? unavailable : { ok: true as const, value: view }
      } catch {
        return unavailable
      }
    },

    async persistRevision(input: PersistPlannerRevisionCommand) {
      const result = await persistPlannerRevision(dependencies, input)
      if (!result.ok)
        return {
          ok: false,
          error: {
            code:
              result.error.code === "DEPENDENCY_SCHEMA_NOT_READY"
                ? "TRANSIENT_DEPENDENCY_FAILURE"
                : result.error.code
          }
        }
      return result
    }
  }
}

import type {
  PlannerRepositoryV2,
  PersistPlannerRevisionCommandV2,
  VersionedReplacementInput,
  CurrentPlanViewV2
} from "../../application/planner/planner-versioned-repository.js"
import type { PlannerInputV2 } from "../../domain/planner/planner-v2.js"
import { PLANNER_MISSING_SCHEMA_CODES } from "./load-food-quantity-policies.js"
export interface PlannerInputLoaderV2 {
  hydrateGeneration(raw: unknown, userClient: PlannerRpcClient): Promise<PlannerInputV2>
  hydrateReplacement(raw: unknown, userClient: PlannerRpcClient): Promise<VersionedReplacementInput>
  readStored(raw: unknown): CurrentPlanViewV2
}
async function persistPlannerRevision(
  dependencies: Pick<Dependencies, "secretClientFactory">,
  input: PersistPlannerRevisionCommand | PersistPlannerRevisionCommandV2
): ReturnType<PlannerRepositoryV2["persistRevision"]> {
  let client: PlannerRpcClient
  try {
    client = dependencies.secretClientFactory()
  } catch {
    return unavailable
  }
  const revision = {
    revisionKind: input.revisionKind,
    replacedDayIndex: input.replacementDayIndex,
    householdSetupVersion: input.householdSetupVersion,
    engineVersion: input.engineVersion,
    portionConfigVersion: input.portionConfigVersion,
    priceFreshnessConfigVersion: input.priceFreshnessConfigVersion,
    plannerConfigVersion: input.plannerConfigVersion,
    calculationDate: input.calculationDate,
    catalogFingerprint: input.catalogFingerprint,
    inputFingerprint: input.inputFingerprint,
    calculationFingerprint: input.calculationFingerprint,
    inputSnapshot: input.inputSnapshot,
    calculationSnapshot: input.calculationSnapshot,
    budgetVnd: input.budgetVnd,
    totalEstimatedCostVnd: input.totalEstimatedCostVnd,
    overageVnd: input.overageVnd,
    budgetStatus: input.budgetStatus,
    warnings: input.warnings
  }
  const { data, error } = await client.rpc("persist_meal_plan_revision", {
    p_actor_user_id: input.actorUserId,
    p_household_id: input.householdId,
    p_week_start: input.weekStart,
    p_expected_plan_version: input.expectedPlanVersion,
    p_expected_current_revision_id: input.parentRevisionId,
    p_idempotency_key: input.idempotencyKey,
    p_revision: revision,
    p_items: input.items
  })
  if (error !== null)
    return input.engineVersion === "planner-engine-v6" &&
      error.code &&
      PLANNER_MISSING_SCHEMA_CODES.has(error.code)
      ? { ok: false as const, error: { code: "DEPENDENCY_SCHEMA_NOT_READY" as const } }
      : persistenceFailure(error)
  const value = record(data)
  if (
    value === null ||
    typeof value.planId !== "string" ||
    typeof value.revisionId !== "string" ||
    typeof value.planVersion !== "number" ||
    !Number.isSafeInteger(value.planVersion) ||
    typeof value.idempotent !== "boolean"
  ) {
    return unavailable
  }
  return {
    ok: true,
    value: {
      planId: value.planId,
      revisionId: value.revisionId,
      planVersion: value.planVersion,
      idempotent: value.idempotent
    }
  }
}
function versionedFailure(error: unknown) {
  const code =
    record(error)?.code ??
    (error instanceof Error ? (error as Error & { code?: string }).code : undefined)
  if (
    typeof code === "string" &&
    (PLANNER_MISSING_SCHEMA_CODES.has(code) || code === "DEPENDENCY_SCHEMA_NOT_READY")
  )
    return { ok: false as const, error: { code: "DEPENDENCY_SCHEMA_NOT_READY" as const } }
  if (code === "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED")
    return {
      ok: false as const,
      error: { code: "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED" as const }
    }
  if (code === "42501") return { ok: false as const, error: { code: "UNAUTHORIZED" as const } }
  return unavailable
}
export function createSupabasePlannerRepositoryV2(
  dependencies: Omit<Dependencies, "loader"> & {
    loader: PlannerInputLoaderV2
    legacyRepository: PlannerRepository
  }
): PlannerRepositoryV2 {
  return {
    async loadGenerationInput(input) {
      const { data, error } = await dependencies.userClient.rpc("get_planner_generation_input", {
        p_household_id: input.householdId,
        p_week_start: input.weekStart,
        p_calculation_date: input.calculationDate
      })
      if (error) return versionedFailure(error)
      if (data === null) return { ok: false, error: { code: "UNAUTHORIZED" } }
      try {
        return {
          ok: true,
          value: await dependencies.loader.hydrateGeneration(data, dependencies.userClient)
        }
      } catch (e) {
        return versionedFailure(e)
      }
    },
    async loadReplacementInput(input) {
      const { data, error } = await dependencies.userClient.rpc("get_plan_replacement_input", {
        p_plan_id: input.planId
      })
      if (error) return versionedFailure(error)
      if (data === null) return { ok: false, error: { code: "UNAUTHORIZED" } }
      try {
        return {
          ok: true,
          value: await dependencies.loader.hydrateReplacement(data, dependencies.userClient)
        }
      } catch (e) {
        return versionedFailure(e)
      }
    },
    async loadCurrentPlan(input) {
      const { data, error } = await dependencies.userClient.rpc(
        input.revisionId ? "get_plan_revision_for_owner" : "get_current_plan_for_week",
        {
          p_household_id: input.householdId,
          p_week_start: input.weekStart,
          ...(input.revisionId ? { p_revision_id: input.revisionId } : {})
        }
      )
      if (error) return versionedFailure(error)
      if (data === null) return { ok: true, value: null }
      if (record(record(data)?.revision)?.engine_version !== "planner-engine-v6")
        return dependencies.legacyRepository.loadCurrentPlan(input)
      try {
        return { ok: true, value: dependencies.loader.readStored(data) }
      } catch (e) {
        return versionedFailure(e)
      }
    },
    persistRevision: (input) => persistPlannerRevision(dependencies, input)
  }
}
