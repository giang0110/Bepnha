import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import type { PlanItemView } from "./planner-api"
import { WeeklyNutritionOverviewPanel } from "./weekly-nutrition-overview"

function createMockPlanItem(
  dayIndex: number,
  nutrients: { code: string; amount: string; unit: string }[]
): PlanItemView {
  return {
    dayIndex,
    mealSlot: "primary",
    mealOptionId: `meal-${dayIndex}`,
    mealOptionVersionId: `ver-${dayIndex}`,
    adultEquivalent: "1.0",
    scaleFactor: "1.0",
    mealOptionCode: `M${dayIndex}`,
    mealOptionNameVi: `Món ăn ngày ${dayIndex}`,
    elapsedMinutes: 30,
    components: [],
    scaledIngredients: [],
    nutrition: {
      nutrients: nutrients.map((n) => ({
        nutrientCode: n.code,
        displayAmount: n.amount,
        unitCode: n.unit
      }))
    }
  }
}

describe("WeeklyNutritionOverviewPanel", () => {
  it("renders nutrition overview with averages and macro distribution", () => {
    const items: PlanItemView[] = [
      createMockPlanItem(0, [
        { code: "energy_kcal", amount: "600", unit: "kcal" },
        { code: "protein_g", amount: "30", unit: "g" },
        { code: "carbohydrate_g", amount: "70", unit: "g" },
        { code: "fat_g", amount: "20", unit: "g" },
        { code: "fibre_g", amount: "6", unit: "g" },
        { code: "sodium_mg", amount: "800", unit: "mg" }
      ]),
      createMockPlanItem(1, [
        { code: "energy_kcal", amount: "500", unit: "kcal" },
        { code: "protein_g", amount: "25", unit: "g" },
        { code: "carbohydrate_g", amount: "60", unit: "g" },
        { code: "fat_g", amount: "15", unit: "g" },
        { code: "fibre_g", amount: "5", unit: "g" },
        { code: "sodium_mg", amount: "700", unit: "mg" }
      ])
    ]

    render(<WeeklyNutritionOverviewPanel items={items} />)

    expect(screen.getByText("Cân bằng dinh dưỡng cả tuần")).toBeInTheDocument()
    expect(screen.getByText(/550 kcal/)).toBeInTheDocument()
    expect(screen.getByText(/27,5 g/)).toBeInTheDocument()
    expect(screen.getByText(/Đạm 20,9%/)).toBeInTheDocument()
    expect(screen.getByText(/Tinh bột 49,3%/)).toBeInTheDocument()
    expect(screen.getByText(/Chất béo 29,9%/)).toBeInTheDocument()
  })

  it("allows toggling expanded nutrition details", async () => {
    const user = userEvent.setup()
    const items: PlanItemView[] = [
      createMockPlanItem(0, [
        { code: "energy_kcal", amount: "500", unit: "kcal" },
        { code: "protein_g", amount: "20", unit: "g" },
        { code: "carbohydrate_g", amount: "60", unit: "g" },
        { code: "fat_g", amount: "15", unit: "g" }
      ])
    ]

    render(<WeeklyNutritionOverviewPanel items={items} />)

    const toggleButton = screen.getByRole("button", { name: /chi tiết dinh dưỡng/i })
    expect(toggleButton).toBeInTheDocument()

    // Click toggle to collapse/expand
    await user.click(toggleButton)
    expect(screen.queryByText(/Chất xơ/)).not.toBeInTheDocument()

    await user.click(toggleButton)
    expect(screen.getByText(/Chất xơ/)).toBeInTheDocument()
  })
})
