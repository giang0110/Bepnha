import type {
  AssistantRateLimitDecision,
  AssistantRateLimiter,
  AssistantRateLimitRequest
} from "@/application/assistant/assistant-rate-limiter"

interface AssistantRateLimitConfig {
  readonly burstLimit: number
  readonly burstWindowMs: number
  readonly dailyLimit: number
}

interface UserState {
  readonly burstTimestamps: number[]
  dayKey: string
  dailyCount: number
}

function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10)
}

function secondsUntilNextUtcDay(nowMs: number): number {
  const now = new Date(nowMs)
  const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(1, Math.ceil((nextDay - nowMs) / 1_000))
}

export function createInMemoryAssistantRateLimiter(
  config: AssistantRateLimitConfig
): AssistantRateLimiter {
  const states = new Map<string, UserState>()

  return {
    async consume(request: AssistantRateLimitRequest): Promise<AssistantRateLimitDecision> {
      const dayKey = utcDayKey(request.nowMs)
      const state = states.get(request.actorUserId) ?? {
        burstTimestamps: [],
        dayKey,
        dailyCount: 0
      }
      states.set(request.actorUserId, state)

      if (state.dayKey !== dayKey) {
        state.dayKey = dayKey
        state.dailyCount = 0
      }

      const burstBoundary = request.nowMs - config.burstWindowMs
      while (state.burstTimestamps.length > 0 && state.burstTimestamps[0] <= burstBoundary) {
        state.burstTimestamps.shift()
      }

      if (state.dailyCount >= config.dailyLimit) {
        return {
          allowed: false,
          retryAfterSeconds: secondsUntilNextUtcDay(request.nowMs)
        }
      }

      if (state.burstTimestamps.length >= config.burstLimit) {
        const oldest = state.burstTimestamps[0] ?? request.nowMs
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((oldest + config.burstWindowMs - request.nowMs) / 1_000)
          )
        }
      }

      state.burstTimestamps.push(request.nowMs)
      state.dailyCount += 1
      return { allowed: true }
    }
  }
}
