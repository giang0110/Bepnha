import { describe, expect, test, vi } from "vitest"

import type { HouseholdRepository } from "@/application/household/household-repository"

import { createDeferredHouseholdRepository } from "./deferred-household-repository"

const loadOwn = vi.fn()
const saveOwn = vi.fn()
const createSupabaseHouseholdRepository = vi.fn((): HouseholdRepository => ({ loadOwn, saveOwn }))

vi.mock("./supabase-household-repository.js", () => ({
  get createSupabaseHouseholdRepository() {
    return createSupabaseHouseholdRepository
  }
}))

describe("createDeferredHouseholdRepository", () => {
  test("does not touch the real repository until something asks it a question", () => {
    createSupabaseHouseholdRepository.mockClear()

    createDeferredHouseholdRepository({} as never)

    // The whole point: constructing this at start-up must cost the sign-in screen nothing.
    expect(createSupabaseHouseholdRepository).not.toHaveBeenCalled()
  })

  test("forwards a read once it does", async () => {
    createSupabaseHouseholdRepository.mockClear()
    loadOwn.mockResolvedValue({ householdId: "h" })

    await expect(createDeferredHouseholdRepository({} as never).loadOwn()).resolves.toEqual({
      householdId: "h"
    })
    expect(createSupabaseHouseholdRepository).toHaveBeenCalledTimes(1)
  })

  test("forwards a write with both of its arguments", async () => {
    saveOwn.mockResolvedValue({ ok: true, household: { householdId: "h" } })
    const repository = createDeferredHouseholdRepository({} as never)

    await repository.saveOwn({ memberGroups: [] } as never, 3)

    expect(saveOwn).toHaveBeenCalledWith({ memberGroups: [] }, 3)
  })

  test("loads the module once however many calls arrive", async () => {
    createSupabaseHouseholdRepository.mockClear()
    loadOwn.mockResolvedValue(null)
    const repository = createDeferredHouseholdRepository({} as never)

    await Promise.all([repository.loadOwn(), repository.loadOwn(), repository.loadOwn()])

    expect(createSupabaseHouseholdRepository).toHaveBeenCalledTimes(1)
  })

  test("a failed first load does not poison every later call", async () => {
    // A flaky network on the first chunk request would otherwise leave the app permanently unable
    // to read the household, with a reload as the only cure.
    createSupabaseHouseholdRepository.mockClear()
    createSupabaseHouseholdRepository.mockImplementationOnce(() => {
      throw new Error("chunk load failed")
    })
    loadOwn.mockResolvedValue(null)
    const repository = createDeferredHouseholdRepository({} as never)

    await expect(repository.loadOwn()).rejects.toThrow("chunk load failed")
    await expect(repository.loadOwn()).resolves.toBeNull()
  })
})
