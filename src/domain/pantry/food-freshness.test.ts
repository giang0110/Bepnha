import { describe, expect, test } from "vitest"
import { classifyFoodFreshness, sortPantryByUrgency } from "./food-freshness"

describe("food-freshness domain", () => {
  test("classifies leafy greens, sprouts, and fresh tofu as highly perishable (1–3 days)", () => {
    const leafyGreens = [
      "Rau muống",
      "Rau dền",
      "Rau ngót",
      "Cải ngọt",
      "Xà lách",
      "Giá đỗ",
      "Hành lá",
      "Ngò rí",
      "Đậu hũ non",
      "Nấm rơm"
    ]

    for (const item of leafyGreens) {
      const info = classifyFoodFreshness(item)
      expect(info.category, `Expected ${item} to be leafy_vegetable`).toBe("leafy_vegetable")
      expect(info.isUrgent).toBe(true)
      expect(info.urgencyPriority).toBe(3)
      expect(info.shelfLifeVi).toContain("1–3 ngày")
    }
  })

  test("classifies fresh meat, poultry, fish and seafood with 1–2 days shelf life", () => {
    const proteins = [
      "Thịt ba chỉ",
      "Thịt nạc vai heo",
      "Sườn heo",
      "Thịt bò bắp",
      "Thịt gà ta",
      "Cá lóc",
      "Cá basa",
      "Tôm thẻ",
      "Mực nang",
      "Ngao hoa"
    ]

    for (const item of proteins) {
      const info = classifyFoodFreshness(item)
      expect(info.category, `Expected ${item} to be fresh_meat_seafood`).toBe("fresh_meat_seafood")
      expect(info.isUrgent).toBe(true)
      expect(info.urgencyPriority).toBe(3)
      expect(info.shelfLifeVi).toContain("1–2 ngày")
    }
  })

  test("classifies root vegetables, cabbage and eggs with 7–14 days shelf life", () => {
    const durableProduce = [
      "Cà rốt",
      "Khoai tây",
      "Bí đỏ",
      "Bí đao",
      "Bắp cải trắng",
      "Cà chua",
      "Đậu cô ve",
      "Hành tây",
      "Trứng gà",
      "Tỏi",
      "Gừng"
    ]

    for (const item of durableProduce) {
      const info = classifyFoodFreshness(item)
      expect(info.category, `Expected ${item} to be root_vegetable_egg`).toBe("root_vegetable_egg")
      expect(info.isUrgent).toBe(false)
      expect(info.urgencyPriority).toBe(2)
      expect(info.shelfLifeVi).toContain("7–14 ngày")
    }
  })

  test("classifies staples, oils and spices as long shelf life", () => {
    const staples = [
      "Gạo tẻ ST25",
      "Nước mắm Phú Quốc",
      "Muối tinh",
      "Dầu ăn Simply",
      "Hạt nêm",
      "Tiêu xay"
    ]

    for (const item of staples) {
      const info = classifyFoodFreshness(item)
      expect(info.category, `Expected ${item} to be dry_and_spices`).toBe("dry_and_spices")
      expect(info.isUrgent).toBe(false)
      expect(info.urgencyPriority).toBe(1)
    }
  })

  test("classifies dried proteins and mushrooms as long shelf life dry goods", () => {
    const driedFoods = [
      "Tôm khô Cà Mau",
      "Cá khô",
      "Cá cơm khô",
      "Mực khô",
      "Tép khô",
      "Khô bò",
      "Khô gà lá chanh",
      "Lạp xưởng Mai Quế Lộ",
      "Nấm hương khô",
      "Mộc nhĩ",
      "Nấm mèo",
      "Măng khô",
      "Rong biển khô"
    ]

    for (const item of driedFoods) {
      const info = classifyFoodFreshness(item)
      expect(info.category, `Expected ${item} to be dry_and_spices`).toBe("dry_and_spices")
      expect(info.isUrgent, `Expected ${item} to not be urgent`).toBe(false)
      expect(info.urgencyPriority).toBe(1)
      expect(info.shelfLifeVi).toContain("vài tháng")
    }
  })

  test("distinguishes dried food from braised meat/fish dishes (kho vs khô)", () => {
    // Braised leftovers contain fresh meat/seafood and must remain perishable
    const braisedDishes = ["Thịt kho tàu", "Thịt ba chỉ kho tiêu", "Cá kho tộ", "Cá bống kho"]
    for (const item of braisedDishes) {
      const info = classifyFoodFreshness(item)
      expect(info.category, `Expected ${item} to be fresh_meat_seafood`).toBe("fresh_meat_seafood")
      expect(info.isUrgent).toBe(true)
    }
  })

  test("correctly classifies Vietnamese eggplant varieties and northern produce without misidentifying as fish", () => {
    const eggplants = ["Cà bát muối", "Cà bát tươi", "Cà dừa", "Su hào"]
    for (const item of eggplants) {
      const info = classifyFoodFreshness(item)
      expect(info.category, `Expected ${item} to be root_vegetable_egg`).toBe("root_vegetable_egg")
      expect(info.isUrgent).toBe(false)
    }

    const greens = ["Cần tây", "Dưa chuột"]
    for (const item of greens) {
      const info = classifyFoodFreshness(item)
      expect(info.category, `Expected ${item} to be leafy_vegetable`).toBe("leafy_vegetable")
      expect(info.isUrgent).toBe(true)
    }
  })

  test("sorts pantry items prioritizing urgent fresh ingredients first", () => {
    const items = [
      { name: "Nước mắm" },
      { name: "Khoai tây" },
      { name: "Rau muống" },
      { name: "Gạo" },
      { name: "Thịt ba chỉ" }
    ]

    const sorted = sortPantryByUrgency(items, (item) => item.name)

    // First two items should be urgency priority 3 (Rau muống and Thịt ba chỉ)
    const firstTwo = sorted.slice(0, 2).map((i) => i.name)
    expect(firstTwo).toContain("Rau muống")
    expect(firstTwo).toContain("Thịt ba chỉ")

    // Third should be Khoai tây (priority 2)
    expect(sorted[2]?.name).toBe("Khoai tây")

    // Last should be shelf-stable staples (priority 1)
    const lastTwo = sorted.slice(3).map((i) => i.name)
    expect(lastTwo).toContain("Gạo")
    expect(lastTwo).toContain("Nước mắm")
  })
})
