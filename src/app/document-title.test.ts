import { describe, expect, test } from "vitest"

import { documentTitle } from "./document-title"

describe("documentTitle", () => {
  test("names the page before the app, because a tab shows the start of the string", () => {
    expect(documentTitle("/plan")).toBe("Kế hoạch tuần · Bếp Nhà")
    expect(documentTitle("/pantry")).toBe("Tủ bếp · Bếp Nhà")
  })

  test("fills in a route parameter without matching a different depth", () => {
    expect(documentTitle("/shopping/40000000-0000-0000-0000-000000000001")).toBe("Đi chợ · Bếp Nhà")
    expect(documentTitle("/shopping")).toBe("Bếp Nhà")
  })

  test("prefers the more specific route when one path is a prefix of another", () => {
    // /plan/:dayIndex/cook must not be answered by /plan.
    expect(documentTitle("/plan/2/cook")).toBe("Đang nấu · Bếp Nhà")
    expect(documentTitle("/plan")).toBe("Kế hoạch tuần · Bếp Nhà")
  })

  test("treats a trailing slash as the same page", () => {
    expect(documentTitle("/pantry/")).toBe("Tủ bếp · Bếp Nhà")
  })

  test("falls back to the app name rather than inventing a name for a page that does not exist", () => {
    expect(documentTitle("/nope")).toBe("Bếp Nhà")
    expect(documentTitle("/")).toBe("Bếp Nhà")
  })

  test("does not let a parameter swallow a deeper path", () => {
    expect(documentTitle("/shopping/abc/extra")).toBe("Bếp Nhà")
  })
})
