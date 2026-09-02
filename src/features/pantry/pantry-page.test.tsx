import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, test, vi } from "vitest"

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
  const pantryRepository: PantryRepository = { load, upsert, remove }
  const foodOptionsRepository: PantryFoodOptionsRepository = {
    load: vi.fn().mockResolvedValue([rice, vegetable])
  }

  render(
    <MemoryRouter>
      <PantryPage
        foodOptionsRepository={foodOptionsRepository}
        householdRepository={householdRepository}
        pantryRepository={pantryRepository}
      />
    </MemoryRouter>
  )

  return { householdRepository, pantryRepository, foodOptionsRepository, load, upsert, remove }
}

describe("PantryPage", () => {
  test("loads the owner pantry and published food options into a mobile-first accessible empty state", async () => {
    const { load, foodOptionsRepository } = setup()

    expect(screen.getByRole("status")).toHaveTextContent(/đang tải tủ bếp/i)
    expect(await screen.findByRole("heading", { name: "Tủ bếp" })).toBeInTheDocument()
    expect(screen.getByRole("main")).toHaveClass("max-w-md")
    expect(screen.getByText(/tủ bếp đang trống/i)).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Thực phẩm" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Đơn vị" })).toBeInTheDocument()
    expect(screen.getByRole("spinbutton", { name: "Số lượng" })).toHaveAttribute("min", "0")
    expect(load).toHaveBeenCalledWith(household.householdId)
    expect(foodOptionsRepository.load).toHaveBeenCalledTimes(1)
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
})
