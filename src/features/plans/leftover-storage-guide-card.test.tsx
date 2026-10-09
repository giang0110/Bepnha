import { describe, expect, it } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { LeftoverStorageGuideCard } from "./leftover-storage-guide-card"

describe("LeftoverStorageGuideCard component", () => {
  it("renders nothing when dish list is empty", () => {
    const { container } = render(<LeftoverStorageGuideCard dishes={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders storage card with title, badges, and dish details", () => {
    render(
      <LeftoverStorageGuideCard
        dishes={[
          { name: "Thịt kho tàu", role: "main" },
          { name: "Cơm trắng", role: "staple" }
        ]}
      />
    )

    expect(screen.getByTestId("leftover-storage-guide-card")).toBeInTheDocument()
    expect(screen.getByText("Bảo quản & An toàn sau bữa ăn")).toBeInTheDocument()
    expect(screen.getByText("Thịt kho tàu")).toBeInTheDocument()
    expect(screen.getByText("Bảo quản 2-3 ngày")).toBeInTheDocument()
    expect(screen.getByText("Cơm trắng")).toBeInTheDocument()
    expect(screen.getByText("Dùng trong 24 giờ")).toBeInTheDocument()
  })

  it("displays overnight hazard warning when leafy greens are present", () => {
    render(
      <LeftoverStorageGuideCard
        dishes={[
          { name: "Thịt kho tàu", role: "main" },
          { name: "Rau muống luộc", role: "vegetable" }
        ]}
      />
    )

    expect(screen.getByTestId("overnight-hazard-banner")).toBeInTheDocument()
    expect(
      within(screen.getByTestId("overnight-hazard-banner")).getByText(/Rau muống luộc/i)
    ).toBeInTheDocument()
  })

  it("toggles expanded state when toggle button is clicked", () => {
    render(
      <LeftoverStorageGuideCard
        dishes={[{ name: "Thịt kho tàu", role: "main" }]}
        defaultExpanded={true}
      />
    )

    const toggleBtn = screen.getByRole("button", { name: /Thu gọn/i })
    expect(screen.getByText("Chi tiết bảo quản từng món")).toBeInTheDocument()

    fireEvent.click(toggleBtn)
    expect(screen.queryByText("Chi tiết bảo quản từng món")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Xem chi tiết/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Xem chi tiết/i }))
    expect(screen.getByText("Chi tiết bảo quản từng món")).toBeInTheDocument()
  })
})
