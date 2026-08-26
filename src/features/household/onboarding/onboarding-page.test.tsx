import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { OnboardingPage } from "./onboarding-page"

describe("OnboardingPage member and budget flow", () => {
  it("preserves the in-memory member draft when navigating back", async () => {
    const user = userEvent.setup()
    render(<OnboardingPage />)

    const adults = screen.getByRole("spinbutton", { name: "Người lớn" })
    await user.clear(adults)
    await user.type(adults, "2")
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    expect(screen.getByRole("heading", { name: "Ngân sách cho 7 bữa chính" })).toBeInTheDocument()
    await user.type(screen.getByRole("textbox", { name: "Ngân sách tuần (VND)" }), "1500000")

    await user.click(screen.getByRole("button", { name: "Quay lại" }))

    expect(screen.getByRole("spinbutton", { name: "Người lớn" })).toHaveValue(2)
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    expect(screen.getByRole("textbox", { name: "Ngân sách tuần (VND)" })).toHaveValue("1.500.000")
    expect(window.localStorage).toHaveLength(0)
  })

  it("shows five-step progress without persisting a partial budget", async () => {
    const user = userEvent.setup()
    render(<OnboardingPage />)
    expect(screen.getByRole("progressbar", { name: "Tiến độ thiết lập" })).toHaveAttribute(
      "aria-valuenow",
      "1"
    )

    const adults = screen.getByRole("spinbutton", { name: "Người lớn" })
    await user.clear(adults)
    await user.type(adults, "1")
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    expect(screen.getByRole("progressbar", { name: "Tiến độ thiết lập" })).toHaveAttribute(
      "aria-valuenow",
      "2"
    )
  })
})
