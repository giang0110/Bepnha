import { describe, expect, test, vi } from "vitest"

import { purgeCachedHouseholdData, registerServiceWorker } from "./service-worker-client"

describe("registerServiceWorker", () => {
  test("registers the worker at the root so it can answer for every route", async () => {
    const register = vi.fn().mockResolvedValue({})

    await expect(
      registerServiceWorker({ serviceWorker: { register, controller: null } })
    ).resolves.toBe(true)
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" })
  })

  test("says no rather than throwing on a browser without service workers", async () => {
    await expect(registerServiceWorker({})).resolves.toBe(false)
  })

  test("says no when registration is refused, because the app still works without it", async () => {
    const register = vi.fn().mockRejectedValue(new Error("insecure context"))

    await expect(
      registerServiceWorker({ serviceWorker: { register, controller: null } })
    ).resolves.toBe(false)
  })
})

describe("purgeCachedHouseholdData", () => {
  test("tells the controlling worker to drop the household cache", async () => {
    const postMessage = vi.fn()

    await purgeCachedHouseholdData({
      serviceWorker: { register: vi.fn(), controller: { postMessage } }
    })

    expect(postMessage).toHaveBeenCalledWith({ type: "bepnha:purge-data" })
  })

  test("reaches the worker on the very first load, before it controls the page", async () => {
    // A sign-out in the same visit that installed the worker still has to clear the cache; at that
    // point `controller` is null and the registration is the only way to reach it.
    const postMessage = vi.fn()

    await purgeCachedHouseholdData({
      serviceWorker: {
        register: vi.fn(),
        controller: null,
        ready: Promise.resolve({ active: { postMessage } })
      }
    })

    expect(postMessage).toHaveBeenCalledWith({ type: "bepnha:purge-data" })
  })

  test("is quiet when there is no worker at all", async () => {
    await expect(purgeCachedHouseholdData({})).resolves.toBeUndefined()
  })

  test("is quiet when the worker cannot be reached, rather than failing the sign-out", async () => {
    // Sign-out must complete. A cache that could not be cleared is worth less than a session that
    // could not be ended.
    await expect(
      purgeCachedHouseholdData({
        serviceWorker: {
          register: vi.fn(),
          controller: null,
          ready: Promise.reject(new Error("no registration"))
        }
      })
    ).resolves.toBeUndefined()
  })
})
