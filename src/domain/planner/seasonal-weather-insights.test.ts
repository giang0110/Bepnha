import { describe, expect, test } from "vitest"
import {
  analyzeSeasonalBalance,
  detectDishThermalAffinity,
  detectSeasonFromDate,
  seasonLabelVi
} from "./seasonal-weather-insights"

describe("seasonal-weather-insights", () => {
  describe("detectSeasonFromDate", () => {
    test("detects Vietnamese spring (Feb - Apr)", () => {
      expect(detectSeasonFromDate("2026-02-15")).toBe("spring")
      expect(detectSeasonFromDate("2026-03-20")).toBe("spring")
      expect(detectSeasonFromDate("2026-04-10")).toBe("spring")
    })

    test("detects Vietnamese summer (May - Aug)", () => {
      expect(detectSeasonFromDate("2026-05-01")).toBe("summer")
      expect(detectSeasonFromDate("2026-06-15")).toBe("summer")
      expect(detectSeasonFromDate("2026-07-20")).toBe("summer")
      expect(detectSeasonFromDate("2026-08-15")).toBe("summer")
    })

    test("detects Vietnamese autumn (Sep - Nov)", () => {
      expect(detectSeasonFromDate("2026-09-02")).toBe("autumn")
      expect(detectSeasonFromDate("2026-10-15")).toBe("autumn")
      expect(detectSeasonFromDate("2026-11-20")).toBe("autumn")
    })

    test("detects Vietnamese winter (Dec - Jan)", () => {
      expect(detectSeasonFromDate("2026-12-25")).toBe("winter")
      expect(detectSeasonFromDate("2026-01-10")).toBe("winter")
    })
  })

  describe("seasonLabelVi", () => {
    test("returns descriptive Vietnamese label for each season", () => {
      expect(seasonLabelVi("spring")).toBe("Mùa Xuân")
      expect(seasonLabelVi("summer")).toBe("Mùa Hè (Nắng nóng)")
      expect(seasonLabelVi("autumn")).toBe("Mùa Thu (Mát dịu)")
      expect(seasonLabelVi("winter")).toBe("Mùa Đông (Se lạnh)")
    })
  })

  describe("detectDishThermalAffinity", () => {
    test("classifies cooling dishes (thanh nhiệt, giải nhiệt, canh chua, món luộc)", () => {
      expect(detectDishThermalAffinity("Canh chua cá lóc")).toBe("cooling")
      expect(detectDishThermalAffinity("Canh ngao nấu chua")).toBe("cooling")
      expect(detectDishThermalAffinity("Rau muống luộc")).toBe("cooling")
      expect(detectDishThermalAffinity("Thịt ba chỉ luộc")).toBe("cooling")
      expect(detectDishThermalAffinity("Canh bí đao thịt băm")).toBe("cooling")
      expect(detectDishThermalAffinity("Canh gà lá giang")).toBe("cooling")
      expect(detectDishThermalAffinity("Bún chả Hà Nội")).toBe("cooling")
    })

    test("classifies warming dishes (kho gừng, kho tiêu, sả ớt, bò kho, lẩu)", () => {
      expect(detectDishThermalAffinity("Gà kho gừng")).toBe("warming")
      expect(detectDishThermalAffinity("Cá basa kho tiêu")).toBe("warming")
      expect(detectDishThermalAffinity("Gà xào sả ớt")).toBe("warming")
      expect(detectDishThermalAffinity("Bò kho cà rốt")).toBe("warming")
      expect(detectDishThermalAffinity("Thịt ba chỉ rang cháy cạnh")).toBe("warming")
      expect(detectDishThermalAffinity("Lẩu gà lá é")).toBe("warming")
      expect(detectDishThermalAffinity("Canh dưa bò")).toBe("warming")
    })

    test("classifies neutral dishes (món xào đỗ, canh trứng, đậu phụ)", () => {
      expect(detectDishThermalAffinity("Thịt xào đậu cô ve")).toBe("neutral")
      expect(detectDishThermalAffinity("Đậu hũ sốt cà chua")).toBe("neutral")
      expect(detectDishThermalAffinity("Canh cà chua trứng")).toBe("neutral")
      expect(detectDishThermalAffinity("Bắp cải xào")).toBe("neutral")
    })
  })

  describe("analyzeSeasonalBalance", () => {
    const summerWeekStart = "2026-06-15"
    const winterWeekStart = "2026-12-14"

    test("analyzes summer week and provides cooling advisory if warming dishes dominate", () => {
      const items = [
        { dayIndex: 0, mealOptionNameVi: "Thịt kho trứng" },
        { dayIndex: 1, mealOptionNameVi: "Gà kho gừng" },
        { dayIndex: 2, mealOptionNameVi: "Cá basa kho tiêu" },
        { dayIndex: 3, mealOptionNameVi: "Bò kho cà rốt" },
        { dayIndex: 4, mealOptionNameVi: "Thịt rang cháy cạnh" },
        { dayIndex: 5, mealOptionNameVi: "Lẩu gà lá é" },
        { dayIndex: 6, mealOptionNameVi: "Sườn ram mặn" }
      ]

      const report = analyzeSeasonalBalance(items, summerWeekStart)

      expect(report.season).toBe("summer")
      expect(report.warmingCount).toBeGreaterThan(4)
      expect(report.coolingCount).toBe(0)
      expect(report.advisoryVi).toContain("nắng nóng")
      expect(report.advisoryVi).toContain("thanh nhiệt")
      expect(report.suggestedDayToAdjust).toBeDefined()
    })

    test("recognizes balanced cooling dishes during summer", () => {
      const items = [
        { dayIndex: 0, mealOptionNameVi: "Thịt ba chỉ luộc" },
        { dayIndex: 1, mealOptionNameVi: "Canh chua cá lóc" },
        { dayIndex: 2, mealOptionNameVi: "Canh ngao nấu chua" },
        { dayIndex: 3, mealOptionNameVi: "Đậu hũ sốt cà chua" },
        { dayIndex: 4, mealOptionNameVi: "Gà hấp lá chanh" },
        { dayIndex: 5, mealOptionNameVi: "Bún chả Hà Nội" },
        { dayIndex: 6, mealOptionNameVi: "Canh bí đao thịt băm" }
      ]

      const report = analyzeSeasonalBalance(items, summerWeekStart)

      expect(report.coolingCount).toBeGreaterThanOrEqual(4)
      expect(report.advisoryVi).toContain("rất phù hợp")
    })

    test("analyzes winter week and recommends warming meals", () => {
      const items = [
        { dayIndex: 0, mealOptionNameVi: "Rau muống luộc" },
        { dayIndex: 1, mealOptionNameVi: "Canh chua cá lóc" },
        { dayIndex: 2, mealOptionNameVi: "Thịt luộc cà pháo" },
        { dayIndex: 3, mealOptionNameVi: "Canh ngao nấu chua" },
        { dayIndex: 4, mealOptionNameVi: "Đậu hũ sốt cà chua" },
        { dayIndex: 5, mealOptionNameVi: "Bún chả Hà Nội" },
        { dayIndex: 6, mealOptionNameVi: "Canh bí đao" }
      ]

      const report = analyzeSeasonalBalance(items, winterWeekStart)

      expect(report.season).toBe("winter")
      expect(report.coolingCount).toBeGreaterThan(4)
      expect(report.warmingCount).toBe(0)
      expect(report.advisoryVi).toContain("se lạnh")
      expect(report.advisoryVi).toContain("ấm nồng")
    })

    test("supports overriding weather tendency to simulate hot or cold rainy days", () => {
      const items = [
        { dayIndex: 0, mealOptionNameVi: "Gà kho gừng" },
        { dayIndex: 1, mealOptionNameVi: "Cá basa kho tiêu" }
      ]

      const hotOverride = analyzeSeasonalBalance(items, "2026-10-15", "hot")
      expect(hotOverride.weatherTendency).toBe("hot")
      expect(hotOverride.advisoryVi).toContain("nắng nóng")

      const coldOverride = analyzeSeasonalBalance(items, "2026-10-15", "cold_rainy")
      expect(coldOverride.weatherTendency).toBe("cold_rainy")
      expect(coldOverride.advisoryVi).toContain("mưa rét")
    })
  })
})
