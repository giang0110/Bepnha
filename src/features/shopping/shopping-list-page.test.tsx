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
    pantryDeductedBaseQuantity: "0",
    purchaseRequiredBaseQuantity: "700",
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

function repository(initial: ShoppingListReadResult | null = ready()) {
  const load = vi.fn(() => Promise.resolve<ShoppingListReadResult | null>(initial))
  const setChecked = vi.fn((shoppingListItemId: string, checked: boolean) =>
    Promise.resolve({
      shoppingListItemId,
      checked,
      checkedAt: checked ? "2026-09-01T00:00:00Z" : null
    })
  )
  const applyToPantry = vi.fn(() =>
    Promise.resolve({
      transferId: "transfer-1",
      transferredLineCount: 1,
      totalTransferredLineCount: 1
    })
  )
  const repo: ShoppingListRepository = { load, setChecked, applyToPantry }
  return { repo, load, setChecked, applyToPantry }
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
    const { repo, load } = repository()
    renderPage(repo)

    expect(await screen.findByRole("heading", { name: "Đi chợ" })).toBeInTheDocument()
    expect(screen.getByRole("main")).toHaveClass("max-w-6xl")
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
    // The row itself carries what a person in an aisle needs: what it is, how much, what it costs.
    expect(within(rice).getByText(/mua 1 gói × 1.000 g/i)).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent(/giá ước tính.*15\/07\/2026/i)

    // The evidence is still there, in the panel it belongs to, still closed on arrival.
    const details = within(rice).getByText("Chi tiết và dùng cho bữa nào")
    expect(details.closest("details")).not.toHaveAttribute("open")
    const panel = details.closest("details")!
    expect(within(panel).getByText("Cần")).toBeInTheDocument()
    expect(within(panel).getByText("700 g")).toBeInTheDocument()
    expect(within(panel).getByText("300 g")).toBeInTheDocument()
    expect(load).toHaveBeenCalledWith("plan-a", null)
  })

  test("shows the immutable pantry deduction and remaining purchase requirement on affected lines", async () => {
    const rice = item("rice", "Gạo", "staples", {
      pantryDeductedBaseQuantity: "200",
      purchaseRequiredBaseQuantity: "500",
      // Distinct from the purchase requirement so an assertion cannot pass on the wrong row.
      leftoverBaseQuantity: "800"
    })
    const { repo } = repository(
      ready({
        budgetVnd: 100_000,
        budgetStatus: "within",
        overageVnd: 0,
        totalEstimatedCostVnd: 50_000,
        warnings: [],
        items: [rice]
      })
    )
    renderPage(repo)

    const row = await screen.findByTestId("shopping-item-rice")
    expect(within(row).getByText("Tủ bếp đã có")).toBeInTheDocument()
    expect(within(row).getByText("200 g")).toBeInTheDocument()
    expect(within(row).getByText("Còn phải mua")).toBeInTheDocument()
    expect(within(row).getByText("500 g")).toBeInTheDocument()
  })

  test("reads an explicit historical revision and renders legacy evidence without regenerating", async () => {
    const legacy: ShoppingListReadResult = {
      status: "legacy_unavailable",
      code: "SHOPPING_LIST_NOT_AVAILABLE_FOR_LEGACY_REVISION",
      planId: "plan-a",
      revisionId: "revision-v1",
      weekStart: "2026-08-24"
    }
    const { repo, load } = repository(legacy)
    renderPage(repo, "/shopping/plan-a?revisionId=revision-v1")

    expect(await screen.findByRole("heading", { name: "Đi chợ" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(
      /phiên bản kế hoạch cũ.*không có danh sách đi chợ/i
    )
    expect(screen.getByText(/không tự tạo lại/i)).toBeInTheDocument()
    expect(load).toHaveBeenCalledWith("plan-a", "revision-v1")
  })

  test("persists check state across refresh and submits only the narrow check mutation", async () => {
    const user = userEvent.setup()
    let current = ready({ budgetStatus: "within", overageVnd: 0, budgetVnd: 300_000 })
    const { repo, load, setChecked } = repository(current)
    load.mockImplementation(() => Promise.resolve(current))
    setChecked.mockImplementation((shoppingListItemId: string, checked: boolean) => {
      current = {
        ...current,
        items: current.items.map((entry) =>
          entry.shoppingListItemId === shoppingListItemId
            ? { ...entry, checked, checkedAt: checked ? "2026-09-01T00:00:00Z" : null }
            : entry
        )
      }
      return Promise.resolve({
        shoppingListItemId,
        checked,
        checkedAt: checked ? "2026-09-01T00:00:00Z" : null
      })
    })

    const first = renderPage(repo)
    expect(screen.getByRole("status")).toHaveTextContent(/đang tải danh sách đi chợ/i)
    const riceCheckbox = await screen.findByRole("checkbox", { name: /gạo/i })
    await user.click(riceCheckbox)
    expect(setChecked).toHaveBeenCalledWith("rice", true)
    expect(riceCheckbox).toBeChecked()
    expect(setChecked.mock.calls.every((call) => call.length === 2)).toBe(true)

    first.unmount()
    renderPage(repo)
    const refreshed = await screen.findByRole("checkbox", { name: /gạo/i })
    expect(refreshed).toBeChecked()
    await user.click(refreshed)
    expect(setChecked).toHaveBeenLastCalledWith("rice", false)
    expect(refreshed).not.toBeChecked()
  })

  test("disables a pending toggle and rolls back the visual state when mutation fails", async () => {
    const user = userEvent.setup()
    let rejectMutation: ((error: Error) => void) | undefined
    const { repo, setChecked } = repository()
    setChecked.mockImplementation(
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

  test("counts down the money still owed as items are ticked", async () => {
    const user = userEvent.setup()
    const { repo } = repository()
    renderPage(repo)

    expect(await screen.findByText("Còn phải mua khoảng 250.000 VND")).toBeInTheDocument()

    await user.click(screen.getByRole("checkbox", { name: "Gạo" }))

    expect(await screen.findByText("Còn phải mua khoảng 200.000 VND")).toBeInTheDocument()
    expect(screen.getByText("Đã lấy 50.000 VND")).toBeInTheDocument()
    // The stored total stays on screen unchanged: the remaining figure is a split of it, not a
    // second opinion about what the trip costs.
    expect(screen.getByText("250.000 VND / 200.000 VND")).toBeInTheDocument()
  })

  /**
   * jsdom ships no `share` and no `clipboard`, so these are defined rather than spied on, and
   * deleted again afterwards. A leaked `navigator.share` would make every later test believe it is
   * running on a phone.
   */
  function withNavigator(overrides: Record<string, unknown>) {
    const added = Object.keys(overrides)
    for (const key of added) {
      Object.defineProperty(navigator, key, {
        configurable: true,
        value: overrides[key]
      })
    }
    return () => {
      for (const key of added) {
        Reflect.deleteProperty(navigator, key)
      }
    }
  }

  test("hands the list to the device share sheet", async () => {
    const user = userEvent.setup()
    const share = vi.fn().mockResolvedValue(undefined)
    const restore = withNavigator({ share })
    try {
      const { repo } = repository()
      renderPage(repo)

      await user.click(await screen.findByRole("button", { name: "Gửi cho người đi chợ" }))

      expect(share).toHaveBeenCalledTimes(1)
      const text = (share.mock.calls[0]![0] as { text: string }).text
      expect(text).toContain("Đi chợ — tuần từ 31/08/2026")
      expect(text).toContain("[ ] Rau muống — 1 gói × 1.000 g (~50.000 VND)")
    } finally {
      restore()
    }
  })

  test("says where the list went when it could only be copied", async () => {
    const user = userEvent.setup()
    const restore = withNavigator({
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }
    })
    try {
      const { repo } = repository()
      renderPage(repo)

      await user.click(await screen.findByRole("button", { name: "Gửi cho người đi chợ" }))

      expect(await screen.findByText(/Đã chép danh sách/u)).toBeInTheDocument()
    } finally {
      restore()
    }
  })

  test("sinks a ticked item to the end of its aisle instead of leaving it in the way", async () => {
    const user = userEvent.setup()
    const { repo } = repository(
      ready({
        items: [
          item("a", "Cà chua", "fresh_produce"),
          item("b", "Rau muống", "fresh_produce"),
          item("c", "Xà lách", "fresh_produce")
        ]
      })
    )
    renderPage(repo)

    const names = async () =>
      (await screen.findAllByTestId("shopping-item")).map(
        (row) => within(row).getByRole("heading", { level: 3 }).textContent
      )
    expect(await names()).toEqual(["Cà chua", "Rau muống", "Xà lách"])

    await user.click(screen.getByRole("checkbox", { name: "Cà chua" }))

    // Otherwise the thing a shopper is still looking for sits further down the list every time
    // they succeed at finding one.
    expect(await names()).toEqual(["Rau muống", "Xà lách", "Cà chua"])
  })

  test("offers a retry that actually re-reads, rather than only saying to try again", async () => {
    const user = userEvent.setup()
    const load = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(ready())
    const repo: ShoppingListRepository = { load, setChecked: vi.fn(), applyToPantry: vi.fn() }
    renderPage(repo)

    await user.click(await screen.findByRole("button", { name: "Thử lại" }))

    // Without this the only route out was a browser reload, which is not an instruction so much as
    // an apology.
    expect(await screen.findByText("250.000 VND / 200.000 VND")).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })

  test("renders a repository loading failure without fabricating shopping data", async () => {
    const { repo, load } = repository()
    load.mockRejectedValueOnce(new Error("offline"))
    renderPage(repo)

    expect(screen.getByRole("status")).toHaveTextContent(/đang tải danh sách đi chợ/i)
    expect(await screen.findByRole("alert")).toHaveTextContent(/không thể tải danh sách đi chợ/i)
    expect(screen.queryByTestId("shopping-category")).not.toBeInTheDocument()
  })

  test("offers to stock the pantry only with the lines that were actually bought", async () => {
    const user = userEvent.setup()
    const list = ready()
    const { repo, applyToPantry } = repository({
      ...list,
      items: list.items.map((entry, index) =>
        // Two bought, the rest still on the shelf. The button must count the two.
        index < 2 ? { ...entry, checked: true, checkedAt: "2026-09-01T00:00:00Z" } : entry
      )
    })
    renderPage(repo)

    const finish = await screen.findByRole("button", { name: /Đi chợ xong, cất 2 món dư/u })
    await user.click(finish)

    // The revision, not the plan: a shopping list belongs to one revision, and stocking the pantry
    // from a superseded one would credit food nobody bought.
    expect(applyToPantry).toHaveBeenCalledWith("revision-a")
    expect(await screen.findByText(/Đã cất phần dư của 1 món vào tủ bếp\./u)).toBeInTheDocument()
  })

  test("says nothing moved when the trip was already stocked", async () => {
    const user = userEvent.setup()
    const list = ready()
    const { repo, applyToPantry } = repository({
      ...list,
      items: list.items.map((entry) => ({
        ...entry,
        checked: true,
        checkedAt: "2026-09-01T00:00:00Z"
      }))
    })
    applyToPantry.mockResolvedValueOnce({
      transferId: "transfer-1",
      transferredLineCount: 0,
      totalTransferredLineCount: 5
    })
    renderPage(repo)

    await user.click(await screen.findByRole("button", { name: /Đi chợ xong/u }))

    // Pressing twice is ordinary. Saying "đã cất 0 món" would read as a failure; it is not one.
    expect(
      await screen.findByText(/Phần dư của chuyến này đã nằm trong tủ bếp từ trước\./u)
    ).toBeInTheDocument()
  })

  test("hides the pantry offer while nothing has been ticked", async () => {
    const { repo } = repository()
    renderPage(repo)

    expect(await screen.findByText("250.000 VND / 200.000 VND")).toBeInTheDocument()
    // Nothing was bought, so there is nothing to stock. A button that moves nothing would read as
    // though the trip had been filed away.
    expect(screen.queryByRole("button", { name: /Đi chợ xong/u })).not.toBeInTheDocument()
  })
})
