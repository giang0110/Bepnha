import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import { SettingsPage } from "./settings-page"

describe("settings page", () => {
  it("groups household and account settings in one destination", async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole("heading", { name: "Cài đặt" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Chỉnh sửa thông tin gia đình" })).toHaveAttribute(
      "href",
      "/settings/household"
    )
    expect(screen.getByRole("link", { name: "Tài khoản và bảo mật" })).toHaveAttribute(
      "href",
      "/settings/account"
    )
  })
})
