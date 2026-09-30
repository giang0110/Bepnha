import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { PlanItemView } from "./planner-api"
import { ReplacementComparison } from "./replacement-comparison"

const item = (name: string, minutes: number, roles: readonly string[]): PlanItemView =>
  ({
    dayIndex: 2,
    mealOptionNameVi: name,
    elapsedMinutes: minutes,
    components: roles.map((mealRole, sortOrder) => ({ mealRole, sortOrder }))
  }) as unknown as PlanItemView

describe("ReplacementComparison", () => {
  it("compares the changed day and explains full-week basket recalculation", () => {
    render(
      <ReplacementComparison
        current={item("Cá kho", 30, ["main", "vegetable"])}
        replacement={item("Gà hấp", 25, ["main", "soup"])}
        weeklyCostDeltaVnd={-20_000}
      />
    )

    expect(screen.getByText("Cá kho")).toBeInTheDocument()
    expect(screen.getByText("Gà hấp")).toBeInTheDocument()
    expect(screen.getByText(/30 phút/)).toBeInTheDocument()
    expect(screen.getByText(/25 phút/)).toBeInTheDocument()
    expect(screen.getByText(/giảm 20.000 VND/i)).toBeInTheDocument()
    expect(screen.getByText(/giỏ mua của cả 7 bữa được tính lại/i)).toBeInTheDocument()
  })
})
