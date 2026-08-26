import { describe, expect, test } from "vitest"

import { canonicalJson, canonicalUtf8, sortSetByStableKey } from "@/domain/shared/canonical-json"

describe("canonicalJson", () => {
  test("recursively sorts object keys while retaining array order", () => {
    expect(
      canonicalJson({
        z: 1,
        nested: { b: true, a: "first" },
        ordered: [{ second: 2, first: 1 }, "last"]
      })
    ).toBe('{"nested":{"a":"first","b":true},"ordered":[{"first":1,"second":2},"last"],"z":1}')
  })

  test("produces byte-equivalent UTF-8 for reordered object input", () => {
    const first = canonicalUtf8({ food: { code: "gao", label: "Gạo" }, version: "1" })
    const second = canonicalUtf8({ version: "1", food: { label: "Gạo", code: "gao" } })

    expect(first).toEqual(second)
    expect(new TextDecoder().decode(first)).toContain("Gạo")
  })

  test("rejects values that JSON cannot represent authoritatively", () => {
    expect(() => canonicalJson({ value: undefined })).toThrowError("UNSUPPORTED_CANONICAL_VALUE")
    expect(() => canonicalJson({ value: Number.NaN })).toThrowError("UNSUPPORTED_CANONICAL_VALUE")
  })
})

describe("sortSetByStableKey", () => {
  test("sorts a set-like collection without mutating the caller", () => {
    const input = [
      { code: "soy", status: "absent" },
      { code: "egg", status: "contains" }
    ] as const

    const sorted = sortSetByStableKey(input, (item) => item.code)

    expect(sorted).toEqual([
      { code: "egg", status: "contains" },
      { code: "soy", status: "absent" }
    ])
    expect(input[0]?.code).toBe("soy")
  })

  test("uses canonical content as a deterministic tie breaker", () => {
    const first = sortSetByStableKey(
      [
        { code: "same", value: "b" },
        { code: "same", value: "a" }
      ],
      (item) => item.code
    )
    const second = sortSetByStableKey([...first].reverse(), (item) => item.code)

    expect(first).toEqual(second)
    expect(first.map((item) => item.value)).toEqual(["a", "b"])
  })
})
