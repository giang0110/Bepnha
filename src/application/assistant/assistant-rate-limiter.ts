import type {
  RateLimitDecision,
  RateLimiter,
  RateLimitRequest
} from "@/application/shared/rate-limiter"

export type AssistantRateLimitRequest = RateLimitRequest

export type AssistantRateLimitDecision = RateLimitDecision

export type AssistantRateLimiter = RateLimiter
