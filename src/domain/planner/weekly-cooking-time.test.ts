import { describe, expect, test } from "vitest"
import {
  analyzeWeeklyCookingTime,
  classifyCookingEffort,
  formatMinutesToHoursAndMinutesVi,
  type DayCookingTimeInput
} from "./weekly-cooking-time"

describe("weekly-cooking-time domain", () => {
  describe("classifyCookingEffort", () => {
    test("classifies meals <= 30 mins as quick", () => {
      expect(classifyCookingEffort(15)).toBe("quick")
      expect(classifyCookingEffort(30)).toBe("quick")
    })

    test("classifies meals between 31 and 45 mins as standard", () => {
      expect(classifyCookingEffort(31)).toBe("standard")
      expect(classifyCookingEffort(40)).toBe("standard")
      expect(classifyCookingEffort(45)).toBe("standard")
    })

    test("classifies meals > 45 mins as leisure", () => {
      expect(classifyCookingEffort(46)).toBe("leisure")
      expect(classifyCookingEffort(60)).toBe("leisure")
      expect(classifyCookingEffort(90)).toBe("leisure")
    })
  })

  describe("formatMinutesToHoursAndMinutesVi", () => {
    test("formats 0 or negative minutes cleanly", () => {
      expect(formatMinutesToHoursAndMinutesVi(0)).toBe("0 phút")
      expect(formatMinutesToHoursAndMinutesVi(-10)).toBe("0 phút")
    })

    test("formats sub-hour minutes", () => {
      expect(formatMinutesToHoursAndMinutesVi(25)).toBe("25 phút")
      expect(formatMinutesToHoursAndMinutesVi(45)).toBe("45 phút")
    })

    test("formats exact hours", () => {
      expect(formatMinutesToHoursAndMinutesVi(60)).toBe("1 giờ")
      expect(formatMinutesToHoursAndMinutesVi(120)).toBe("2 giờ")
    })

    test("formats hours and minutes together", () => {
      expect(formatMinutesToHoursAndMinutesVi(75)).toBe("1 giờ 15 phút")
      expect(formatMinutesToHoursAndMinutesVi(245)).toBe("4 giờ 5 phút")
    })
  })

  describe("analyzeWeeklyCookingTime", () => {
    test("handles empty items safely", () => {
      const summary = analyzeWeeklyCookingTime([])
      expect(summary.totalMinutes).toBe(0)
      expect(summary.formattedTotalTimeVi).toBe("0 phút")
      expect(summary.averageMinutes).toBe(0)
      expect(summary.quickMealCount).toBe(0)
      expect(summary.standardMealCount).toBe(0)
      expect(summary.leisureMealCount).toBe(0)
      expect(summary.fastestMeal).toBeNull()
      expect(summary.longestMeal).toBeNull()
      expect(summary.days).toHaveLength(0)
      expect(summary.scheduleInsights).toHaveLength(0)
    })

    test("analyzes realistic 7-day Vietnamese family meal plan", () => {
      const sampleItems: DayCookingTimeInput[] = [
        { dayIndex: 0, mealOptionNameVi: "Thịt băm xào hành & Canh cải", elapsedMinutes: 25 },
        { dayIndex: 1, mealOptionNameVi: "Cá diêu hồng rán giòn & Canh chua", elapsedMinutes: 35 },
        { dayIndex: 2, mealOptionNameVi: "Trứng đúc thịt & Rau muống luộc", elapsedMinutes: 20 },
        { dayIndex: 3, mealOptionNameVi: "Sườn ram mặn ngọt & Canh bí đỏ", elapsedMinutes: 40 },
        { dayIndex: 4, mealOptionNameVi: "Đậu sốt cà chua & Canh mồng tơi", elapsedMinutes: 30 },
        { dayIndex: 5, mealOptionNameVi: "Thịt kho tàu nước dừa & Dưa chua", elapsedMinutes: 55 },
        { dayIndex: 6, mealOptionNameVi: "Bò kho gừng xả & Canh bắp cải", elapsedMinutes: 60 }
      ]

      const summary = analyzeWeeklyCookingTime(sampleItems)

      // Total: 25 + 35 + 20 + 40 + 30 + 55 + 60 = 265 mins (4 hours 25 mins)
      expect(summary.totalMinutes).toBe(265)
      expect(summary.formattedTotalTimeVi).toBe("4 giờ 25 phút")
      expect(summary.averageMinutes).toBe(38) // 265 / 7 = 37.85 -> 38

      // Counts: Quick (<=30m): 25, 20, 30 = 3; Standard (31-45m): 35, 40 = 2; Leisure (>45m): 55, 60 = 2
      expect(summary.quickMealCount).toBe(3)
      expect(summary.standardMealCount).toBe(2)
      expect(summary.leisureMealCount).toBe(2)

      // Fastest & Longest
      expect(summary.fastestMeal?.dayLabelVi).toBe("Thứ Tư") // dayIndex 2
      expect(summary.fastestMeal?.elapsedMinutes).toBe(20)
      expect(summary.longestMeal?.dayLabelVi).toBe("Chủ Nhật") // dayIndex 6
      expect(summary.longestMeal?.elapsedMinutes).toBe(60)

      // Weekday (25+35+20+40+30)/5 = 30m vs Weekend (55+60)/2 = 57.5 -> 58m
      expect(summary.weekdayAverageMinutes).toBe(30)
      expect(summary.weekendAverageMinutes).toBe(58)

      // 7 days preserved and sorted by dayIndex
      expect(summary.days).toHaveLength(7)
      expect(summary.days[0]?.dayLabelVi).toBe("Thứ Hai")
      expect(summary.days[0]?.category).toBe("quick")
      expect(summary.days[5]?.isWeekend).toBe(true)

      // Schedule insights generated
      expect(summary.scheduleInsights.length).toBeGreaterThan(0)
      expect(
        summary.scheduleInsights.some((insight) => insight.toLowerCase().includes("cuối tuần"))
      ).toBe(true)
    })

    test("flags heavy weekday meal for advance prep insight", () => {
      const items: DayCookingTimeInput[] = [
        { dayIndex: 0, mealOptionNameVi: "Bò kho bánh mì", elapsedMinutes: 65 }, // Heavy on Monday
        { dayIndex: 1, mealOptionNameVi: "Trứng chiên", elapsedMinutes: 20 },
        { dayIndex: 2, mealOptionNameVi: "Đậu phụ rán", elapsedMinutes: 20 },
        { dayIndex: 3, mealOptionNameVi: "Canh rau ngót", elapsedMinutes: 20 },
        { dayIndex: 4, mealOptionNameVi: "Thịt luộc", elapsedMinutes: 25 },
        { dayIndex: 5, mealOptionNameVi: "Cá kho", elapsedMinutes: 30 },
        { dayIndex: 6, mealOptionNameVi: "Gà hấp", elapsedMinutes: 30 }
      ]

      const summary = analyzeWeeklyCookingTime(items)
      expect(summary.scheduleInsights.some((s) => s.includes("Thứ Hai"))).toBe(true)
    })
  })
})
