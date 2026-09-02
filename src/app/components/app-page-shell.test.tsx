import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"

import { AppPageShell } from "./app-page-shell"

test("provides one main landmark and a keyboard skip link", () => {
  render(
    <AppPageShell className="page-width">
      <h1>Nội dung trang</h1>
    </AppPageShell>
  )

  const skipLink = screen.getByRole("link", { name: "Bỏ qua đến nội dung chính" })
  expect(skipLink).toHaveAttribute("href", "#main-content")
  expect(skipLink.className).toContain("focus:")
  expect(skipLink.className).toContain("focus-visible:")

  const main = screen.getByRole("main")
  expect(main).toHaveAttribute("id", "main-content")
  expect(main).toHaveClass("page-width")
  expect(screen.getAllByRole("main")).toHaveLength(1)
  expect(screen.getByRole("heading", { name: "Nội dung trang" })).toBeInTheDocument()
})
