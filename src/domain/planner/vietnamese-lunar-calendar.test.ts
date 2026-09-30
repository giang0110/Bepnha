import { describe, expect, test } from "vitest"
import {
  solarToVietnameseLunar,
  isLunarVegetarianDay,
  getLunarDayLabel
} from "./vietnamese-lunar-calendar"

describe("vietnamese-lunar-calendar", () => {
  test("correctly calculates Mid-Autumn festival 2026 (15/8 lunar)", () => {
    // 25/09/2026 is Rằm Trung Thu (15/8/2026 Âm lịch)
    const result = solarToVietnameseLunar("2026-09-25")
    expect(result.day).toBe(15)
    expect(result.month).toBe(8)
    expect(result.year).toBe(2026)
    expect(result.isLeap).toBe(false)
    expect(result.isVegetarianDay).toBe(true)
    expect(result.formattedShort).toBe("15/8 Âl")
    expect(result.specialDayLabel).toBe("Rằm tháng 8 Âm lịch")
  })

  test("correctly calculates Lunar New Year 2025 (Mùng 1 Tết Ất Tỵ)", () => {
    // 29/01/2025 is Mùng 1 tháng 1 Âm lịch
    const result = solarToVietnameseLunar("2025-01-29")
    expect(result.day).toBe(1)
    expect(result.month).toBe(1)
    expect(result.year).toBe(2025)
    expect(result.isVegetarianDay).toBe(true)
    expect(result.formattedShort).toBe("1/1 Âl")
    expect(result.specialDayLabel).toBe("Mùng 1 Âm lịch")
  })

  test("correctly identifies Rằm tháng Giêng 2025", () => {
    // 12/02/2025 is 15/1/2025 Âm lịch
    const result = solarToVietnameseLunar("2025-02-12")
    expect(result.day).toBe(15)
    expect(result.month).toBe(1)
    expect(result.isVegetarianDay).toBe(true)
    expect(result.specialDayLabel).toBe("Rằm tháng 1 Âm lịch")
  })

  test("correctly identifies normal day without special label", () => {
    // 30/09/2026 is 20/8/2026 Âm lịch
    const result = solarToVietnameseLunar("2026-09-30")
    expect(result.day).toBe(20)
    expect(result.month).toBe(8)
    expect(result.isVegetarianDay).toBe(false)
    expect(result.formattedShort).toBe("20/8 Âl")
    expect(result.specialDayLabel).toBeNull()
  })

  test("accepts Date object instance as input", () => {
    const date = new Date(2026, 8, 25) // Month is 0-indexed in JS (8 = September)
    const result = solarToVietnameseLunar(date)
    expect(result.day).toBe(15)
    expect(result.month).toBe(8)
  })

  test("isLunarVegetarianDay returns true only for 1st and 15th lunar day", () => {
    expect(isLunarVegetarianDay("2026-09-25")).toBe(true) // 15/8 Âl
    expect(isLunarVegetarianDay("2025-01-29")).toBe(true) // 1/1 Âl
    expect(isLunarVegetarianDay("2026-09-30")).toBe(false) // 20/8 Âl
  })

  test("getLunarDayLabel returns concise string", () => {
    expect(getLunarDayLabel("2026-09-25")).toBe("15/8 Âl (Rằm)")
    expect(getLunarDayLabel("2025-01-29")).toBe("1/1 Âl (Mùng 1)")
    expect(getLunarDayLabel("2026-09-30")).toBe("20/8 Âl")
  })
})
