import { describe, expect, test } from "vitest"
import {
  detectProteinGroup,
  isWeekendDish,
  analyzeWeeklyRotation,
  proteinGroupLabel,
  type MealRotationItem
} from "./meal-rotation-insights"

function mockItem(dayIndex: number, mealName: string, elapsedMinutes = 30): MealRotationItem {
  return {
    dayIndex,
    mealOptionNameVi: mealName,
    elapsedMinutes
  }
}

describe("meal-rotation-insights", () => {
  describe("detectProteinGroup", () => {
    test("detects pork dishes", () => {
      expect(detectProteinGroup("Thịt kho tàu")).toBe("pork")
      expect(detectProteinGroup("Sườn xào chua ngọt")).toBe("pork")
      expect(detectProteinGroup("Thịt ba chỉ luộc")).toBe("pork")
      expect(detectProteinGroup("Canh bí đỏ thịt băm")).toBe("pork")
    })

    test("detects beef dishes", () => {
      expect(detectProteinGroup("Bò xào cần tỏi")).toBe("beef")
      expect(detectProteinGroup("Bắp bò kho gừng")).toBe("beef")
      expect(detectProteinGroup("Canh dưa bò")).toBe("beef")
    })

    test("detects poultry dishes", () => {
      expect(detectProteinGroup("Gà rang gừng")).toBe("poultry")
      expect(detectProteinGroup("Cánh gà chiên mắm")).toBe("poultry")
      expect(detectProteinGroup("Vịt om sấu")).toBe("poultry")
    })

    test("detects seafood dishes", () => {
      expect(detectProteinGroup("Cá thu sốt cà chua")).toBe("seafood")
      expect(detectProteinGroup("Tôm rim thịt")).toBe("seafood")
      expect(detectProteinGroup("Mực xào chua ngọt")).toBe("seafood")
      expect(detectProteinGroup("Canh ngao nấu chua")).toBe("seafood")
    })

    test("detects egg and tofu dishes", () => {
      expect(detectProteinGroup("Đậu phụ sốt cà chua")).toBe("egg_tofu")
      expect(detectProteinGroup("Trứng đúc thịt")).toBe("egg_tofu")
      expect(detectProteinGroup("Đậu hũ non sốt nấm")).toBe("egg_tofu")
    })

    test("detects vegetarian dishes", () => {
      expect(detectProteinGroup("Cơm chay dưỡng sinh")).toBe("vegetarian")
      expect(detectProteinGroup("Nấm đùi gà kho tiêu chay")).toBe("vegetarian")
    })

    test("falls back to other for unknown", () => {
      expect(detectProteinGroup("Rau củ luộc thập cẩm")).toBe("other")
    })
  })

  describe("isWeekendDish", () => {
    test("identifies celebratory/gathering weekend dishes", () => {
      expect(isWeekendDish("Bún chả Hà Nội")).toBe(true)
      expect(isWeekendDish("Lẩu gà lá é")).toBe(true)
      expect(isWeekendDish("Bánh xèo miền Tây")).toBe(true)
      expect(isWeekendDish("Phở bò gia truyền")).toBe(true)
      expect(isWeekendDish("Nem rán truyền thống")).toBe(true)
      expect(isWeekendDish("Bò kho bánh mì")).toBe(true)
    })

    test("returns false for regular weekday homecooked dishes", () => {
      expect(isWeekendDish("Thịt rang cháy cạnh")).toBe(false)
      expect(isWeekendDish("Trứng luộc rau muống")).toBe(false)
      expect(isWeekendDish("Cá kho tộ")).toBe(false)
    })
  })

  describe("analyzeWeeklyRotation", () => {
    test("counts proteins and detects consecutive repeat warning", () => {
      const weekStart = "2026-08-24" // Monday
      const items: MealRotationItem[] = [
        mockItem(0, "Thịt kho tàu"), // Pork
        mockItem(1, "Sườn xào chua ngọt"), // Pork (Repeat with day 0!)
        mockItem(2, "Gà rang gừng"), // Poultry
        mockItem(3, "Cá thu rán"), // Seafood
        mockItem(4, "Bò xào cần tỏi"), // Beef
        mockItem(5, "Lẩu gà lá é"), // Poultry (Weekend)
        mockItem(6, "Bún chả Hà Nội") // Pork (Weekend)
      ]

      const report = analyzeWeeklyRotation(items, weekStart)

      expect(report.proteinCounts.pork).toBe(3)
      expect(report.proteinCounts.poultry).toBe(2)
      expect(report.proteinCounts.seafood).toBe(1)
      expect(report.proteinCounts.beef).toBe(1)

      expect(report.consecutiveRepeats).toHaveLength(1)
      const firstRepeat = report.consecutiveRepeats[0]
      expect(firstRepeat).toBeDefined()
      expect(firstRepeat?.dayIndex1).toBe(0)
      expect(firstRepeat?.dayIndex2).toBe(1)
      expect(firstRepeat?.proteinGroup).toBe("pork")
      expect(firstRepeat?.message).toContain("Thứ Hai và Thứ Ba đều dùng Thịt heo")

      expect(report.weekendMeals).toHaveLength(2)
      expect(report.weekendMeals[0]?.isCelebratory).toBe(true)
      expect(report.weekendMeals[1]?.isCelebratory).toBe(true)
    })

    test("detects Lunar vegetarian day in week (e.g. 25/09/2026 is 15/8 lunar)", () => {
      // 2026-09-21 is Monday.
      // Day 0: 2026-09-21 (11/8 Âl)
      // Day 1: 2026-09-22 (12/8 Âl)
      // Day 2: 2026-09-23 (13/8 Âl)
      // Day 3: 2026-09-24 (14/8 Âl)
      // Day 4: 2026-09-25 (15/8 Âl - RẰM TRUNG THU!)
      // Day 5: 2026-09-26 (16/8 Âl)
      // Day 6: 2026-09-27 (17/8 Âl)
      const weekStart = "2026-09-21"
      const items: MealRotationItem[] = [
        mockItem(0, "Thịt kho trứng"),
        mockItem(1, "Canh cá nấu chua"),
        mockItem(2, "Gà hấp lá chanh"),
        mockItem(3, "Bò xào hoa thiên lý"),
        mockItem(4, "Sườn nướng mật ong"), // Day 4 is non-veg on Rằm!
        mockItem(5, "Lẩu riêu cua bắp bò"),
        mockItem(6, "Bún sườn chua")
      ]

      const report = analyzeWeeklyRotation(items, weekStart)

      expect(report.lunarVegetarianDays).toHaveLength(1)
      const lunarDay = report.lunarVegetarianDays[0]
      expect(lunarDay).toBeDefined()
      expect(lunarDay?.dayIndex).toBe(4)
      expect(lunarDay?.lunarDate.day).toBe(15)
      expect(lunarDay?.lunarDate.month).toBe(8)
      expect(lunarDay?.isMealVegetarian).toBe(false)
      expect(lunarDay?.advisory).toContain("Rằm tháng 8 Âm lịch")
    })
  })

  test("proteinGroupLabel returns accurate Vietnamese titles", () => {
    expect(proteinGroupLabel("pork")).toBe("Thịt heo")
    expect(proteinGroupLabel("seafood")).toBe("Cá & Hải sản")
  })
})
