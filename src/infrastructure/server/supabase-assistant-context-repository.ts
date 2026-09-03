import type {
  AssistantContextRepository,
  AssistantContextLoadResult
} from "@/application/assistant/assistant-context-repository"
import type { AssistantPlanEvidence } from "@/application/assistant/meal-assistant"
import type {
  PlannerInputLoader,
  PlannerRpcClient
} from "@/infrastructure/server/supabase-planner-repository"

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

function buildEvidence(
  value: Awaited<ReturnType<PlannerInputLoader["hydrateReplacement"]>>
): AssistantPlanEvidence {
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
