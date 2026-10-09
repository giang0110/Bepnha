import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { PantryInventoryFilterBar } from "./pantry-inventory-filter-bar"

describe("PantryInventoryFilterBar", () => {
  const defaultProps = {
    searchQuery: "",
    onSearchChange: vi.fn(),
    activeZone: "all" as const,
    onZoneChange: vi.fn(),
    urgentOnly: false,
    onUrgentToggle: vi.fn(),
    sortByUrgency: false,
    onSortByUrgencyToggle: vi.fn(),
    totalCount: 10,
    matchCount: 10,
    urgentCount: 2,
    zoneCounts: {
      all: 10,
      chilled: 4,
      frozen: 3,
      ambient: 3
    },
    onShareInventory: vi.fn(),
    onResetFilters: vi.fn()
  }

  test("renders search input, storage zone buttons, urgent chip, and share button", () => {
    render(<PantryInventoryFilterBar {...defaultProps} />)

    expect(screen.getByTestId("pantry-search-input")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Tất cả/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Ngăn mát/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Ngăn đông/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Tủ đồ khô/i })).toBeInTheDocument()
    expect(screen.getByTestId("pantry-filter-urgent")).toBeInTheDocument()
    expect(screen.getByTestId("pantry-sort-urgency-toggle")).toBeInTheDocument()
    expect(screen.getByTestId("pantry-share-button")).toBeInTheDocument()
  })

  test("handles search input change and clearing", async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const { rerender } = render(
      <PantryInventoryFilterBar {...defaultProps} onSearchChange={onSearchChange} />
    )

    const searchInput = screen.getByTestId("pantry-search-input")
    await user.type(searchInput, "trứng")
    expect(onSearchChange).toHaveBeenCalled()

    // Rerender with search query present to test clear button
    rerender(
      <PantryInventoryFilterBar
        {...defaultProps}
        searchQuery="trứng"
        onSearchChange={onSearchChange}
      />
    )

    const clearBtn = screen.getByRole("button", { name: "Xóa tìm kiếm thực phẩm" })
    await user.click(clearBtn)
    expect(onSearchChange).toHaveBeenCalledWith("")
  })

  test("handles filter zone selection and urgent toggle", async () => {
    const user = userEvent.setup()
    const onZoneChange = vi.fn()
    const onUrgentToggle = vi.fn()

    render(
      <PantryInventoryFilterBar
        {...defaultProps}
        onZoneChange={onZoneChange}
        onUrgentToggle={onUrgentToggle}
      />
    )

    await user.click(screen.getByRole("button", { name: /Ngăn mát/i }))
    expect(onZoneChange).toHaveBeenCalledWith("chilled")

    await user.click(screen.getByTestId("pantry-filter-urgent"))
    expect(onUrgentToggle).toHaveBeenCalledOnce()
  })

  test("displays filter match summary and calls onResetFilters when active", async () => {
    const user = userEvent.setup()
    const onResetFilters = vi.fn()

    render(
      <PantryInventoryFilterBar
        {...defaultProps}
        searchQuery="thịt"
        matchCount={2}
        totalCount={10}
        onResetFilters={onResetFilters}
      />
    )

    expect(screen.getByText(/Hiển thị/)).toHaveTextContent("2/10 món")
    const resetBtn = screen.getByTestId("pantry-reset-filter-button")
    await user.click(resetBtn)
    expect(onResetFilters).toHaveBeenCalledOnce()
  })

  test("calls onShareInventory when clicking share button", async () => {
    const user = userEvent.setup()
    const onShareInventory = vi.fn()

    render(<PantryInventoryFilterBar {...defaultProps} onShareInventory={onShareInventory} />)

    await user.click(screen.getByTestId("pantry-share-button"))
    expect(onShareInventory).toHaveBeenCalledOnce()
  })
})
