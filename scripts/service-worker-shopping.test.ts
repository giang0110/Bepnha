import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { runInNewContext } from "node:vm"

import { describe, expect, test, vi } from "vitest"

type FetchListener = (event: {
  readonly request: Request
  readonly respondWith: (response: Promise<Response>) => void
}) => void

async function workerHarness(fetcher: typeof fetch, cached?: Response) {
  const listeners = new Map<string, (event: never) => void>()
  const put = vi.fn()
  const caches = {
    open: vi.fn().mockResolvedValue({
      put,
      match: vi.fn().mockResolvedValue(cached),
      addAll: vi.fn()
    }),
    match: vi.fn().mockResolvedValue(cached),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true)
  }
  const self = {
    location: { origin: "https://bepnha.test" },
    addEventListener: (name: string, listener: (event: never) => void) =>
      listeners.set(name, listener),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() }
  }
  const source = await readFile(resolve(process.cwd(), "public/sw.js"), "utf8")
  runInNewContext(source, { self, caches, fetch: fetcher, URL, Response })
  return { listener: listeners.get("fetch") as FetchListener, put }
}

describe("shopping service-worker read", () => {
  test("uses network-first and caches the exact shopping revision GET", async () => {
    const network = new Response('{"shoppingList":null}', {
      status: 200,
      headers: { "content-type": "application/json" }
    })
    const fetcher = vi.fn().mockResolvedValue(network)
    const { listener, put } = await workerHarness(fetcher)
    const request = new Request(
      "https://bepnha.test/api/shopping/current?planId=plan-a&revisionId=revision-a",
      { headers: { Authorization: "Bearer user-token" } }
    )
    let response: Promise<Response> | undefined

    listener({
      request,
      respondWith: (value) => {
        response = value
      }
    })

    expect(await response).toBe(network)
    expect(fetcher).toHaveBeenCalledWith(request)
    expect(put).toHaveBeenCalledWith(request, expect.any(Response))
  })

  test("returns the cached exact revision when the network is unavailable", async () => {
    const cached = new Response('{"shoppingList":{"status":"ready"}}', { status: 200 })
    const { listener } = await workerHarness(
      vi.fn().mockRejectedValue(new Error("offline")),
      cached
    )
    const request = new Request(
      "https://bepnha.test/api/shopping/current?planId=plan-a&revisionId=revision-a"
    )
    let response: Promise<Response> | undefined

    listener({
      request,
      respondWith: (value) => {
        response = value
      }
    })

    expect(await response).toBe(cached)
  })
})
