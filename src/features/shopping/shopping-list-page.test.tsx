import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { describe, expect, test, vi } from "vitest"

import type {
  ReadyShoppingList,
  ShoppingListReadResult,
  ShoppingListRepository
} from "@/application/shopping/shopping-list-repository"

import { ShoppingListPage } from "./shopping-list-page"

function item(
  id: string,
  name: string,
  category: ReadyShoppingList["items"][number]["groceryCategoryCode"],
  overrides: Partial<ReadyShoppingList["items"][number]> = {}
): ReadyShoppingList["items"][number] {
  return {
    shoppingListItemId: id,
    foodId: `food-${id}`,
    foodNameVi: name,
    baseUnitId: "unit-g",
    requiredBaseQuantity: "700",
    packageBaseQuantity: "1000",
    purchaseIncrement: "1",
    purchasePackageCount: "1",
    purchaseBaseQuantity: "1000",
    leftoverBaseQuantity: "300",
    packagePriceVnd: 50_000,
    lineCostVnd: 50_000,
    foodPriceId: `price-${id}`,
    priceBookId: "book-a",
    priceFoodFactVersionId: `fact-${id}`,
    observedAt: "2026-07-15",
    freshness: "current",
    groceryCategoryCode: category,
    checked: false,
    checkedAt: null,
    sources: [
      {
        dayIndex: 0,
        mealPlanItemId: "plan-item-a",
        mealOptionId: "option-a",
        mealOptionVersionId: "option-v1",
        mealOptionNameVi: "Bữa cơm nhà",
        mealOptionRecipeId: "component-a",
        recipeVersionId: "recipe-v1",
        recipeIngredientId: `ingredient-${id}`,
        foodFactVersionId: `fact-${id}`,
        baseUnitId: "unit-g",
        requiredBaseQuantity: "100"
      }
    ],
    ...overrides
  }
}

function ready(overrides: Partial<ReadyShoppingList> = {}): ReadyShoppingList {
  const items = [
    item("seasoning", "Nước mắm", "seasonings"),
    item("tofu-b", "Đậu hũ", "eggs_tofu_dairy", { foodId: "food-b" }),
    item("tofu-a", "Đậu hũ", "eggs_tofu_dairy", { foodId: "food-a" }),
    item("vegetable", "Rau muống", "fresh_produce"),
    item("rice", "Gạo", "staples", {
      freshness: "stale_usable",
      observedAt: "2026-07-15"
    })
  ]
  return {
    status: "ready",
    planId: "plan-a",
    revisionId: "revision-a",
    weekStart: "2026-08-31",
    calculationFingerprint: "a".repeat(64),
    budgetVnd: 200_000,
    budgetStatus: "over",
    overageVnd: 50_000,
    totalEstimatedCostVnd: 250_000,
    warnings: [
      {
        code: "STALE_PRICE",
        foodId: "food-rice",
        foodPriceId: "price-rice",
        observedAt: "2026-07-15",
        ageDays: 47
      }
    ],
    items,
    ...overrides
  }
}

function repository(initial: ShoppingListReadResult | null = ready()): ShoppingListRepository & {
  load: ReturnType<typeof vi.fn>
  setChecked: ReturnType<typeof vi.fn>
} {
  const load = vi.fn().mockResolvedValue(initial)
  const setChecked = vi.fn(async (shoppingListItemId: string, checked: boolean) => ({
    shoppingListItemId,
    checked,
    checkedAt: checked ? "2026-09-01T00:00:00Z" : null
  }))
  return { load, setChecked }
}

function renderPage(repo: ShoppingListRepository, entry = "/shopping/plan-a") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/shopping/:planId" element={<ShoppingListPage repository={repo} />} />
      </Routes>
    </MemoryRouter>
  )
}

