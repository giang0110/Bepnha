import { describe, expect, test, vi } from "vitest"

import {
  createUpstashRateLimiter,
  readUpstashRestConfig,
  type UpstashFetch
} from "./upstash-rate-limiter"

const config = { burstLimit: 5, burstWindowMs: 60_000, dailyLimit: 50 }
const NOW_MS = Date.UTC(2026, 8, 16, 10, 30, 0)

function fetchReturning(result: unknown, ok = true) {
  return vi.fn(() =>
    Promise.resolve({ ok, json: () => Promise.resolve({ result }) })
  ) as unknown as UpstashFetch & ReturnType<typeof vi.fn>
}

function limiter(
  call: UpstashFetch,
  failureMode: "allow" | "deny" = "deny",
  namespace = "bepnha:assistant"
) {
  return createUpstashRateLimiter({
    namespace,
    config,
    failureMode,
    rest: { url: "https://example.upstash.io", token: "redis-token", fetch: call },
    createMemberId: () => "member-1"
  })
}

describe("Upstash shared rate limiter", () => {
  test("consumes both windows in one atomic script call keyed per user and UTC day", async () => {
    const call = fetchReturning([1, 0])

    await expect(limiter(call).consume({ actorUserId: "user-1", nowMs: NOW_MS })).resolves.toEqual({
      allowed: true
    })

    const [url, init] = call.mock.calls[0] as [
      string,
      { body: string; headers: Record<string, string> }
    ]
    const command = JSON.parse(init.body) as string[]
    expect(url).toBe("https://example.upstash.io")
    expect(init.headers.Authorization).toBe("Bearer redis-token")
    expect(command[0]).toBe("EVAL")
    expect(command[2]).toBe("2")
    expect(command[3]).toBe("bepnha:assistant:burst:user-1")
    expect(command[4]).toBe("bepnha:assistant:daily:user-1:2026-09-16")
    // One round trip: the whole check-and-consume happens inside the script.
    expect(call.mock.calls).toHaveLength(1)
  })

  test("keeps separate counters per namespace so assistant and planner quotas never mix", async () => {
    const call = fetchReturning([1, 0])
    await limiter(call, "deny", "bepnha:planner").consume({ actorUserId: "user-1", nowMs: NOW_MS })

    const [, init] = call.mock.calls[0] as [string, { body: string }]
    const command = JSON.parse(init.body) as string[]
    expect(command[3]).toBe("bepnha:planner:burst:user-1")
  })

  test("reports the burst retry delay the script measured", async () => {
    const call = fetchReturning([0, 4_200])

    await expect(limiter(call).consume({ actorUserId: "user-1", nowMs: NOW_MS })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 5
    })
  })

  test("reports seconds until the next UTC day when the daily quota is spent", async () => {
    const call = fetchReturning([0, -1])

    await expect(limiter(call).consume({ actorUserId: "user-1", nowMs: NOW_MS })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 13 * 3_600 + 30 * 60
    })
  })

  test.each([
    ["a transport failure", () => Promise.reject(new Error("network down"))],
    ["a non-OK response", () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })],
    ["a malformed payload", () => Promise.resolve({ ok: true, json: () => Promise.resolve(null) })],
    [
      "an unreadable result",
      () => Promise.resolve({ ok: true, json: () => Promise.resolve({ result: "nope" }) })
    ]
  ])("fails closed on %s when the caller requires deny", async (_name, call) => {
    const limit = limiter(call)

    await expect(limit.consume({ actorUserId: "user-1", nowMs: NOW_MS })).resolves.toEqual({
      allowed: false
    })
  })

  test("fails open when the caller opted into degrading instead of blocking", async () => {
    const call = (() => Promise.reject(new Error("network down"))) as unknown as UpstashFetch

    await expect(
      limiter(call, "allow").consume({ actorUserId: "user-1", nowMs: NOW_MS })
    ).resolves.toEqual({ allowed: true })
  })

  test("resolves REST configuration only from a complete server-side HTTPS pair", () => {
    expect(
      readUpstashRestConfig({
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "redis-token"
      })
    ).toEqual({ url: "https://example.upstash.io", token: "redis-token" })
    expect(
      readUpstashRestConfig({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io" })
    ).toBeNull()
    expect(
      readUpstashRestConfig({
        UPSTASH_REDIS_REST_URL: "http://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "redis-token"
      })
    ).toBeNull()
    expect(readUpstashRestConfig({})).toBeNull()
  })
})
