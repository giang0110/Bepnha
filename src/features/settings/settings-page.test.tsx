import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import { ThemeProvider } from "@/app/theme/theme-context"
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

  it("renders the theme settings section and allows toggling the theme", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ThemeProvider>
          <SettingsPage />
        </ThemeProvider>
      </MemoryRouter>
    )

    expect(await screen.findByRole("heading", { name: "Giao diện ứng dụng" })).toBeInTheDocument()
    expect(screen.getByText(/Hiện tại đang sử dụng:/)).toBeInTheDocument()

    const toggleBtn = screen.getByRole("button", { name: /Chuyển sang chế độ/ })
    expect(toggleBtn).toBeInTheDocument()

    await user.click(toggleBtn)
    expect(screen.getByText(/Chế độ ban đêm \(Tối\)|Chế độ ban ngày \(Sáng\)/)).toBeInTheDocument()
  })
})
