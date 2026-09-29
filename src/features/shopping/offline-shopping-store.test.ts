import { describe, expect, test, vi } from "vitest"

import {
  loadQueuedShoppingChecks,
  queueShoppingCheck,
  replayQueuedShoppingChecks,
  SHOPPING_CHECK_QUEUE_KEY
} from "./offline-shopping-store"

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  }
}

describe("offline shopping check queue", () => {
  test("compacts repeated changes to the latest state for an exact revision item", () => {
    const storage = memoryStorage()
    queueShoppingCheck(storage, {
      revisionId: "revision-a",
      shoppingListItemId: "rice",
      checked: true
    })
    queueShoppingCheck(storage, {
      revisionId: "revision-a",
      shoppingListItemId: "rice",
      checked: false
    })
    queueShoppingCheck(storage, {
      revisionId: "revision-b",
      shoppingListItemId: "rice",
      checked: true
    })

    expect(loadQueuedShoppingChecks(storage, "revision-a")).toEqual([
      { revisionId: "revision-a", shoppingListItemId: "rice", checked: false }
    ])
    expect(loadQueuedShoppingChecks(storage, "revision-b")).toEqual([
      { revisionId: "revision-b", shoppingListItemId: "rice", checked: true }
    ])
  })

  test("replays deterministically and removes only successful entries", async () => {
    const storage = memoryStorage()
    queueShoppingCheck(storage, {
      revisionId: "revision-a",
      shoppingListItemId: "rice",
      checked: true
    })
    queueShoppingCheck(storage, {
      revisionId: "revision-a",
      shoppingListItemId: "tofu",
      checked: false
    })
    const send = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("offline"))

    await expect(replayQueuedShoppingChecks(storage, "revision-a", send)).resolves.toEqual({
      applied: 1,
      remaining: 1
    })
    expect(send.mock.calls).toEqual([
      ["rice", true],
      ["tofu", false]
    ])
    expect(loadQueuedShoppingChecks(storage, "revision-a")).toEqual([
      { revisionId: "revision-a", shoppingListItemId: "tofu", checked: false }
    ])
  })

  test("is bounded and treats malformed device data as empty", () => {
    const storage = memoryStorage()
    storage.setItem(SHOPPING_CHECK_QUEUE_KEY, "not-json")
    expect(loadQueuedShoppingChecks(storage, "revision-a")).toEqual([])

    for (let index = 0; index < 205; index += 1) {
      queueShoppingCheck(storage, {
        revisionId: "revision-a",
        shoppingListItemId: `item-${String(index)}`,
        checked: true
      })
    }
    const queue = loadQueuedShoppingChecks(storage, "revision-a")
    expect(queue).toHaveLength(200)
    expect(queue[0]?.shoppingListItemId).toBe("item-5")
  })
})
