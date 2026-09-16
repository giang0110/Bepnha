export interface RateLimitRequest {
  readonly actorUserId: string
  readonly nowMs: number
}

export type RateLimitDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false
      readonly retryAfterSeconds?: number
    }

export interface RateLimiter {
  consume(request: RateLimitRequest): Promise<RateLimitDecision>
}

export interface RateLimitConfig {
  readonly burstLimit: number
  readonly burstWindowMs: number
  readonly dailyLimit: number
}
