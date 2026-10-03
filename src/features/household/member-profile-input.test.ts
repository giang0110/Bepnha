import { expect, test } from "vitest"
import { parseMemberMeasurementInput } from "./member-profile-input"
test.each([
  ["65,50", "65.5"],
  ["170,5", "170.5"],
  [" 65.50 ", "65.5"],
  ["", "null"]
])("parses %s without a thousands conversion", (raw, canonical) =>
  expect(parseMemberMeasurementInput(raw)).toEqual({
    ok: true,
    value: canonical === "null" ? null : canonical
  })
)
test.each(["1,700", "1.700", "65,5.0", "6e1", "-65", "65kg", "65."])(
  "rejects ambiguous or invalid measurement %s",
  (raw) => expect(parseMemberMeasurementInput(raw).ok).toBe(false)
)
