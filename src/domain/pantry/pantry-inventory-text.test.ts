import { describe, expect, test } from "vitest"
import {
  filterPantryItems,
  formatPantryInventoryText,
  normalizeVietnameseSearchText,
  type PantryInventoryEntry
} from "./pantry-inventory-text.js"

describe("normalizeVietnameseSearchText", () => {
  test("removes accents and converts to lowercase", () => {
    expect(normalizeVietnameseSearchText("Trứng Gà")).toBe("trung ga")
    expect(normalizeVietnameseSearchText("Thịt Heo Nạc")).toBe("thit heo nac")
    expect(normalizeVietnameseSearchText("Đậu Hũ")).toBe("dau hu")
    expect(normalizeVietnameseSearchText("  NƯỚC MẮM  ")).toBe("nuoc mam")
  })
})

describe("filterPantryItems", () => {
  const sampleItems: readonly PantryInventoryEntry[] = [
    {
      foodNameVi: "Trứng gà ta",
      quantity: "10",
      unitName: "quả",
      zone: "chilled",
      isUrgent: false
    },
    {
      foodNameVi: "Cà chua bi",
      quantity: "500",
      unitName: "g",
      zone: "chilled",
      isUrgent: true,
      expiryLabel: "Còn 1 ngày"
    },
    {
      foodNameVi: "Thịt ba chỉ",
      quantity: "400",
      unitName: "g",
      zone: "frozen",
      isUrgent: false
    },
    {
      foodNameVi: "Cá thu phi lê",
      quantity: "300",
      unitName: "g",
      zone: "frozen",
      isUrgent: true,
      expiryLabel: "Cần dùng sớm"
    },
    {
      foodNameVi: "Nước mắm cá cơm",
      quantity: "500",
      unitName: "ml",
      zone: "ambient",
      isUrgent: false
    },
    {
      foodNameVi: "Gạo lài miên",
      quantity: "5",
      unitName: "kg",
      zone: "ambient",
      isUrgent: false
    }
  ]

  test("returns all items when filter is 'all' and no keyword", () => {
    const result = filterPantryItems(sampleItems, { filter: "all" })
    expect(result).toHaveLength(6)
  })

  test("filters by storage zone", () => {
    const chilled = filterPantryItems(sampleItems, { filter: "chilled" })
    expect(chilled.map((i) => i.foodNameVi)).toEqual(["Trứng gà ta", "Cà chua bi"])

    const frozen = filterPantryItems(sampleItems, { filter: "frozen" })
    expect(frozen.map((i) => i.foodNameVi)).toEqual(["Thịt ba chỉ", "Cá thu phi lê"])

    const ambient = filterPantryItems(sampleItems, { filter: "ambient" })
    expect(ambient.map((i) => i.foodNameVi)).toEqual(["Nước mắm cá cơm", "Gạo lài miên"])
  })

  test("filters by urgent status", () => {
    const urgent = filterPantryItems(sampleItems, { filter: "urgent" })
    expect(urgent.map((i) => i.foodNameVi)).toEqual(["Cà chua bi", "Cá thu phi lê"])
  })

  test("filters by search keyword with accent insensitivity", () => {
    // Unaccented "ca" matches "Cà chua bi" and "Cá thu phi lê"
    const caMatches = filterPantryItems(sampleItems, { keyword: "ca" })
    expect(caMatches.map((i) => i.foodNameVi)).toEqual([
      "Cà chua bi",
      "Cá thu phi lê",
      "Nước mắm cá cơm"
    ])

    // Accented "thịt" matches "Thịt ba chỉ"
    const thitMatches = filterPantryItems(sampleItems, { keyword: "thịt" })
    expect(thitMatches.map((i) => i.foodNameVi)).toEqual(["Thịt ba chỉ"])

    // Unaccented "trung" matches "Trứng gà ta"
    const trungMatches = filterPantryItems(sampleItems, { keyword: "trung" })
    expect(trungMatches.map((i) => i.foodNameVi)).toEqual(["Trứng gà ta"])
  })

  test("combines zone filter and search keyword", () => {
    const chilledCa = filterPantryItems(sampleItems, { filter: "chilled", keyword: "ca" })
    expect(chilledCa.map((i) => i.foodNameVi)).toEqual(["Cà chua bi"])

    const frozenCa = filterPantryItems(sampleItems, { filter: "frozen", keyword: "ca" })
    expect(frozenCa.map((i) => i.foodNameVi)).toEqual(["Cá thu phi lê"])
  })

  test("returns empty array when nothing matches", () => {
    const noMatch = filterPantryItems(sampleItems, { keyword: "thịt bò kobe" })
    expect(noMatch).toEqual([])
  })
})

describe("formatPantryInventoryText", () => {
  test("formats empty pantry correctly", () => {
    const result = formatPantryInventoryText({ entries: [] })
    expect(result).toContain("📦 KIỂM KÊ TỦ BẾP GIA ĐÌNH")
    expect(result).toContain("Tủ bếp hiện đang trống. Chưa có thực phẩm lưu trữ.")
    expect(result).toContain("BepNha — Bếp Nhà")
  })

  test("formats empty pantry with custom household name", () => {
    const result = formatPantryInventoryText({ householdName: "Gia đình Tuấn Anh", entries: [] })
    expect(result).toContain("📦 KIỂM KÊ TỦ BẾP — GIA ĐÌNH TUẤN ANH")
  })

  test("formats populated pantry grouped by zones with urgent annotations", () => {
    const entries: readonly PantryInventoryEntry[] = [
      { foodNameVi: "Trứng gà", quantity: "6", unitName: "quả", zone: "chilled" },
      {
        foodNameVi: "Sữa chua",
        quantity: "2",
        unitName: "hộp",
        zone: "chilled",
        isUrgent: true,
        expiryLabel: "Hôm nay hết hạn"
      },
      { foodNameVi: "Thịt heo", quantity: "300", unitName: "g", zone: "frozen" },
      { foodNameVi: "Gạo thơm", quantity: "5", unitName: "kg", zone: "ambient" }
    ]

    const text = formatPantryInventoryText({
      householdName: "Nhà Giang",
      dateStr: "08/10/2026",
      entries
    })

    expect(text).toContain("📦 KIỂM KÊ TỦ BẾP — NHÀ GIANG (4 loại thực phẩm)")
    expect(text).toContain("Cập nhật ngày: 08/10/2026")
    expect(text).toContain("⚡ Lưu ý: Có 1 món cần ưu tiên dùng sớm!")
    expect(text).toContain("🥬 NGĂN MÁT (2 món):")
    expect(text).toContain("• Trứng gà: 6 quả")
    expect(text).toContain("• Sữa chua: 2 hộp (⚠️ Hôm nay hết hạn)")
    expect(text).toContain("❄️ NGĂN ĐÔNG (1 món):")
    expect(text).toContain("• Thịt heo: 300 g")
    expect(text).toContain("🥫 TỦ ĐỒ KHÔ (1 món):")
    expect(text).toContain("• Gạo thơm: 5 kg")
    expect(text).toContain("BepNha — Bếp Nhà")
  })
})
