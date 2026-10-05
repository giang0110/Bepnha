import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, test, vi } from "vitest"

import type { HouseholdRepository } from "@/application/household/household-repository"
import {
  PantryRepositoryError,
  type PantryItemRecord,
  type PantryRepository
} from "@/application/pantry/pantry-repository"
import type {
  PantryFoodOption,
  PantryFoodOptionsRepository
} from "@/application/pantry/pantry-food-options-repository"
import type { HouseholdSetup } from "@/domain/household/household"

import { PantryPage } from "./pantry-page"

const RECENTS_KEY = "bepnha:recent-pantry-foods:v1"

const household: HouseholdSetup = {
  householdId: "20000000-0000-0000-0000-000000000001",
  memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
  weeklyPlanBudgetVnd: 700_000,
  maxElapsedMinutes: 30,
  ruleCodes: [],
  version: 1,
  onboardingCompletedAt: "2026-08-26T00:00:00Z"
}

const rice: PantryFoodOption = {
  foodId: "food-rice",
  foodNameVi: "Gạo",
  foodFactVersionId: "fact-rice-v1",
  baseUnitId: "unit-g",
  units: [
    { unitId: "unit-g", unitCode: "g", unitNameVi: "gam" },
    { unitId: "unit-kg", unitCode: "kg", unitNameVi: "kilôgam" }
  ]
}

const vegetable: PantryFoodOption = {
  foodId: "food-vegetable",
  foodNameVi: "Rau muống",
  foodFactVersionId: "fact-vegetable-v1",
  baseUnitId: "unit-g",
  units: [{ unitId: "unit-g", unitCode: "g", unitNameVi: "gam" }]
}

const egg: PantryFoodOption = {
  foodId: "food-egg",
  foodNameVi: "Trứng gà",
  foodFactVersionId: "fact-egg-v1",
  baseUnitId: "unit-item",
  units: [{ unitId: "unit-item", unitCode: "item", unitNameVi: "quả" }]
}

const tomato: PantryFoodOption = {
  foodId: "food-tomato",
  foodNameVi: "Cà chua",
  foodFactVersionId: "fact-tomato-v1",
  baseUnitId: "unit-g",
  units: [{ unitId: "unit-g", unitCode: "g", unitNameVi: "gam" }]
}

const pork: PantryFoodOption = {
  foodId: "food-pork",
  foodNameVi: "Thịt ba chỉ",
  foodFactVersionId: "fact-pork-v1",
  baseUnitId: "unit-g",
  units: [{ unitId: "unit-g", unitCode: "g", unitNameVi: "gam" }]
}

function pantryItem(overrides: Partial<PantryItemRecord> = {}): PantryItemRecord {
  return {
    pantryItemId: "pantry-rice",
    householdId: household.householdId,
    foodId: rice.foodId,
    foodFactVersionId: rice.foodFactVersionId,
    quantity: "1",
    unitId: "unit-kg",
    baseQuantity: "1000",
    baseUnitId: "unit-g",
    version: 2,
    updatedAt: "2026-09-02T00:00:00Z",
    ...overrides
  }
}

function setup(initialItems: readonly PantryItemRecord[] = []) {
  const householdRepository: HouseholdRepository = {
    loadOwn: vi.fn().mockResolvedValue(household),
    saveOwn: vi.fn()
  }
  const load = vi.fn().mockResolvedValue(initialItems)
  const upsert = vi.fn()
  const remove = vi.fn()
  const foodOptionsLoad = vi.fn().mockResolvedValue([rice, vegetable, egg, tomato, pork])
  const pantryRepository: PantryRepository = { load, upsert, remove }
  const foodOptionsRepository: PantryFoodOptionsRepository = {
    load: foodOptionsLoad
  }

  const { unmount } = render(
    <MemoryRouter>
      <PantryPage
        foodOptionsRepository={foodOptionsRepository}
        householdRepository={householdRepository}
        pantryRepository={pantryRepository}
      />
    </MemoryRouter>
  )

  return {
    householdRepository,
    pantryRepository,
    foodOptionsRepository,
    foodOptionsLoad,
    load,
    upsert,
    remove,
    unmount
  }
}

