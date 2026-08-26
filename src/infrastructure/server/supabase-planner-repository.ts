import type {
  PersistPlannerRevisionCommand,
  PlannerRepository,
  ReplacementAuthoritativeInput
} from "@/application/planner/planner-use-cases"
import type { PlannerInputV1 } from "@/domain/planner/planner-input"

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

    async persistRevision(input: PersistPlannerRevisionCommand) {
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
      if (error !== null) return persistenceFailure(error)
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
  }
}
