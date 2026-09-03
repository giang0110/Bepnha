import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import type { AuthSession, AuthSessionPort } from "@/application/auth/auth-session-port"
import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import type { PantryRepository } from "@/application/pantry/pantry-repository"
import type {
  ShoppingListReadResult,
  ShoppingListRepository
} from "@/application/shopping/shopping-list-repository"
import { AppRoutes } from "@/app/App"
import { AuthProvider } from "@/app/auth/auth-provider"
import type { HouseholdSetup } from "@/domain/household/household"
import type { PlannerApi } from "@/features/plans/planner-api"

const session: AuthSession = {
  accessToken: "access-token",
  identity: { userId: "user-a", email: "user@example.test" }
}

const household: HouseholdSetup = {
  householdId: "20000000-0000-0000-0000-000000000001",
  memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
  weeklyPlanBudgetVnd: 700_000,
  maxElapsedMinutes: 30,
  ruleCodes: [],
  version: 1,
  onboardingCompletedAt: "2026-08-26T00:00:00Z"
}

const householdLoad = vi.fn<() => Promise<HouseholdSetup | null>>(() => Promise.resolve(null))
const householdRepository: HouseholdRepository = {
  loadOwn: householdLoad,
  saveOwn: vi.fn()
}

const pantryFoodOptionsLoad = vi.fn(() => Promise.resolve([]))
const pantryFoodOptionsRepository: PantryFoodOptionsRepository = {
  load: pantryFoodOptionsLoad
}

const pantryRepository: PantryRepository = {
  load: vi.fn(() => Promise.resolve([])),
  upsert: vi.fn(),
  remove: vi.fn()
}

const plannerApi: PlannerApi = {
  generate: vi.fn(),
  preview: vi.fn(),
  apply: vi.fn()
}

const shoppingLoad = vi.fn(() => Promise.resolve<ShoppingListReadResult | null>(null))
const shoppingSetChecked = vi.fn((shoppingListItemId: string, checked: boolean) =>
  Promise.resolve({
    shoppingListItemId,
    checked,
    checkedAt: checked ? "2026-09-01T00:00:00Z" : null
  })
)
const shoppingListRepository: ShoppingListRepository = {
  load: shoppingLoad,
  setChecked: shoppingSetChecked
}

function createAuthPort(initialSession: AuthSession | null): {
  port: AuthSessionPort
  unsubscribe: ReturnType<typeof vi.fn>
} {
  const unsubscribe = vi.fn()
  return {
    unsubscribe,
    port: {
      getSession: vi.fn(() => Promise.resolve(initialSession)),
      onAuthStateChange: vi.fn(() => unsubscribe),
      signIn: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn()
    }
  }
}

function renderRoutes(port: AuthSessionPort, initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider port={port}>
        <AppRoutes
          householdRepository={householdRepository}
          pantryFoodOptionsRepository={pantryFoodOptionsRepository}
          pantryRepository={pantryRepository}
          plannerApi={plannerApi}
          shoppingListRepository={shoppingListRepository}
        />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe("authenticated app shell", () => {
  it("shows an accessible loading state while restoring the session", () => {
    const auth = createAuthPort(null)
    auth.port.getSession = vi.fn(() => new Promise<AuthSession | null>(() => undefined))

    renderRoutes(auth.port, "/onboarding")

    expect(screen.getByRole("status")).toHaveTextContent("Đang kiểm tra phiên đăng nhập")
  })

  it.each(["/onboarding", "/settings/household", "/pantry", "/shopping/plan-a"])(
    "redirects signed-out protected route %s to sign in",
    async (route) => {
      renderRoutes(createAuthPort(null).port, route)

      expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument()
    }
  )

  it("renders the protected onboarding shell for an authenticated session", async () => {
    renderRoutes(createAuthPort(session).port, "/onboarding")

    expect(
      await screen.findByRole("heading", { name: "Thành viên trong gia đình" })
    ).toBeInTheDocument()
  })

  it("routes an authenticated pantry visit through the owner repositories", async () => {
    householdLoad.mockResolvedValueOnce(household)
    pantryFoodOptionsLoad.mockClear()
    renderRoutes(createAuthPort(session).port, "/pantry")

    expect(await screen.findByRole("heading", { name: "Tủ bếp" })).toBeInTheDocument()
    expect(pantryFoodOptionsLoad).toHaveBeenCalledOnce()
  })

  it("routes an authenticated historical shopping revision through the owner repository", async () => {
    shoppingLoad.mockResolvedValueOnce({
      status: "legacy_unavailable",
      code: "SHOPPING_LIST_NOT_AVAILABLE_FOR_LEGACY_REVISION",
      planId: "plan-a",
      revisionId: "revision-v1",
      weekStart: "2026-08-24"
    })

    renderRoutes(createAuthPort(session).port, "/shopping/plan-a?revisionId=revision-v1")

    expect(await screen.findByRole("heading", { name: "Đi chợ" })).toBeInTheDocument()
    await waitFor(() => {
      expect(shoppingLoad).toHaveBeenCalledWith("plan-a", "revision-v1")
    })
  })

  it("routes an authenticated return visit through the authoritative household summary", async () => {
    renderRoutes(createAuthPort(session).port, "/")

    expect(await screen.findByRole("heading", { name: "Gia đình của bạn" })).toBeInTheDocument()
  })

  it("unsubscribes from auth changes on unmount", async () => {
    const auth = createAuthPort(session)
    const view = renderRoutes(auth.port, "/onboarding")
    await screen.findByRole("heading", { name: "Thành viên trong gia đình" })

    view.unmount()

    expect(auth.unsubscribe).toHaveBeenCalledOnce()
  })

  it("signs out and returns to sign in", async () => {
    const user = userEvent.setup()
    const auth = createAuthPort(session)
    const signOut = vi.fn(() => Promise.resolve({ ok: true as const }))
    auth.port.signOut = signOut
    renderRoutes(auth.port, "/household")

    await user.click(await screen.findByRole("button", { name: "Đăng xuất" }))

    expect(signOut).toHaveBeenCalledOnce()
    expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument()
  })

  it("renders a small not-found page for unknown public routes", async () => {
    renderRoutes(createAuthPort(null).port, "/missing")

    expect(await screen.findByRole("heading", { name: "Không tìm thấy trang" })).toBeInTheDocument()
  })
})
