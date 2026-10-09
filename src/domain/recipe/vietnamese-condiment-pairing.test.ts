import { describe, expect, it } from "vitest"

import {
  recommendMealCondiments,
  CONDIMENT_RECIPES,
  type CondimentSauceType,
  type SideDishType
} from "./vietnamese-condiment-pairing"

describe("vietnamese-condiment-pairing domain", () => {
  it("provides comprehensive recipe data for each condiment sauce type", () => {
    expect(CONDIMENT_RECIPES.nuoc_mam_chua_ngot.nameVi).toBe("Nước mắm tỏi ớt chua ngọt")
    expect(CONDIMENT_RECIPES.nuoc_mam_chua_ngot.goldenRatioVi).toContain("1 mắm")
    expect(CONDIMENT_RECIPES.nuoc_mam_chua_ngot.ingredientsVi.length).toBeGreaterThan(0)
    expect(CONDIMENT_RECIPES.nuoc_mam_gung.nameVi).toBe("Nước mắm gừng")
    expect(CONDIMENT_RECIPES.mam_tom_chanh_ot.nameVi).toBe("Mắm tôm đánh chanh sủi bọt")
    expect(CONDIMENT_RECIPES.muoi_tieu_chanh.nameVi).toBe("Muối tiêu chanh lá chanh")
    expect(CONDIMENT_RECIPES.nuoc_tuong_toi_ot.nameVi).toBe("Nước tương tỏi ớt")
  })

  it("recommends nuoc mam gung and nuoc mam chua ngot for fried fish dishes", () => {
    const result = recommendMealCondiments({
      mealNameVi: "Cá diêu hồng chiên xù & Canh rau ngót",
      dishNames: ["Cá diêu hồng chiên giòn", "Canh rau ngót thịt băm", "Dưa leo"]
    })

    const sauceIds = result.recommendedSauces.map((s) => s.id)
    expect(sauceIds).toContain<CondimentSauceType>("nuoc_mam_gung")
    expect(sauceIds).toContain<CondimentSauceType>("nuoc_mam_chua_ngot")
    expect(
      result.recommendedSideDishes.some(
        (s) => s.id === "dua_leo_thai_lat" || s.id === "rau_song_rau_thom"
      )
    ).toBe(true)
  })

  it("recommends mam tom and nuoc mam chua ngot with dua gia / dua cai for boiled pork", () => {
    const result = recommendMealCondiments({
      mealNameVi: "Thịt ba chỉ luộc & Canh mồng tơi cua đồng",
      dishNames: ["Thịt ba chỉ luộc", "Canh cua mồng tơi", "Cà pháo muối"]
    })

    const sauceIds = result.recommendedSauces.map((s) => s.id)
    expect(sauceIds).toContain<CondimentSauceType>("mam_tom_chanh_ot")
    expect(sauceIds).toContain<CondimentSauceType>("nuoc_mam_chua_ngot")

    const sideIds = result.recommendedSideDishes.map((s) => s.id)
    expect(sideIds).toContain<SideDishType>("ca_phao_muoi")
  })

  it("recommends muoi tieu chanh for boiled or steamed chicken", () => {
    const result = recommendMealCondiments({
      mealNameVi: "Gà ta luộc lá chanh & Canh bí đao nấu thịt",
      dishNames: ["Gà luộc", "Canh bí đao"]
    })

    const sauceIds = result.recommendedSauces.map((s) => s.id)
    expect(sauceIds).toContain<CondimentSauceType>("muoi_tieu_chanh")
  })

  it("recommends nuoc tuong toi ot for boiled vegetables and stir-fried beef", () => {
    const result = recommendMealCondiments({
      mealNameVi: "Thịt bò xào hoa thiên lý & Rau cải luộc",
      dishNames: ["Bò xào hoa thiên lý", "Rau cải luộc"]
    })

    const sauceIds = result.recommendedSauces.map((s) => s.id)
    expect(sauceIds).toContain<CondimentSauceType>("nuoc_tuong_toi_ot")
  })

  it("recommends nuoc mam cot ot for sour soup (canh chua)", () => {
    const result = recommendMealCondiments({
      mealNameVi: "Cá lóc kho tộ & Canh chua cá bông lau",
      dishNames: ["Cá lóc kho tộ", "Canh chua cá bông lau"]
    })

    const sauceIds = result.recommendedSauces.map((s) => s.id)
    expect(sauceIds).toContain<CondimentSauceType>("nuoc_mam_cot_ot")
    expect(
      result.recommendedSideDishes.some(
        (s) => s.id === "rau_song_rau_thom" || s.id === "dua_cai_chua"
      )
    ).toBe(true)
  })

  it("falls back to versatile household dipping sauces when dish is generic", () => {
    const result = recommendMealCondiments({
      mealNameVi: "Cơm gia đình ấm cúng"
    })

    expect(result.recommendedSauces.length).toBeGreaterThan(0)
    expect(result.recommendedSauces[0]?.id).toBe("nuoc_mam_chua_ngot")
    expect(result.pairingNoteVi).toBeTruthy()
  })

  it("formats a ready-to-share message for condiment and side dish preparation", () => {
    const result = recommendMealCondiments({
      mealNameVi: "Thịt luộc chấm mắm tôm",
      dishNames: ["Thịt ba chỉ luộc", "Đậu phụ rán"]
    })

    expect(result.pairingNoteVi).toContain("Thịt luộc")
  })
})
