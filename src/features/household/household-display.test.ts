import { describe, expect, test } from "vitest"

import { memberGroupLabel, ruleLabel } from "./household-display"

describe("memberGroupLabel", () => {
  test("names the groups it knows", () => {
    expect(memberGroupLabel({ memberKind: "adult", ageBand: "adult", memberCount: 2 })).toBe(
      "2 người lớn"
    )
    expect(memberGroupLabel({ memberKind: "elderly", ageBand: "elderly", memberCount: 1 })).toBe(
      "1 người cao tuổi"
    )
    expect(memberGroupLabel({ memberKind: "child", ageBand: "4_6", memberCount: 2 })).toBe(
      "2 trẻ 4–6 tuổi"
    )
  })

  test("names a child band the client does not know rather than printing undefined", () => {
    // These values come from the database, so a band added by a migration that lands before this
    // client deploys arrives here as a string TypeScript already believed impossible. "1 undefined"
    // on a household's own screen is worse than "1 trẻ em".
    expect(
      memberGroupLabel({ memberKind: "child", ageBand: "18_20", memberCount: 1 } as never)
    ).toBe("1 trẻ em")
  })
})

describe("ruleLabel", () => {
  test("falls back to the code rather than blanking an unknown rule", () => {
    expect(ruleLabel("definitely_not_a_rule")).toBe("definitely_not_a_rule")
  })
})
