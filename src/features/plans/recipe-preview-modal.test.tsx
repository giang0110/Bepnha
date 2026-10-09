import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, test, vi } from "vitest"

import { RecipePreviewModal } from "./recipe-preview-modal"
import type { PlanItemView } from "./planner-api"
import { EMPTY_INGREDIENT_LABELS } from "./ingredient-labels"

const mockItem: PlanItemView = {
  dayIndex: 2,
  mealSlot: "primary",
  mealOptionId: "meal-ga",
  mealOptionVersionId: "meal-ga-v1",
  adultEquivalent: "2",
  scaleFactor: "1",
  mealOptionCode: "com_ga_hap",
  mealOptionNameVi: "Cơm gà hấp lá chanh",
  elapsedMinutes: 30,
  components: [
    {
      mealOptionRecipeId: "r-ga",
      mealRole: "main",
      sortOrder: 1,
      recipe: {
        recipeId: "ga-hap",
        recipeVersionId: "ga-hap-v1",
        ingredients: [
          { recipeIngredientId: "i-ga", foodId: "food-ga" },
          { recipeIngredientId: "i-chanh", foodId: "food-chanh" }
        ],
        steps: [
          {
            order: 1,
            instructionVi: "Làm sạch gà, xát muối hạt và gừng.",
            timerMinutes: 5,
            heatLevel: null,
            temperatureCelsius: null,
            ingredientIds: ["i-ga"]
          },
          {
            order: 2,
            instructionVi: "Hấp chín tới trên lửa vừa với lá chanh.",
            timerMinutes: 20,
            heatLevel: "medium",
            temperatureCelsius: 100,
            ingredientIds: ["i-chanh"]
          }
        ]
      }
    }
  ],
  scaledIngredients: [
    {
      sourceId: "r-ga:i-ga",
      foodId: "food-ga",
      foodFactVersionId: "fact-ga",
      baseUnitId: "unit-g",
      baseQuantity: "500",
      grossGrams: "500"
    }
  ],
  nutrition: {
    nutrients: [
      { nutrientCode: "energy_kcal", displayAmount: "650", unitCode: "kcal" },
      { nutrientCode: "protein_g", displayAmount: "45", unitCode: "g" }
    ]
  }
}

describe("RecipePreviewModal", () => {
  test("does not render when closed or null item", () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <RecipePreviewModal
          isOpen={false}
          item={mockItem}
          labels={EMPTY_INGREDIENT_LABELS}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )
    expect(container).toBeEmptyDOMElement()

    rerender(
      <MemoryRouter>
        <RecipePreviewModal
          isOpen={true}
          item={null}
          labels={EMPTY_INGREDIENT_LABELS}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )
    expect(container).toBeEmptyDOMElement()
  })

  test("renders meal info and allows switching tabs", async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()

    render(
      <MemoryRouter>
        <RecipePreviewModal
          isOpen={true}
          item={mockItem}
          labels={EMPTY_INGREDIENT_LABELS}
          onClose={handleClose}
        />
      </MemoryRouter>
    )

    // Header info
    expect(screen.getByText("Thứ Tư")).toBeInTheDocument()
    expect(screen.getByText("Cơm gà hấp lá chanh")).toBeInTheDocument()
    expect(screen.getByText("30 phút")).toBeInTheDocument()
    expect(screen.getByText("2 suất")).toBeInTheDocument()

    // Default tab: Ingredients & Pre-prep
    expect(screen.getByText("Nguyên liệu & Sơ chế")).toBeInTheDocument()
    expect(screen.getByText(/food-ga — 500/i)).toBeInTheDocument()
    expect(screen.getByText(/Mẹo sơ chế trước khi nấu/i)).toBeInTheDocument()

    // Switch to steps tab
    const stepsTab = screen.getByRole("button", { name: /Các bước nấu/i })
    await user.click(stepsTab)
    expect(screen.getByText("Làm sạch gà, xát muối hạt và gừng.")).toBeInTheDocument()
    expect(screen.getByText("Hấp chín tới trên lửa vừa với lá chanh.")).toBeInTheDocument()
    expect(screen.getByText("Lửa vừa")).toBeInTheDocument()
    expect(screen.getByText("20 phút")).toBeInTheDocument()

    // Switch to nutrition tab
    const nutritionTab = screen.getByRole("button", { name: "Dinh dưỡng" })
    await user.click(nutritionTab)
    expect(screen.getByText("Năng lượng")).toBeInTheDocument()
    expect(screen.getByText("650 kcal")).toBeInTheDocument()
    expect(screen.getByText("Chất đạm")).toBeInTheDocument()
    expect(screen.getByText("45 g")).toBeInTheDocument()

    // Switch to condiments tab
    const condimentsTab = screen.getByRole("button", { name: "Nước chấm & Ăn kèm" })
    await user.click(condimentsTab)
    expect(screen.getByText(/Gợi ý nước chấm & ăn kèm chuẩn vị/i)).toBeInTheDocument()
    expect(screen.getByText(/Muối tiêu chanh lá chanh/i)).toBeInTheDocument()

    // Start cooking button links to the cook page
    const cookLink = screen.getByRole("link", { name: "Bắt đầu nấu bữa này" })
    expect(cookLink).toHaveAttribute("href", "/plan/2/cook")

    // Close button
    const closeBtn = screen.getByRole("button", { name: "Đóng chi tiết công thức" })
    await user.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  test("renders and edits family cooking notes in notes tab", async () => {
    localStorage.clear()
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <RecipePreviewModal
          isOpen={true}
          item={mockItem}
          labels={EMPTY_INGREDIENT_LABELS}
          initialTab="notes"
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    // Should open directly in notes tab
    expect(screen.getByText(/Mẹo & Ghi chú của gia đình/i)).toBeInTheDocument()
    expect(screen.getByText(/Chưa có ghi chú khẩu vị cho món này/i)).toBeInTheDocument()

    // Add note
    const addBtn = screen.getByRole("button", { name: /\+ Thêm ghi chú/i })
    await user.click(addBtn)

    const textarea = screen.getByPlaceholderText(/Ví dụ: Giảm 1 thìa đường/i)
    await user.type(textarea, "Ướp thêm sả 15 phút")

    const saveBtn = screen.getByRole("button", { name: "Lưu ghi chú" })
    await user.click(saveBtn)

    expect(screen.getByText("Ướp thêm sả 15 phút")).toBeInTheDocument()
    expect(screen.getByText(/Đã lưu ghi chú cho món này/i)).toBeInTheDocument()
  })
})
