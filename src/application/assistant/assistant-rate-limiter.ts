export interface AssistantRateLimitRequest {
  readonly actorUserId: string
  readonly nowMs: number
}

export type AssistantRateLimitDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false
      readonly retryAfterSeconds?: number
    }

export interface AssistantRateLimiter {
  consume(request: AssistantRateLimitRequest): Promise<AssistantRateLimitDecision>
}
