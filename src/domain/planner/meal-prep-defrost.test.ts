import { describe, expect, test } from "vitest"
import {
  extractDayPrepTasks,
  generatePrepShareMessage,
  type DayPrepItemInput
} from "./meal-prep-defrost"

describe("meal-prep-defrost domain", () => {
  const sampleMeatFishMeal: DayPrepItemInput = {
    dayIndex: 0,
    mealOptionNameVi: "Cá diêu hồng rán & Canh chua",
    scaledIngredients: [
      { foodNameVi: "Cá diêu hồng", displayQuantity: "600 g" },
      { foodNameVi: "Cà chua", displayQuantity: "2 quả" },
      { foodNameVi: "Gạo tẻ", displayQuantity: "400 g (~2,5 bát đong)" }
    ],
    components: [
      { mealRole: "main", recipeNameVi: "Cá diêu hồng rán giòn" },
      { mealRole: "soup", recipeNameVi: "Canh chua cá" },
      { mealRole: "staple", recipeNameVi: "Cơm trắng" }
    ]
  }

  test("extracts defrost task for frozen ingredients and rice cooker task for staple", () => {
    const tasks = extractDayPrepTasks(sampleMeatFishMeal)

    expect(tasks.length).toBeGreaterThanOrEqual(2)

    // Defrost task
    const defrostTask = tasks.find((t) => t.type === "defrost")
    expect(defrostTask).toBeDefined()
    expect(defrostTask?.foodNameVi).toBe("Cá diêu hồng")
    expect(defrostTask?.titleVi).toContain("Cá diêu hồng")
    expect(defrostTask?.timingHintVi).toContain("sáng")

    // Rice task
    const riceTask = tasks.find((t) => t.type === "rice")
    expect(riceTask).toBeDefined()
    expect(riceTask?.titleVi).toBe("Cắm nồi cơm điện")
    expect(riceTask?.detailVi).toContain("Gạo tẻ")
  })

  test("handles meals without staple rice gracefully", () => {
    const noodleMeal: DayPrepItemInput = {
      dayIndex: 1,
      mealOptionNameVi: "Bún bò Huế",
      scaledIngredients: [
        { foodNameVi: "Thịt bắp bò", displayQuantity: "400 g" },
        { foodNameVi: "Bún tươi", displayQuantity: "1 kg" }
      ],
      components: [{ mealRole: "main", recipeNameVi: "Bún bò Huế" }]
    }

    const tasks = extractDayPrepTasks(noodleMeal)
    expect(tasks.some((t) => t.type === "rice")).toBe(false)
    expect(tasks.some((t) => t.type === "defrost")).toBe(true)
  })

  test("identifies dry ingredients needing soaking like mushrooms", () => {
    const soupMeal: DayPrepItemInput = {
      dayIndex: 2,
      mealOptionNameVi: "Canh gà nấu nấm hương & Mộc nhĩ",
      scaledIngredients: [
        { foodNameVi: "Thịt gà", displayQuantity: "500 g" },
        { foodNameVi: "Mộc nhĩ khô", displayQuantity: "30 g" },
        { foodNameVi: "Nấm hương khô", displayQuantity: "40 g" },
        { foodNameVi: "Gạo tẻ", displayQuantity: "350 g" }
      ],
      components: [
        { mealRole: "main", recipeNameVi: "Gà luộc" },
        { mealRole: "soup", recipeNameVi: "Canh mộc nhĩ nấm" },
        { mealRole: "staple", recipeNameVi: "Cơm trắng" }
      ]
    }

    const tasks = extractDayPrepTasks(soupMeal)
    const soakTask = tasks.find((t) => t.type === "soak")
    expect(soakTask).toBeDefined()
    expect(soakTask?.titleVi).toContain("Ngâm nở")
    expect(soakTask?.detailVi).toContain("Mộc nhĩ khô")
  })

  test("formats friendly Vietnamese share message for family reminder", () => {
    const tasks = extractDayPrepTasks(sampleMeatFishMeal)
    const message = generatePrepShareMessage("Thứ Hai", sampleMeatFishMeal.mealOptionNameVi, tasks)

    expect(message).toContain("Thứ Hai")
    expect(message).toContain("Cá diêu hồng")
    expect(message).toContain("Cắm nồi cơm điện")
    expect(message).toContain("Bếp Nhà")
  })
})
