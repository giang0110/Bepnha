import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CondimentPairingCard } from "./condiment-pairing-card"

describe("CondimentPairingCard component", () => {
  it("renders recommended sauces and side dishes for a meal", () => {
    render(
      <CondimentPairingCard
        mealNameVi="Cá diêu hồng chiên xù & Canh rau ngót"
        dishNames={["Cá chiên xù", "Canh rau ngót"]}
      />
    )

    expect(screen.getByText(/Gợi ý nước chấm & ăn kèm chuẩn vị/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Nước mắm gừng/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Nước mắm tỏi ớt chua ngọt/i).length).toBeGreaterThanOrEqual(1)
  })

  it("expands recipe instructions when details button is clicked", () => {
    render(
      <CondimentPairingCard
        mealNameVi="Thịt ba chỉ luộc & Canh rau đay cua đồng"
        dishNames={["Thịt ba chỉ luộc", "Canh cua rau đay"]}
      />
    )

    expect(screen.getByText(/Mắm tôm đánh chanh sủi bọt/i)).toBeInTheDocument()
    const detailButtons = screen.getAllByRole("button", { name: /Xem cách pha/i })
    const firstButton = detailButtons[0]
    expect(firstButton).toBeDefined()
    if (firstButton) {
      fireEvent.click(firstButton)
    }
    expect(screen.getByText(/Khuấy tan|Cho mắm tôm/i)).toBeInTheDocument()
  })

  it("copies recipe instructions to clipboard on click", () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock
      }
    })

    render(<CondimentPairingCard mealNameVi="Gà ta luộc lá chanh" dishNames={["Gà luộc"]} />)

    expect(screen.getByText(/Muối tiêu chanh lá chanh/i)).toBeInTheDocument()
    const copyButton = screen.getByRole("button", { name: /Sao chép công thức/i })
    fireEvent.click(copyButton)

    expect(writeTextMock).toHaveBeenCalledTimes(1)
    const firstCall = writeTextMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    if (firstCall) {
      expect(firstCall[0]).toMatch(/Muối tiêu chanh lá chanh/i)
    }
  })

  it("renders side dishes recommendations properly", () => {
    render(
      <CondimentPairingCard
        mealNameVi="Thịt kho tàu & Dưa cải chua"
        dishNames={["Thịt kho tàu", "Canh cải thịt băm"]}
      />
    )

    expect(screen.getByText(/Món ăn kèm chống ngấy/i)).toBeInTheDocument()
    expect(screen.getByText(/Dưa cải muối chua/i)).toBeInTheDocument()
  })
})