describe("PantryPage", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test("offers quantities for the selected unit while preserving manual entry", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByRole("heading", { name: "Tủ bếp" })
    await user.selectOptions(screen.getByRole("combobox", { name: "Thực phẩm" }), rice.foodId)

    const presets = screen.getByRole("group", { name: "Chọn nhanh số lượng" })
    await user.click(within(presets).getByRole("button", { name: "500 g" }))
    expect(screen.getByRole("spinbutton", { name: "Số lượng" })).toHaveValue(500)

    await user.selectOptions(screen.getByRole("combobox", { name: "Đơn vị" }), "unit-kg")
    expect(within(presets).queryByRole("button", { name: "500 g" })).not.toBeInTheDocument()
    await user.click(within(presets).getByRole("button", { name: "0,5 kg" }))
    expect(screen.getByRole("spinbutton", { name: "Số lượng" })).toHaveValue(0.5)
    expect(within(presets).getByRole("button", { name: "0,5 kg" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await user.clear(screen.getByRole("spinbutton", { name: "Số lượng" }))
    await user.type(screen.getByRole("spinbutton", { name: "Số lượng" }), "0.75")
    expect(screen.getByRole("spinbutton", { name: "Số lượng" })).toHaveValue(0.75)
    expect(within(presets).getByRole("button", { name: "0,5 kg" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  test("offers count quantities in the existing item editor without saving automatically", async () => {
    const user = userEvent.setup()
    const existing = pantryItem({
      pantryItemId: "pantry-egg",
      foodId: egg.foodId,
      unitId: "unit-item"
    })
    const { upsert } = setup([existing])
    const row = await screen.findByTestId("pantry-item-pantry-egg")

    await user.click(within(row).getByRole("button", { name: "4 quả" }))
    expect(within(row).getByRole("spinbutton", { name: "Số lượng Trứng gà" })).toHaveValue(4)
    expect(within(row).getByRole("combobox", { name: "Đơn vị Trứng gà" })).toHaveValue("unit-item")
    expect(upsert).not.toHaveBeenCalled()
  })

  test("remembers a successful save and offers it again after removal", async () => {
    const user = userEvent.setup()
    const { upsert, remove } = setup()
    upsert.mockResolvedValueOnce(pantryItem({ version: 1 }))
    remove.mockResolvedValueOnce("pantry-rice")
    await screen.findByRole("heading", { name: "Tủ bếp" })
    await user.click(screen.getByRole("button", { name: "+ Gạo" }))
    await user.click(screen.getByRole("button", { name: "Thêm vào tủ bếp" }))
    await screen.findByTestId("pantry-item-pantry-rice")

    expect(JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "null")).toEqual([
      { householdId: household.householdId, foodId: rice.foodId }
    ])
    expect(screen.queryByRole("button", { name: "Chọn lại Gạo" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Xóa Gạo" }))
    const recents = await screen.findByRole("group", { name: "Thực phẩm gần đây" })
    expect(within(recents).getByText("Chỉ lưu trên thiết bị này.")).toBeInTheDocument()
    await user.click(within(recents).getByRole("button", { name: "Chọn lại Gạo" }))
    expect(screen.getByRole("combobox", { name: "Thực phẩm" })).toHaveValue(rice.foodId)
    expect(screen.getByRole("spinbutton", { name: "Số lượng" })).toHaveValue(0)
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  test("restores only this household's published recents and clears search on selection", async () => {
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify([
        { householdId: "another-household", foodId: egg.foodId },
        { householdId: household.householdId, foodId: "retired-food" },
        { householdId: household.householdId, foodId: rice.foodId },
        { householdId: household.householdId, foodId: vegetable.foodId }
      ])
    )
    const user = userEvent.setup()
    setup([pantryItem()])
    const recents = await screen.findByRole("group", { name: "Thực phẩm gần đây" })
    expect(within(recents).getAllByRole("button")).toHaveLength(1)
    await user.type(screen.getByRole("searchbox", { name: "Tìm thực phẩm" }), "thịt")
    await user.click(within(recents).getByRole("button", { name: "Chọn lại Rau muống" }))
    expect(screen.getByRole("searchbox", { name: "Tìm thực phẩm" })).toHaveValue("")
    expect(screen.getByRole("combobox", { name: "Thực phẩm" })).toHaveValue(vegetable.foodId)
  })

  test("does not remember failed writes", async () => {
    const user = userEvent.setup()
    const { upsert } = setup()
    upsert.mockRejectedValueOnce(new PantryRepositoryError("DEPENDENCY_UNAVAILABLE"))
    await screen.findByRole("heading", { name: "Tủ bếp" })
    await user.click(screen.getByRole("button", { name: "+ Gạo" }))
    await user.click(screen.getByRole("button", { name: "Thêm vào tủ bếp" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/không thể thêm/i)
    expect(localStorage.getItem(RECENTS_KEY)).toBeNull()
  })

  test("does not restore purged recents when a save resolves after leaving the page", async () => {
    const user = userEvent.setup()
    const { upsert, unmount } = setup()
    let finishSave: (saved: PantryItemRecord) => void = () => undefined
    const pendingSave = new Promise<PantryItemRecord>((resolve) => {
      finishSave = resolve
    })
    upsert.mockReturnValueOnce(pendingSave)
    await screen.findByRole("heading", { name: "Tủ bếp" })
    await user.click(screen.getByRole("button", { name: "+ Gạo" }))
    await user.click(screen.getByRole("button", { name: "Thêm vào tủ bếp" }))
    unmount()
    localStorage.removeItem(RECENTS_KEY)
    await act(async () => {
      finishSave(pantryItem({ version: 1 }))
      await pendingSave
    })
    expect(localStorage.getItem(RECENTS_KEY)).toBeNull()
  })

  test("remembers successful edits and still saves when device storage is blocked", async () => {
    const user = userEvent.setup()
    const existing = pantryItem()
    const { upsert } = setup([existing])
    upsert.mockResolvedValueOnce(pantryItem({ quantity: "2", version: 3 }))
    const row = await screen.findByTestId("pantry-item-pantry-rice")
    await user.click(within(row).getByRole("button", { name: "2 kg" }))
    await user.click(within(row).getByRole("button", { name: "Lưu Gạo" }))
    expect(JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "null")).toEqual([
      { householdId: household.householdId, foodId: rice.foodId }
    ])

    const blocked = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("storage disabled")
    })
    try {
      upsert.mockResolvedValueOnce(pantryItem({ quantity: "1", version: 4 }))
      const updated = screen.getByTestId("pantry-item-pantry-rice")
      await user.click(within(updated).getByRole("button", { name: "1 kg" }))
      await user.click(within(updated).getByRole("button", { name: "Lưu Gạo" }))
      expect(
        within(screen.getByTestId("pantry-item-pantry-rice")).getByRole("spinbutton", {
          name: "Số lượng Gạo"
        })
      ).toHaveValue(1)
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    } finally {
      blocked.mockRestore()
    }
  })

  test("loads the owner pantry and published food options into a mobile-first accessible empty state", async () => {
    const { load, foodOptionsLoad } = setup()

    expect(screen.getByRole("status")).toHaveTextContent(/đang tải tủ bếp/i)
    expect(await screen.findByRole("heading", { name: "Tủ bếp" })).toBeInTheDocument()
    expect(screen.getByRole("main")).toHaveClass("max-w-6xl")
    expect(screen.getByText(/tủ bếp đang trống/i)).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Thực phẩm" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Đơn vị" })).toBeInTheDocument()
    expect(screen.getByRole("spinbutton", { name: "Số lượng" })).toHaveAttribute("min", "0")
    expect(load).toHaveBeenCalledWith(household.householdId)
    expect(foodOptionsLoad).toHaveBeenCalledTimes(1)
  })

  test("adds a published food with zero or positive quantity using expectedVersion zero", async () => {
    const user = userEvent.setup()
    const { upsert } = setup()
    upsert.mockResolvedValueOnce(
      pantryItem({ pantryItemId: "pantry-new", quantity: "0", baseQuantity: "0", version: 1 })
    )

    await screen.findByRole("heading", { name: "Tủ bếp" })
    await user.selectOptions(screen.getByRole("combobox", { name: "Thực phẩm" }), rice.foodId)
    await user.selectOptions(screen.getByRole("combobox", { name: "Đơn vị" }), "unit-kg")
    await user.clear(screen.getByRole("spinbutton", { name: "Số lượng" }))
    await user.type(screen.getByRole("spinbutton", { name: "Số lượng" }), "0")
    await user.click(screen.getByRole("button", { name: "Thêm vào tủ bếp" }))

    expect(upsert).toHaveBeenCalledWith({
      householdId: household.householdId,
      foodId: rice.foodId,
      foodFactVersionId: rice.foodFactVersionId,
      unitId: "unit-kg",
      quantity: "0",
      expectedVersion: 0
    })
    expect(await screen.findByTestId("pantry-item-pantry-new")).toHaveTextContent("Gạo")
  })

  test("updates and removes an existing item with its optimistic version", async () => {
    const user = userEvent.setup()
    const existing = pantryItem()
    const { upsert, remove } = setup([existing])
    upsert.mockResolvedValueOnce(pantryItem({ quantity: "1.5", baseQuantity: "1500", version: 3 }))
    remove.mockResolvedValueOnce(existing.pantryItemId)

    const row = await screen.findByTestId(`pantry-item-${existing.pantryItemId}`)
    const quantity = within(row).getByRole("spinbutton", { name: "Số lượng Gạo" })
    await user.clear(quantity)
    await user.type(quantity, "1.5")
    await user.click(within(row).getByRole("button", { name: "Lưu Gạo" }))

    expect(upsert).toHaveBeenCalledWith({
      householdId: household.householdId,
      foodId: rice.foodId,
      foodFactVersionId: rice.foodFactVersionId,
      unitId: "unit-kg",
      quantity: "1.5",
      expectedVersion: 2
    })

    const refreshedRow = await screen.findByTestId(`pantry-item-${existing.pantryItemId}`)
    await user.click(within(refreshedRow).getByRole("button", { name: "Xóa Gạo" }))
    expect(remove).toHaveBeenCalledWith(existing.pantryItemId, 3)
    expect(screen.queryByTestId(`pantry-item-${existing.pantryItemId}`)).not.toBeInTheDocument()
  })

  test("reloads instead of overwriting when another session changed an item version", async () => {
    const user = userEvent.setup()
    const existing = pantryItem()
    const changed = pantryItem({ quantity: "2", baseQuantity: "2000", version: 3 })
    const { load, upsert } = setup([existing])
    load.mockResolvedValueOnce([existing]).mockResolvedValueOnce([changed])
    upsert.mockRejectedValueOnce(new PantryRepositoryError("VERSION_CONFLICT"))

    const row = await screen.findByTestId(`pantry-item-${existing.pantryItemId}`)
    const quantity = within(row).getByRole("spinbutton", { name: "Số lượng Gạo" })
    await user.clear(quantity)
    await user.type(quantity, "1.5")
    await user.click(within(row).getByRole("button", { name: "Lưu Gạo" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/đã thay đổi.*tải lại/i)
    expect(load).toHaveBeenCalledTimes(2)
    const refreshed = await screen.findByTestId(`pantry-item-${existing.pantryItemId}`)
    expect(within(refreshed).getByRole("spinbutton", { name: "Số lượng Gạo" })).toHaveValue(2)
  })

  test("fails closed on loading errors and never fabricates pantry data", async () => {
    const { load } = setup()
    load.mockReset()
    load.mockRejectedValueOnce(new Error("offline"))

    expect(await screen.findByRole("alert")).toHaveTextContent(/không thể tải tủ bếp/i)
    expect(screen.queryByTestId(/^pantry-item-/u)).not.toBeInTheDocument()
  })

  test("offers a retry that actually re-reads, rather than only saying to try again", async () => {
    const user = userEvent.setup()
    const { load } = setup()
    load.mockReset()
    load.mockRejectedValueOnce(new Error("offline")).mockResolvedValue([pantryItem()])
    await screen.findByRole("alert")

    await user.click(screen.getByRole("button", { name: "Thử lại" }))

    // Without this the only route out was a browser reload, which is not an instruction so much as
    // an apology.
    expect(await screen.findByTestId(/^pantry-item-/u)).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })

  test("filters pantry items by storage zones (ngăn mát, ngăn đông, tủ đồ khô)", async () => {
    const user = userEvent.setup()
    const riceItem = pantryItem({ pantryItemId: "item-rice", foodId: rice.foodId })
    const vegItem = pantryItem({ pantryItemId: "item-veg", foodId: vegetable.foodId })
    const porkItem = pantryItem({ pantryItemId: "item-pork", foodId: pork.foodId })

    setup([riceItem, vegItem, porkItem])

    const nav = await screen.findByRole("navigation", {
      name: "Khu vực lưu trữ tủ bếp"
    })
    expect(nav).toBeInTheDocument()

    // All 3 items initially visible
    expect(screen.getByTestId("pantry-item-item-rice")).toBeInTheDocument()
    expect(screen.getByTestId("pantry-item-item-veg")).toBeInTheDocument()
    expect(screen.getByTestId("pantry-item-item-pork")).toBeInTheDocument()

    // Filter to Ngăn mát (vegetable)
    await user.click(within(nav).getByRole("button", { name: /Ngăn mát/i }))
    expect(screen.getByTestId("pantry-item-item-veg")).toBeInTheDocument()
    expect(screen.queryByTestId("pantry-item-item-rice")).not.toBeInTheDocument()
    expect(screen.queryByTestId("pantry-item-item-pork")).not.toBeInTheDocument()

    // Filter to Ngăn đông (pork)
    await user.click(within(nav).getByRole("button", { name: /Ngăn đông/i }))
    expect(screen.getByTestId("pantry-item-item-pork")).toBeInTheDocument()
    expect(screen.queryByTestId("pantry-item-item-veg")).not.toBeInTheDocument()
    expect(screen.queryByTestId("pantry-item-item-rice")).not.toBeInTheDocument()

    // Filter to Tủ đồ khô (rice)
    await user.click(within(nav).getByRole("button", { name: /Tủ đồ khô/i }))
    expect(screen.getByTestId("pantry-item-item-rice")).toBeInTheDocument()
    expect(screen.queryByTestId("pantry-item-item-veg")).not.toBeInTheDocument()
    expect(screen.queryByTestId("pantry-item-item-pork")).not.toBeInTheDocument()

    // Filter back to Tất cả
    await user.click(within(nav).getByRole("button", { name: /^Tất cả/i }))
    expect(screen.getByTestId("pantry-item-item-rice")).toBeInTheDocument()
    expect(screen.getByTestId("pantry-item-item-veg")).toBeInTheDocument()
    expect(screen.getByTestId("pantry-item-item-pork")).toBeInTheDocument()
  })

  test("populates the form when a quick preset button is clicked", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByRole("heading", { name: "Tủ bếp" })

    const quickRiceBtn = screen.getByRole("button", { name: "+ Gạo" })
    await user.click(quickRiceBtn)

    expect(screen.getByRole("combobox", { name: "Thực phẩm" })).toHaveValue(rice.foodId)
    expect(screen.getByRole("combobox", { name: "Đơn vị" })).toHaveValue("unit-g")
    expect(screen.getByRole("spinbutton", { name: "Số lượng" })).toHaveValue(1)
  })

  test("displays zero food waste suggestions (nấu vét tủ) when pantry ingredients match recipes", async () => {
    const user = userEvent.setup()
    const eggItem = pantryItem({ pantryItemId: "item-egg", foodId: egg.foodId, quantity: "4" })
    const tomatoItem = pantryItem({
      pantryItemId: "item-tomato",
      foodId: tomato.foodId,
      quantity: "3"
    })

    setup([eggItem, tomatoItem])

    expect(await screen.findByTestId("leftover-meal-suggestions")).toBeInTheDocument()
    expect(screen.getByText("Nấu vét tủ chống lãng phí")).toBeInTheDocument()

    // Canh cà chua trứng has both Trứng gà and Cà chua -> ready to cook!
    const soupCard = screen.getByTestId("leftover-dish-canh_ca_chua_trung")
    expect(soupCard).toBeInTheDocument()
    expect(within(soupCard).getByText("Canh cà chua trứng")).toBeInTheDocument()
    expect(within(soupCard).getByText("Đủ đồ")).toBeInTheDocument()
    expect(within(soupCard).getByText("✓ Cà chua")).toBeInTheDocument()
    expect(within(soupCard).getByText("✓ Trứng gà")).toBeInTheDocument()

    // Can toggle to only show ready to cook dishes
    await user.click(screen.getByRole("button", { name: /Nấu được ngay/i }))
    expect(screen.getByTestId("leftover-dish-canh_ca_chua_trung")).toBeInTheDocument()
  })

  test("displays shelf-life badges and allows sorting by urgency (ưu tiên dùng sớm)", async () => {
    const user = userEvent.setup()
    const riceItem = pantryItem({ pantryItemId: "item-rice", foodId: rice.foodId })
    const vegItem = pantryItem({ pantryItemId: "item-veg", foodId: vegetable.foodId })
    const porkItem = pantryItem({ pantryItemId: "item-pork", foodId: pork.foodId })

    setup([riceItem, vegItem, porkItem])

    // Wait for items to render
    const vegCard = await screen.findByTestId("pantry-item-item-veg")
    expect(within(vegCard).getByTestId("pantry-shelf-life-badge")).toHaveTextContent("1–3 ngày")
    expect(within(vegCard).getByTestId("pantry-urgent-tag")).toHaveTextContent("Dùng sớm")

    const porkCard = screen.getByTestId("pantry-item-item-pork")
    expect(within(porkCard).getByTestId("pantry-shelf-life-badge")).toHaveTextContent(
      "1–2 ngày mát"
    )
    expect(within(porkCard).getByTestId("pantry-urgent-tag")).toHaveTextContent("Dùng sớm")

    const riceCard = screen.getByTestId("pantry-item-item-rice")
    expect(within(riceCard).getByTestId("pantry-shelf-life-badge")).toHaveTextContent("Dài hạn")
    expect(within(riceCard).queryByTestId("pantry-urgent-tag")).not.toBeInTheDocument()

    // Test sorting by urgency toggle
    const urgencyToggle = screen.getByTestId("pantry-sort-urgency-toggle")
    expect(urgencyToggle).toHaveAttribute("aria-pressed", "false")
    await user.click(urgencyToggle)
    expect(urgencyToggle).toHaveAttribute("aria-pressed", "true")

    // In urgency sort, the items list should place perishable items (veg & pork) before rice
    const allCards = screen.getAllByTestId(/^pantry-item-item-/)
    const cardNames = allCards.map((c) => c.querySelector("h2")?.textContent)
    expect(cardNames[0]).not.toBe("Gạo")
    expect(cardNames[2]).toBe("Gạo")
  })

  test("badges dishes rescuing urgent perishable ingredients in leftover meal suggestions", async () => {
    const porkItem = pantryItem({
      pantryItemId: "item-pork",
      foodId: pork.foodId,
      quantity: "500"
    })
    const eggItem = pantryItem({
      pantryItemId: "item-egg",
      foodId: egg.foodId,
      quantity: "4"
    })

    setup([porkItem, eggItem])

    // "Thịt kho trứng" uses Thịt ba chỉ (fresh meat = urgent perishable) and Trứng gà
    expect(await screen.findByTestId("leftover-dish-thit_kho_trung")).toBeInTheDocument()
    const thitKhoCard = screen.getByTestId("leftover-dish-thit_kho_trung")
    expect(within(thitKhoCard).getByTestId("urgent-dish-badge-thit_kho_trung")).toBeInTheDocument()
    expect(within(thitKhoCard).getByText(/Ưu tiên cứu đồ tươi/i)).toBeInTheDocument()
    expect(within(thitKhoCard).getByText(/Thịt ba chỉ ⚡/i)).toBeInTheDocument()
  })
})
