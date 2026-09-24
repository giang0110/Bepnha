import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import type { AuthSession, AuthSessionPort } from "@/application/auth/auth-session-port"
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
  setChecked: vi.fn(),
  applyToPantry: vi.fn()
}

const session: AuthSession = {
  accessToken: "owner-token",
  identity: { userId: "user-1", email: "chu-nha@example.com" }
}

function renderAt(initialEntry: string, activeSession: AuthSession | null = session) {
  const port = {
    getSession: vi.fn(() => Promise.resolve(activeSession)),
    onAuthStateChange: vi.fn(() => vi.fn()),
    signIn: vi.fn(),
    signOut: vi.fn(),
    signUp: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn()
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

describe("primary navigation", () => {
  it("labels itself so it is reachable as a landmark", async () => {
    renderAt("/household")

    expect(await screen.findByRole("navigation", { name: "Điều hướng chính" })).toBeInTheDocument()
  })

  it("links the signed-in destinations", async () => {
    renderAt("/household")

    const nav = await screen.findByRole("navigation", { name: "Điều hướng chính" })
    const hrefs = [...nav.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"))
    // Đi chợ sits between the plan and the pantry: it is one of the two things this app is for
    // every week, and it used to be reachable only through a button on the plan page.
    expect(hrefs).toEqual(["/household", "/plan", "/shopping", "/pantry", "/settings/account"])
  })

  it("marks the current destination for assistive technology", async () => {
    renderAt("/pantry")

    const nav = await screen.findByRole("navigation", { name: "Điều hướng chính" })
    const current = [...nav.querySelectorAll("a")].filter(
      (anchor) => anchor.getAttribute("aria-current") === "page"
    )
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute("href", "/pantry")
  })

  it("keeps the skip link ahead of the navigation so one Tab still reaches it", async () => {
    const user = userEvent.setup()
    renderAt("/household")

    // The accessibility suite presses Tab exactly once and expects the skip link. Rendering the
    // navigation first would silently steal that first stop.
    await screen.findByRole("navigation", { name: "Điều hướng chính" })
    await user.tab()

    expect(screen.getByRole("link", { name: "Bỏ qua đến nội dung chính" })).toHaveFocus()
  })

  // The skip link is global, so every protected route must actually provide its target. Several
  // screens rendered a bare status paragraph or a `main` without the id and pointed it at nothing.
  it.each(["/household", "/settings/household", "/settings/account", "/pantry", "/plan"])(
    "points the skip link at a main landmark that exists on %s",
    async (route) => {
      renderAt(route)

      const skipLink = await screen.findByRole("link", { name: "Bỏ qua đến nội dung chính" })
      expect(skipLink).toHaveAttribute("href", "#main-content")
      expect(await screen.findByRole("main")).toHaveAttribute("id", "main-content")
      expect(document.querySelector("#main-content")).toBe(screen.getByRole("main"))
    }
  )

  it("stays out of signed-out routes", async () => {
    renderAt("/sign-in", null)

    await screen.findByRole("heading", { name: "Đăng nhập" })
    expect(screen.queryByRole("navigation", { name: "Điều hướng chính" })).toBeNull()
  })
})
