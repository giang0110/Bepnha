import type { AssistantPlanEvidence } from "./meal-assistant"

export type AssistantContextLoadResult =
  | {
      readonly ok: true
      readonly value: {
        readonly currentRevisionId: string
        readonly evidence: AssistantPlanEvidence
      }
    }
  | {
      readonly ok: false
      readonly error: "UNAUTHORIZED" | "TRANSIENT_DEPENDENCY_FAILURE"
    }

export interface AssistantContextRepository {
  readonly loadCurrent: (input: {
    readonly actorUserId: string
    readonly planId: string
  }) => Promise<AssistantContextLoadResult>
}
