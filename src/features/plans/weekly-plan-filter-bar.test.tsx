import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { WeeklyPlanFilterBar } from "./weekly-plan-filter-bar"

const MOCK_COUNTS = {
  all: 7,
  quickCook: 4,
  seafood: 2,
  poultry: 1,
  pork: 2,
  beef: 1,
  eggTofu: 1,
  cooling: 2
}

describe("WeeklyPlanFilterBar", () => {
  it("renders search input and filter chips", () => {
    render(
      <WeeklyPlanFilterBar
        activeProtein="all"
        coolingOnly={false}
        counts={MOCK_COUNTS}
        quickCookOnly={false}
        searchQuery=""
        totalItems={7}
        totalMatches={7}
        onCoolingToggle={vi.fn()}
        onProteinChange={vi.fn()}
        onQuickCookToggle={vi.fn()}
        onResetFilters={vi.fn()}
        onSearchChange={vi.fn()}
      />
    )

    expect(screen.getByPlaceholderText(/Tìm món trong tuần/i)).toBeInTheDocument()
    expect(screen.getByTestId("filter-chip-all")).toBeInTheDocument()
    expect(screen.getByTestId("filter-chip-quick-cook")).toBeInTheDocument()
    expect(screen.getByTestId("filter-chip-seafood")).toBeInTheDocument()
  })

  it("handles search input change and clearing", async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()

    render(
      <WeeklyPlanFilterBar
        activeProtein="all"
        coolingOnly={false}
        counts={MOCK_COUNTS}
        quickCookOnly={false}
        searchQuery="cá thu"
        totalItems={7}
        totalMatches={2}
        onCoolingToggle={vi.fn()}
        onProteinChange={vi.fn()}
        onQuickCookToggle={vi.fn()}
        onResetFilters={vi.fn()}
        onSearchChange={onSearchChange}
      />
    )

    const clearBtn = screen.getByRole("button", { name: /Xóa tìm kiếm/i })
    expect(clearBtn).toBeInTheDocument()
    await user.click(clearBtn)
    expect(onSearchChange).toHaveBeenCalledWith("")
  })

  it("triggers filter chip callbacks when clicked", async () => {
    const user = userEvent.setup()
    const onProteinChange = vi.fn()
    const onQuickCookToggle = vi.fn()

    render(
      <WeeklyPlanFilterBar
        activeProtein="all"
        coolingOnly={false}
        counts={MOCK_COUNTS}
        quickCookOnly={false}
        searchQuery=""
        totalItems={7}
        totalMatches={7}
        onCoolingToggle={vi.fn()}
        onProteinChange={onProteinChange}
        onQuickCookToggle={onQuickCookToggle}
        onResetFilters={vi.fn()}
        onSearchChange={vi.fn()}
      />
    )

    await user.click(screen.getByTestId("filter-chip-seafood"))
    expect(onProteinChange).toHaveBeenCalledWith("seafood")

    await user.click(screen.getByTestId("filter-chip-quick-cook"))
    expect(onQuickCookToggle).toHaveBeenCalledOnce()
  })
})
