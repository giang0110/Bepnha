import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { WeeklyRotationBalanceCard } from "./weekly-rotation-balance-card"
import type { PlanItemView } from "./planner-api"

function item(dayIndex: number, mealName: string): PlanItemView {
  return {
    dayIndex,
    mealSlot: "primary",
    mealOptionId: `meal-${dayIndex}`,
    mealOptionVersionId: `ver-${dayIndex}`,
    adultEquivalent: "2",
    scaleFactor: "1",
    mealOptionCode: `code_${dayIndex}`,
    mealOptionNameVi: mealName,
    elapsedMinutes: 30,
    components: [],
    scaledIngredients: [],
    nutrition: { nutrients: [] }
  }
}

describe("WeeklyRotationBalanceCard", () => {
  test("renders protein distribution accurately", () => {
    const items = [
      item(0, "Thịt kho tàu"),
      item(1, "Sườn chua ngọt"),
      item(2, "Cá hồi áp chảo"),
      item(3, "Bò xào cần tỏi"),
      item(4, "Gà rang gừng"),
      item(5, "Đậu phụ sốt cà chua"),
      item(6, "Bún chả Hà Nội")
    ]

    render(<WeeklyRotationBalanceCard items={items} weekStart="2026-08-24" />)

    expect(screen.getByText(/Cân bằng đạm & Phong tục tuần này/i)).toBeInTheDocument()
    expect(screen.getByText(/Thịt heo:/i)).toBeInTheDocument()
    expect(screen.getByText(/Cá & Hải sản:/i)).toBeInTheDocument()
    expect(screen.getByText(/Thịt bò:/i)).toBeInTheDocument()
  })

  test("displays consecutive repeat warning when adjacent days share same protein", () => {
    const items = [
      item(0, "Gà rang gừng"),
      item(1, "Cánh gà chiên mắm"), // Consecutive poultry
      item(2, "Cá thu rán"),
      item(3, "Bò sốt vang"),
      item(4, "Thịt luộc cà pháo"),
      item(5, "Lẩu thái hải sản"),
      item(6, "Bún sườn chua")
    ]

    render(<WeeklyRotationBalanceCard items={items} weekStart="2026-08-24" />)

    expect(screen.getByText(/Gợi ý đổi vị chống ngán/i)).toBeInTheDocument()
    expect(screen.getByText(/Thứ Hai và Thứ Ba đều dùng Thịt gà\/vịt/i)).toBeInTheDocument()
  })

  test("displays Lunar calendar advisory for Rằm / Mùng 1", () => {
    // 2026-09-21 week has 2026-09-25 as Day 4 (15/8 lunar - Rằm Trung Thu)
    const items = [
      item(0, "Thịt kho tàu"),
      item(1, "Canh cá nấu chua"),
      item(2, "Gà hấp lá chanh"),
      item(3, "Bò xào hoa thiên lý"),
      item(4, "Thịt xiên nướng"), // Day 4 is non-veg on Rằm
      item(5, "Lẩu riêu cua"),
      item(6, "Bún chả")
    ]

    render(<WeeklyRotationBalanceCard items={items} weekStart="2026-09-21" />)

    expect(screen.getByText(/Lịch Âm & Nhắc ngày Ăn Chay/i)).toBeInTheDocument()
    expect(screen.getByText(/Rằm tháng 8 Âm lịch/i)).toBeInTheDocument()
  })
})
