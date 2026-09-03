import { z } from "zod"

export const ASSISTANT_QUESTION_MAX_LENGTH = 500

export interface AssistantPlanEvidence {
  readonly meals: readonly {
    readonly dayIndex: number
    readonly dayLabelVi: string
    readonly mealNameVi: string
    readonly elapsedMinutes: number
  }[]
  readonly budgetStatus: "within" | "over"
  readonly totalEstimatedCostVnd: number
  readonly budgetVnd: number
  readonly warningCodes: readonly string[]
}

export type AssistantResult =
  | {
      readonly kind: "explanation"
      readonly summaryVi: string
      readonly observationsVi: readonly string[]
    }
  | {
      readonly kind: "replacement_proposal"
      readonly targetDayIndex: number
      readonly reasonVi: string
    }
  | {
      readonly kind: "unsupported"
      readonly messageVi: string
    }

export type AssistantProviderResult =
  | { readonly ok: true; readonly value: AssistantResult }
  | { readonly ok: false; readonly error: "ASSISTANT_UNAVAILABLE" }

export interface MealAssistantPort {
  readonly respond: (input: {
    readonly question: string
    readonly evidence: AssistantPlanEvidence
  }) => Promise<AssistantProviderResult>
}

function boundedText(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value.trim().length > 0)
}

const assistantResultSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("explanation"),
      summaryVi: boundedText(600),
      observationsVi: z.array(boundedText(240)).max(5)
    })
    .strict(),
  z
    .object({
      kind: z.literal("replacement_proposal"),
      targetDayIndex: z.number().int().min(0).max(6),
      reasonVi: boundedText(320)
    })
    .strict(),
  z
    .object({
      kind: z.literal("unsupported"),
      messageVi: boundedText(240)
    })
    .strict()
])

export function validateAssistantResult(
  value: unknown,
  evidence: AssistantPlanEvidence
): AssistantResult | null {
  const parsed = assistantResultSchema.safeParse(value)
  if (!parsed.success) return null
  const result = parsed.data
  if (result.kind === "replacement_proposal") {
    const targetDayIndex = result.targetDayIndex
    if (!evidence.meals.some((meal) => meal.dayIndex === targetDayIndex)) return null
  }
  return result
}
