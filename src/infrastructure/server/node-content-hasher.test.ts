// @vitest-environment node

import { describe, expect, test } from "vitest"

import { NodeContentHasher } from "@/infrastructure/server/node-content-hasher"

describe("NodeContentHasher", () => {
  test("returns lowercase SHA-256 hex for canonical UTF-8 bytes", async () => {
    const hasher = new NodeContentHasher()

    await expect(hasher.sha256(new TextEncoder().encode("Bếp Nhà"))).resolves.toBe(
      "ab3f7bde926f0bcd28b83180601234cd3302da56b630bc0f766591ef63a085c7"
    )
  })
})