describe("ShoppingListPage", () => {
  test("renders stable category groups, Vietnamese item ordering, totals, package quantities and collapsed provenance", async () => {
    const repo = repository()
    renderPage(repo)

    expect(await screen.findByRole("heading", { name: "Đi chợ" })).toBeInTheDocument()
    expect(screen.getByRole("main")).toHaveClass("max-w-md")
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    const groups = screen.getAllByTestId("shopping-category")
    expect(
      groups.map((group) => within(group).getByRole("heading", { level: 2 }).textContent)
    ).toEqual(["Rau củ", "Trứng, đậu hũ & sữa", "Lương thực chính", "Gia vị"])

    const tofuGroup = groups[1]!
    const tofuRows = within(tofuGroup).getAllByTestId("shopping-item")
    expect(tofuRows.map((row) => row.getAttribute("data-food-id"))).toEqual(["food-a", "food-b"])

    expect(screen.getByText("250.000 VND / 200.000 VND")).toBeInTheDocument()
    expect(screen.getByText(/vượt ngân sách 50.000 VND/i)).toBeInTheDocument()
    const rice = screen.getByTestId("shopping-item-rice")
    expect(within(rice).getByText(/cần 700 g/i)).toBeInTheDocument()
    expect(within(rice).getByText(/mua 1 gói × 1.000 g/i)).toBeInTheDocument()
    expect(within(rice).getByText(/dư khoảng 300 g/i)).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent(/giá ước tính.*15\/07\/2026/i)

    const details = within(rice).getByText("Dùng cho bữa nào")
    expect(details.closest("details")).not.toHaveAttribute("open")
    expect(repo.load).toHaveBeenCalledWith("plan-a", null)
  })

  test("reads an explicit historical revision and renders legacy evidence without regenerating", async () => {
    const legacy: ShoppingListReadResult = {
      status: "legacy_unavailable",
      code: "SHOPPING_LIST_NOT_AVAILABLE_FOR_LEGACY_REVISION",
      planId: "plan-a",
      revisionId: "revision-v1",
      weekStart: "2026-08-24"
    }
    const repo = repository(legacy)
    renderPage(repo, "/shopping/plan-a?revisionId=revision-v1")

    expect(await screen.findByRole("heading", { name: "Đi chợ" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(
      /phiên bản kế hoạch cũ.*không có danh sách đi chợ/i
    )
    expect(screen.getByText(/không tự tạo lại/i)).toBeInTheDocument()
    expect(repo.load).toHaveBeenCalledWith("plan-a", "revision-v1")
  })

  test("persists check state across refresh and submits only the narrow check mutation", async () => {
    const user = userEvent.setup()
    let current = ready({ budgetStatus: "within", overageVnd: 0, budgetVnd: 300_000 })
    const repo = repository(current)
    repo.load.mockImplementation(async () => current)
    repo.setChecked.mockImplementation(async (shoppingListItemId: string, checked: boolean) => {
      current = {
        ...current,
        items: current.items.map((entry) =>
          entry.shoppingListItemId === shoppingListItemId
            ? { ...entry, checked, checkedAt: checked ? "2026-09-01T00:00:00Z" : null }
            : entry
        )
      }
      return {
        shoppingListItemId,
        checked,
        checkedAt: checked ? "2026-09-01T00:00:00Z" : null
      }
    })

    const first = renderPage(repo)
    expect(screen.getByRole("status")).toHaveTextContent(/đang tải danh sách đi chợ/i)
    const riceCheckbox = await screen.findByRole("checkbox", { name: /gạo/i })
    await user.click(riceCheckbox)
    expect(repo.setChecked).toHaveBeenCalledWith("rice", true)
    expect(riceCheckbox).toBeChecked()
    expect(repo.setChecked.mock.calls.every((call) => call.length === 2)).toBe(true)

    first.unmount()
    renderPage(repo)
    const refreshed = await screen.findByRole("checkbox", { name: /gạo/i })
    expect(refreshed).toBeChecked()
    await user.click(refreshed)
    expect(repo.setChecked).toHaveBeenLastCalledWith("rice", false)
    expect(refreshed).not.toBeChecked()
  })

  test("disables a pending toggle and rolls back the visual state when mutation fails", async () => {
    const user = userEvent.setup()
    let rejectMutation: ((error: Error) => void) | undefined
    const repo = repository()
    repo.setChecked.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectMutation = reject
        })
    )
    renderPage(repo)

    const riceCheckbox = await screen.findByRole("checkbox", { name: /gạo/i })
    await user.click(riceCheckbox)
    expect(riceCheckbox).toBeDisabled()
    rejectMutation?.(new Error("failed"))
    expect(await screen.findByRole("alert")).toHaveTextContent(/không thể cập nhật/i)
    expect(riceCheckbox).not.toBeChecked()
    expect(riceCheckbox).not.toBeDisabled()
  })

  test("renders a repository loading failure without fabricating shopping data", async () => {
    const repo = repository()
    repo.load.mockRejectedValueOnce(new Error("offline"))
    renderPage(repo)

    expect(screen.getByRole("status")).toHaveTextContent(/đang tải danh sách đi chợ/i)
    expect(await screen.findByRole("alert")).toHaveTextContent(/không thể tải danh sách đi chợ/i)
    expect(screen.queryByTestId("shopping-category")).not.toBeInTheDocument()
  })
})
