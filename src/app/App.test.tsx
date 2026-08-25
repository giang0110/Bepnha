import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"

import App from "@/app/App"

test("renders the disabled Phase 1 start button in the Phase 0 shell", () => {
  render(<App />)

  expect(screen.getByRole("heading", { level: 1, name: "Bếp Nhà" })).toBeInTheDocument()
  expect(screen.getByText(/lập kế hoạch bữa ăn hằng tuần/i)).toBeInTheDocument()
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
  const phaseOneButton = screen.getByRole("button", { name: "Bắt đầu ở Giai đoạn 1" })

  expect(phaseOneButton).toBeDisabled()
  expect(phaseOneButton).toHaveClass("bg-slate-900", "text-white")
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  expect(screen.queryByRole("link")).not.toBeInTheDocument()
})
