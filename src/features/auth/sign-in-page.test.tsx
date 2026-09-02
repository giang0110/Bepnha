import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import type { AuthSessionPort } from "@/application/auth/auth-session-port"
import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import type { PantryRepository } from "@/application/pantry/pantry-repository"
import type { ShoppingListRepository } from "@/application/shopping/shopping-list-repository"
import { AppRoutes } from "@/app/App"
import { AuthProvider } from "@/app/auth/auth-provider"

const householdRepository: HouseholdRepository = {
  loadOwn: vi.fn(() => Promise.resolve(null)),
  saveOwn: vi.fn()
}

const pantryFoodOptionsRepository: PantryFoodOptionsRepository = {
  load: vi.fn(() => Promise.resolve([]))
}

const pantryRepository: PantryRepository = {
  load: vi.fn(() => Promise.resolve([])),
  upsert: vi.fn(),
  remove: vi.fn()
}

const shoppingListRepository: ShoppingListRepository = {
  load: vi.fn(() => Promise.resolve(null)),
  setChecked: vi.fn((shoppingListItemId: string, checked: boolean) =>
    Promise.resolve({
      shoppingListItemId,
      checked,
      checkedAt: checked ? "2026-09-01T00:00:00Z" : null
    })
  )
}

function renderSignIn(signIn: AuthSessionPort["signIn"], initialEntry = "/sign-in") {
  const port = {
    getSession: vi.fn(() => Promise.resolve(null)),
    onAuthStateChange: vi.fn(() => vi.fn()),
    signIn,
    signOut: vi.fn(),
    signUp: vi.fn()
  } as unknown as AuthSessionPort
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider port={port}>
        <AppRoutes
          householdRepository={householdRepository}
          pantryFoodOptionsRepository={pantryFoodOptionsRepository}
          pantryRepository={pantryRepository}
          shoppingListRepository={shoppingListRepository}
        />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe("sign in", () => {
  it("uses accessible credential fields and restores the protected redirect on success", async () => {
    const user = userEvent.setup()
    const signIn = vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        session: {
          accessToken: "token",
          identity: { userId: "user-a", email: "user@example.test" }
        }
      })
    )
    renderSignIn(signIn, "/household")
    const email = await screen.findByRole("textbox", { name: "Email" })
    const password = screen.getByLabelText("Mật khẩu")

    expect(email).toHaveAttribute("autocomplete", "email")
    expect(password).toHaveAttribute("autocomplete", "current-password")
    await user.type(email, "user@example.test")
    await user.type(password, "correct horse battery staple")
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }))

    expect(signIn).toHaveBeenCalledWith("user@example.test", "correct horse battery staple")
    expect(await screen.findByRole("heading", { name: "Gia đình của bạn" })).toBeInTheDocument()
  })

  it("shows a generic failure without leaking provider details", async () => {
    const user = userEvent.setup()
    renderSignIn(
      vi.fn(() => Promise.resolve({ ok: false as const, reason: "INVALID_CREDENTIALS" as const }))
    )

    await user.type(await screen.findByRole("textbox", { name: "Email" }), "bad@example.test")
    await user.type(screen.getByLabelText("Mật khẩu"), "bad-password")
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể đăng nhập. Vui lòng kiểm tra thông tin và thử lại."
    )
  })
})
