import type {
  RateLimitConfig,
  RateLimitDecision,
  RateLimiter,
  RateLimitRequest
} from "../../application/shared/rate-limiter.js"

/**
 * Multi-instance-safe limiter backed by Upstash Redis over its REST API.
 *
 * A per-instance in-memory limiter cannot bound a quota that is shared across serverless instances,
 * which is why `docs/operations/production-readiness.md` keeps production Gemini disabled until a
 * shared adapter exists. Both windows are evaluated and consumed inside one Lua script so two
 * concurrent instances cannot both observe "under the limit" and then both consume.
 */

export type UpstashFetch = (
  input: string,
  init: {
    readonly method: "POST"
    readonly headers: Readonly<Record<string, string>>
    readonly body: string
    readonly signal?: AbortSignal
  }
) => Promise<{ readonly ok: boolean; json: () => Promise<unknown> }>

export interface UpstashRestConfig {
  readonly url: string
  readonly token: string
  readonly fetch?: UpstashFetch
  readonly timeoutMs?: number
}

export interface UpstashRateLimiterOptions {
  /** Key prefix, so the assistant and planner quotas never share a counter. */
  readonly namespace: string
  readonly config: RateLimitConfig
  readonly rest: UpstashRestConfig
  /**
   * What to do when Redis itself is unreachable. `deny` protects a paid external provider and is
   * required for the assistant. `allow` degrades to no throttling for a first-party endpoint that is
   * already behind authentication and RLS, where a limiter outage should not take the feature down.
   */
  readonly failureMode: "allow" | "deny"
  readonly createMemberId?: () => string
}

const DEFAULT_TIMEOUT_MS = 2_000

const CONSUME_SCRIPT = `
local burstKey = KEYS[1]
local dailyKey = KEYS[2]
local nowMs = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local burstLimit = tonumber(ARGV[3])
local dailyLimit = tonumber(ARGV[4])
local dailyTtlSeconds = tonumber(ARGV[5])
local memberId = ARGV[6]

if tonumber(redis.call('GET', dailyKey) or '0') >= dailyLimit then
  return {0, -1}
end

redis.call('ZREMRANGEBYSCORE', burstKey, '-inf', nowMs - windowMs)
if redis.call('ZCARD', burstKey) >= burstLimit then
  local oldest = redis.call('ZRANGE', burstKey, 0, 0, 'WITHSCORES')
  local oldestMs = nowMs
  if oldest[2] then oldestMs = tonumber(oldest[2]) end
  return {0, oldestMs + windowMs - nowMs}
end

redis.call('ZADD', burstKey, nowMs, memberId)
redis.call('PEXPIRE', burstKey, windowMs)
if redis.call('INCR', dailyKey) == 1 then
  redis.call('EXPIRE', dailyKey, dailyTtlSeconds)
end
return {1, 0}
`.trim()

function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10)
}

function secondsUntilNextUtcDay(nowMs: number): number {
  const now = new Date(nowMs)
  const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(1, Math.ceil((nextDay - nowMs) / 1_000))
}

function decisionFrom(result: unknown, nowMs: number): RateLimitDecision | null {
  if (!Array.isArray(result) || result.length < 2) return null
  const allowed = Number(result[0])
  const retryAfterMs = Number(result[1])
  if (!Number.isFinite(allowed) || !Number.isFinite(retryAfterMs)) return null
  if (allowed === 1) return { allowed: true }
  if (retryAfterMs < 0) {
    return { allowed: false, retryAfterSeconds: secondsUntilNextUtcDay(nowMs) }
  }
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000)) }
}

export function createUpstashRateLimiter(options: UpstashRateLimiterOptions): RateLimiter {
  const { config, namespace, rest } = options
  const call = rest.fetch ?? globalThis.fetch
  const timeoutMs = rest.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const createMemberId = options.createMemberId ?? (() => crypto.randomUUID())
  const unavailable: RateLimitDecision =
    options.failureMode === "allow" ? { allowed: true } : { allowed: false }

  return {
    async consume(request: RateLimitRequest): Promise<RateLimitDecision> {
      const burstKey = `${namespace}:burst:${request.actorUserId}`
      const dailyKey = `${namespace}:daily:${request.actorUserId}:${utcDayKey(request.nowMs)}`
      const command = [
        "EVAL",
        CONSUME_SCRIPT,
        "2",
        burstKey,
        dailyKey,
        String(request.nowMs),
        String(config.burstWindowMs),
        String(config.burstLimit),
        String(config.dailyLimit),
        String(secondsUntilNextUtcDay(request.nowMs)),
        `${String(request.nowMs)}-${createMemberId()}`
      ]

      let payload: unknown
      try {
        const response = await call(rest.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${rest.token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(command),
          signal: AbortSignal.timeout(timeoutMs)
        })
        if (!response.ok) return unavailable
        payload = await response.json()
      } catch {
        return unavailable
      }

      if (typeof payload !== "object" || payload === null) return unavailable
      const result = (payload as { readonly result?: unknown }).result
      return decisionFrom(result, request.nowMs) ?? unavailable
    }
  }
}

export interface UpstashEnvironment {
  readonly UPSTASH_REDIS_REST_URL?: string
  readonly UPSTASH_REDIS_REST_TOKEN?: string
}

export function readUpstashRestConfig(
  environment: UpstashEnvironment
): Pick<UpstashRestConfig, "token" | "url"> | null {
  const url = environment.UPSTASH_REDIS_REST_URL?.trim()
  const token = environment.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (url === undefined || url === "" || token === undefined || token === "") return null
  if (!url.startsWith("https://")) return null
  return { url, token }
}
