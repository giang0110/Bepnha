import { describe, expect, it } from "vitest"

import {
  formatWeeklyPlanShareText,
  formatWeekRangeLabel,
  type WeeklyPlanShareDishItem
} from "./weekly-plan-share-text"

describe("weekly-plan-share-text", () => {
  it("formats week range label correctly across Monday to Sunday", () => {
    expect(formatWeekRangeLabel("2026-10-05")).toBe("05/10 – 11/10")
    expect(formatWeekRangeLabel("2026-12-28")).toBe("28/12 – 03/01")
  })

  it("formats weekly plan share text with household name and all 7 days", () => {
    const items: WeeklyPlanShareDishItem[] = [
      {
        dayIndex: 0,
        mealName: "Cơm gia đình",
        dishes: ["Thịt kho tàu", "Canh rau ngót nấu tôm", "Cơm trắng"]
      },
      {
        dayIndex: 1,
        mealName: "Bữa cá",
        dishes: ["Cá thu sốt cà chua", "Canh cải cúc thịt băm", "Cơm trắng"]
      },
      {
        dayIndex: 2,
        mealName: "Bữa gà",
        dishes: ["Gà rang sả ớt", "Canh bí xanh sườn", "Cơm trắng"]
      },
      {
        dayIndex: 3,
        mealName: "Bữa bò",
        dishes: ["Thịt bò xào cần tỏi", "Canh mồng tơi mướp", "Cơm trắng"]
      },
      {
        dayIndex: 4,
        mealName: "Bữa tôm",
        dishes: ["Tôm rim thịt", "Canh chua cá lóc", "Cơm trắng"]
      },
      {
        dayIndex: 5,
        mealName: "Bữa sườn",
        dishes: ["Sườn xào chua ngọt", "Canh rong biển đậu hũ", "Cơm trắng"]
      },
      {
        dayIndex: 6,
        mealName: "Đổi vị cuối tuần",
        dishes: ["Bún bò Huế"]
      }
    ]

    const text = formatWeeklyPlanShareText({
      weekStart: "2026-10-05",
      items,
      householdName: "Gia đình Tuấn & Lan"
    })

    expect(text).toContain("📋 Thực đơn Bếp Nhà — Gia đình Tuấn & Lan (Tuần 05/10 – 11/10)")
    expect(text).toContain("• Thứ Hai (05/10): Thịt kho tàu • Canh rau ngót nấu tôm • Cơm trắng")
    expect(text).toContain(
      "• Thứ Ba (06/10): Cá thu sốt cà chua • Canh cải cúc thịt băm • Cơm trắng"
    )
    expect(text).toContain("• Chủ Nhật (11/10): Bún bò Huế")
    expect(text).toContain("👉 Kế hoạch dinh dưỡng gia đình từ Bếp Nhà")
  })

  it("sorts items by day index and handles empty dishes list", () => {
    const items: WeeklyPlanShareDishItem[] = [
      {
        dayIndex: 1,
        mealName: "Cá kho",
        dishes: ["Cá bống kho tộ"]
      },
      {
        dayIndex: 0,
        mealName: "Ăn ngoài cuối tuần",
        dishes: []
      }
    ]

    const text = formatWeeklyPlanShareText({
      weekStart: "2026-10-05",
      items
    })

    expect(text).toContain("📋 Thực đơn Bếp Nhà (Tuần 05/10 – 11/10)")
    const lines = text.split("\n")
    const mondayLineIndex = lines.findIndex((l) => l.includes("Thứ Hai"))
    const tuesdayLineIndex = lines.findIndex((l) => l.includes("Thứ Ba"))

    expect(mondayLineIndex).toBeLessThan(tuesdayLineIndex)
    expect(lines[mondayLineIndex]).toContain("Ăn ngoài cuối tuần")
    expect(lines[tuesdayLineIndex]).toContain("Cá bống kho tộ")
  })
})
