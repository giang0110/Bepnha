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
  setChecked: vi.fn()
}

const recoverySession: AuthSession = {
  accessToken: "recovery-token",
  identity: { userId: "user-1", email: "nguoi-dung@example.com" }
}

function renderAt(
  initialEntry: string,
  overrides: Partial<AuthSessionPort> = {},
  session: AuthSession | null = null,
  emitRecovery = false
) {
  const onAuthStateChange = vi.fn(
    (listener: Parameters<AuthSessionPort["onAuthStateChange"]>[0]) => {
      if (emitRecovery) {
        listener({ kind: "PASSWORD_RECOVERY", session: recoverySession })
      }
      return vi.fn()
    }
  )
  const port = {
    getSession: vi.fn(() => Promise.resolve(session)),
    onAuthStateChange,
    signIn: vi.fn(),
    signOut: vi.fn(),
    signUp: vi.fn(),
    requestPasswordReset: vi.fn(() => Promise.resolve({ ok: true as const })),
    updatePassword: vi.fn(() => Promise.resolve({ ok: true as const })),
    ...overrides
  } satisfies AuthSessionPort

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
  return port
}

describe("forgot password", () => {
  it("is reachable from sign-in so a locked-out owner is never stranded", async () => {
    renderAt("/sign-in")

    expect(await screen.findByRole("link", { name: "Quên mật khẩu?" })).toHaveAttribute(
      "href",
      "/forgot-password"
    )
  })

  it("sends the reset request with an absolute same-origin return path", async () => {
    const user = userEvent.setup()
    const requestPasswordReset = vi.fn(() => Promise.resolve({ ok: true as const }))
    renderAt("/forgot-password", { requestPasswordReset })

    await user.type(await screen.findByLabelText("Email"), "nguoi-dung@example.com")
    await user.click(screen.getByRole("button", { name: "Gửi liên kết đặt lại" }))

    expect(requestPasswordReset).toHaveBeenCalledWith(
      "nguoi-dung@example.com",
      `${window.location.origin}/reset-password`
    )
  })

  it("never reveals whether the address has an account", async () => {
    const user = userEvent.setup()
    renderAt("/forgot-password")

    await user.type(await screen.findByLabelText("Email"), "khong-ton-tai@example.com")
    await user.click(screen.getByRole("button", { name: "Gửi liên kết đặt lại" }))

    // Same wording regardless of whether the account exists: the port cannot report the difference
    // and this copy must not imply one either.
    const confirmation = await screen.findByRole("status")
    expect(confirmation).toHaveTextContent("Nếu địa chỉ này có tài khoản")
    expect(document.body.textContent).not.toMatch(/không tìm thấy|chưa đăng ký|không tồn tại/iu)
  })

  it("reports a transport failure as retryable rather than as a missing account", async () => {
    const user = userEvent.setup()
    renderAt("/forgot-password", {
      requestPasswordReset: vi.fn(() =>
        Promise.resolve({ ok: false as const, reason: "RETRYABLE_FAILURE" as const })
      )
    })

    await user.type(await screen.findByLabelText("Email"), "nguoi-dung@example.com")
    await user.click(screen.getByRole("button", { name: "Gửi liên kết đặt lại" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Vui lòng thử lại")
  })
})

describe("reset password", () => {
  it("explains an expired link instead of bouncing to sign-in", async () => {
    renderAt("/reset-password")

    expect(
      await screen.findByRole("heading", { name: "Liên kết không còn hiệu lực" })
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Yêu cầu liên kết mới" })).toHaveAttribute(
      "href",
      "/forgot-password"
    )
  })

  it("does not expose the reset form to an ordinary authenticated session", async () => {
    renderAt("/reset-password", {}, recoverySession)

    expect(
      await screen.findByRole("heading", { name: "Liên kết không còn hiệu lực" })
    ).toBeInTheDocument()
    expect(screen.queryByLabelText("Mật khẩu mới")).not.toBeInTheDocument()
  })

  it("refuses mismatched confirmations without calling the port", async () => {
    const user = userEvent.setup()
    const updatePassword = vi.fn(() => Promise.resolve({ ok: true as const }))
    renderAt("/reset-password", { updatePassword }, recoverySession, true)

    await user.type(await screen.findByLabelText("Mật khẩu mới"), "mat-khau-moi-1")
    await user.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "mat-khau-moi-2")
    await user.click(screen.getByRole("button", { name: "Lưu mật khẩu mới" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("chưa khớp")
    expect(updatePassword).not.toHaveBeenCalled()
  })

  it("saves a matching password through the recovery session", async () => {
    const user = userEvent.setup()
    const updatePassword = vi.fn(() => Promise.resolve({ ok: true as const }))
    renderAt("/reset-password", { updatePassword }, recoverySession, true)

    await user.type(await screen.findByLabelText("Mật khẩu mới"), "mat-khau-moi-1")
    await user.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "mat-khau-moi-1")
    await user.click(screen.getByRole("button", { name: "Lưu mật khẩu mới" }))

    expect(updatePassword).toHaveBeenCalledWith("mat-khau-moi-1")
  })

  it.each([
    ["WEAK_PASSWORD", "chưa đủ mạnh"],
    ["RECOVERY_SESSION_REQUIRED", "hết hạn"],
    ["RETRYABLE_FAILURE", "thử lại"]
  ] as const)("explains the %s outcome in Vietnamese", async (reason, expected) => {
    const user = userEvent.setup()
    renderAt(
      "/reset-password",
      { updatePassword: vi.fn(() => Promise.resolve({ ok: false as const, reason })) },
      recoverySession,
      true
    )

    await user.type(await screen.findByLabelText("Mật khẩu mới"), "mat-khau-moi-1")
    await user.type(screen.getByLabelText("Nhập lại mật khẩu mới"), "mat-khau-moi-1")
    await user.click(screen.getByRole("button", { name: "Lưu mật khẩu mới" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(expected)
  })
})
