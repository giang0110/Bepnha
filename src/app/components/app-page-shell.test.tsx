import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"

import { AppPageShell } from "./app-page-shell"

test("provides exactly one focusable main landmark for the skip link to target", () => {
  render(
    <AppPageShell className="page-width">
      <h1>Nội dung trang</h1>
    </AppPageShell>
  )

  const main = screen.getByRole("main")
  expect(main).toHaveAttribute("id", "main-content")
  expect(main).toHaveAttribute("tabindex", "-1")
  expect(main).toHaveClass("page-width")
  expect(screen.getAllByRole("main")).toHaveLength(1)
  expect(screen.getByRole("heading", { name: "Nội dung trang" })).toBeInTheDocument()

  // The skip link itself lives in RequireAuth, ahead of the navigation landmark.
  expect(screen.queryByRole("link", { name: "Bỏ qua đến nội dung chính" })).toBeNull()
})
