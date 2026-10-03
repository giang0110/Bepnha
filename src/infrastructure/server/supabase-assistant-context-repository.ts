import type {
  AssistantContextRepository,
  AssistantContextLoadResult
} from "../../application/assistant/assistant-context-repository.js"
import type { AssistantPlanEvidence } from "../../application/assistant/meal-assistant.js"
import type { PlannerInputLoader, PlannerRpcClient } from "./supabase-planner-repository.js"

import { readyPlanV2FromRevision } from "./supabase-planner-input-loader.js"

const DAY_LABELS = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật"
] as const

interface Dependencies {
  readonly userClient: PlannerRpcClient
  readonly loader: PlannerInputLoader
}

const transientFailure: AssistantContextLoadResult = {
  ok: false,
  error: "TRANSIENT_DEPENDENCY_FAILURE"
}

function buildEvidence(value: {
  readonly input: { readonly weeklyPlanBudgetVnd: number }
  readonly currentPlan: {
    readonly totalEstimatedCostVnd: number
    readonly items: readonly {
      readonly dayIndex: number
      readonly snapshot: { readonly mealOptionNameVi: string; readonly elapsedMinutes: number }
    }[]
    readonly purchaseBasket: { readonly warnings: readonly { readonly code: string }[] }
  }
}): AssistantPlanEvidence {
  const totalEstimatedCostVnd = value.currentPlan.totalEstimatedCostVnd
  const budgetVnd = value.input.weeklyPlanBudgetVnd
  const warningCodes = new Set<string>()
  if (totalEstimatedCostVnd > budgetVnd) warningCodes.add("PLAN_OVER_BUDGET")
  for (const warning of value.currentPlan.purchaseBasket.warnings) warningCodes.add(warning.code)

  return {
    meals: [...value.currentPlan.items]
      .sort((left, right) => left.dayIndex - right.dayIndex)
      .map((item) => ({
        dayIndex: item.dayIndex,
        dayLabelVi: DAY_LABELS[item.dayIndex] ?? `Ngày ${item.dayIndex + 1}`,
        mealNameVi: item.snapshot.mealOptionNameVi,
        elapsedMinutes: item.snapshot.elapsedMinutes
      })),
    budgetStatus: totalEstimatedCostVnd <= budgetVnd ? "within" : "over",
    totalEstimatedCostVnd,
    budgetVnd,
    warningCodes: [...warningCodes]
  }
}

export function createSupabaseAssistantContextRepository(
  dependencies: Dependencies
): AssistantContextRepository {
  return {
    async loadCurrent(input) {
      const { data, error } = await dependencies.userClient.rpc("get_plan_replacement_input", {
        p_plan_id: input.planId
      })
      if (error !== null) return transientFailure
      if (data === null) return { ok: false, error: "UNAUTHORIZED" }

      try {
        if (typeof data === "object" && data !== null && "revision" in data) {
          const revision = data.revision as Record<string, unknown>
          if (revision.engine_version === "planner-engine-v6") {
            const ready = readyPlanV2FromRevision(revision)
            return {
              ok: true,
              value: {
                currentRevisionId: String(revision.id),
                evidence: buildEvidence({
                  input: { weeklyPlanBudgetVnd: Number(revision.budget_vnd) },
                  currentPlan: ready
                })
              }
            }
          }
        }
        const authoritative = await dependencies.loader.hydrateReplacement(
          data,
          dependencies.userClient
        )
        return {
          ok: true,
          value: {
            currentRevisionId: authoritative.currentRevisionId,
            evidence: buildEvidence(authoritative)
          }
        }
      } catch {
        return transientFailure
      }
    }
  }
}
