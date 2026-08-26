import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import type { AuthSession, AuthSessionPort } from "@/application/auth/auth-session-port"
import type { HouseholdRepository } from "@/application/household/household-repository"
import { AppRoutes } from "@/app/App"
import { AuthProvider } from "@/app/auth/auth-provider"

const session: AuthSession = {
  accessToken: "access-token",
  identity: { userId: "user-a", email: "user@example.test" }
}

const householdRepository: HouseholdRepository = {
  loadOwn: vi.fn(() => Promise.resolve(null)),
  saveOwn: vi.fn()
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
        <AppRoutes householdRepository={householdRepository} />
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

  it.each(["/onboarding", "/settings/household"])(
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
