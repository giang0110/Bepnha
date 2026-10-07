import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import type { AccountApi, DeleteAccountResult } from "@/application/account/account-deletion"
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

const OWNER_EMAIL = "chu-nha@example.com"

const session: AuthSession = {
  accessToken: "owner-token",
  identity: { userId: "user-1", email: OWNER_EMAIL }
}

function renderAccountPage(
  deleteOwnAccount: AccountApi["deleteOwnAccount"] = vi.fn(() =>
    Promise.resolve({ ok: true } satisfies DeleteAccountResult)
  ),
  updatePassword: AuthSessionPort["updatePassword"] = vi.fn(() =>
    Promise.resolve({ ok: true as const })
  ),
  signIn: AuthSessionPort["signIn"] = vi.fn(() => Promise.resolve({ ok: true as const, session }))
) {
  const signOut = vi.fn(() => Promise.resolve({ ok: true as const }))
  const port = {
    getSession: vi.fn(() => Promise.resolve(session)),
    onAuthStateChange: vi.fn(() => vi.fn()),
    signIn,
    signOut,
    signUp: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword
  } as unknown as AuthSessionPort

  render(
    <MemoryRouter initialEntries={["/settings/account"]}>
      <AuthProvider port={port}>
        <AppRoutes
          accountApi={{ deleteOwnAccount }}
          householdRepository={householdRepository}
          pantryFoodOptionsRepository={pantryFoodOptionsRepository}
          pantryRepository={pantryRepository}
          shoppingListRepository={shoppingListRepository}
        />
      </AuthProvider>
    </MemoryRouter>
  )
  return { deleteOwnAccount, signOut, updatePassword }
}

async function deleteButton() {
  return await screen.findByRole("button", { name: "Xoá tài khoản của tôi" })
}

/** The page is lazily loaded behind RequireAuth, so the field only exists after both resolve. */
async function emailField() {
  return await screen.findByLabelText("Nhập lại email của bạn để xác nhận")
}

async function passwordField() {
  return await screen.findByLabelText("Mật khẩu tài khoản để xác thực lại")
}

describe("account deletion", () => {
  it("states plainly that deletion is immediate and irreversible", async () => {
    renderAccountPage()

    expect(await screen.findByRole("heading", { name: "Xoá tài khoản" })).toBeVisible()
    expect(document.body.textContent).toContain("ngay lập tức và không thể hoàn tác")
  })

  it("keeps the action disabled until both email and password are provided", async () => {
    const user = userEvent.setup()
    renderAccountPage()

    expect(await deleteButton()).toBeDisabled()

    const emailInput = await emailField()
    const passInput = await passwordField()

    await user.type(emailInput, "chu-nha@example.co")
    await user.type(passInput, "my-pass")
    expect(await deleteButton()).toBeDisabled()

    await user.type(emailInput, "m")
    expect(await deleteButton()).toBeEnabled()

    await user.clear(passInput)
    expect(await deleteButton()).toBeDisabled()
  })

  it("sends the owner's own token and nothing identifying the account", async () => {
    const user = userEvent.setup()
    const { deleteOwnAccount } = renderAccountPage()

    await user.type(await emailField(), OWNER_EMAIL)
    await user.type(await passwordField(), "my-password")
    await user.click(await deleteButton())

    expect(deleteOwnAccount).toHaveBeenCalledWith("owner-token")
  })

  it("clears the local session after the account is gone", async () => {
    const user = userEvent.setup()
    const { signOut } = renderAccountPage()

    await user.type(await emailField(), OWNER_EMAIL)
    await user.type(await passwordField(), "my-password")
    await user.click(await deleteButton())

    expect(signOut).toHaveBeenCalledOnce()
  })

  it("explains that a catalog author cannot self-delete", async () => {
    const user = userEvent.setup()
    renderAccountPage(
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          reason: "ACCOUNT_RETAINED_FOR_CATALOG_AUTHORSHIP"
        } satisfies DeleteAccountResult)
      )
    )

    await user.type(await emailField(), OWNER_EMAIL)
    await user.type(await passwordField(), "my-password")
    await user.click(await deleteButton())

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("dữ liệu thực phẩm dùng chung")
    expect(alert).toHaveTextContent("liên hệ người vận hành")
  })

  it.each([
    ["ACCOUNT_DELETE_UNAVAILABLE", "thử lại sau"],
    ["UNAUTHORIZED", "đăng nhập lại"]
  ] as const)("explains the %s outcome and stays on the page", async (reason, expected) => {
    const user = userEvent.setup()
    renderAccountPage(vi.fn(() => Promise.resolve({ ok: false, reason })))

    await user.type(await emailField(), OWNER_EMAIL)
    await user.type(await passwordField(), "my-password")
    await user.click(await deleteButton())

    expect(await screen.findByRole("alert")).toHaveTextContent(expected)
    expect(await deleteButton()).toBeEnabled()
  })

  it("rejects deletion when security confirmation password is incorrect", async () => {
    const user = userEvent.setup()
    const deleteOwnAccount = vi.fn()
    const signIn = vi.fn(() =>
      Promise.resolve({ ok: false as const, reason: "INVALID_CREDENTIALS" as const })
    )
    renderAccountPage(deleteOwnAccount, vi.fn(), signIn)

    await user.type(await emailField(), OWNER_EMAIL)
    await user.type(await passwordField(), "wrong-pass")
    await user.click(await deleteButton())

    expect(signIn).toHaveBeenCalledWith(OWNER_EMAIL, "wrong-pass")
    expect(deleteOwnAccount).not.toHaveBeenCalled()
    expect(await screen.findByRole("alert")).toHaveTextContent("Mật khẩu xác nhận không chính xác")
  })
})

describe("password change", () => {
  it("renders the password change form and validates minimum length and match", async () => {
    const user = userEvent.setup()
    renderAccountPage()

    expect(await screen.findByRole("heading", { name: "Đổi mật khẩu" })).toBeVisible()
    const updateBtn = screen.getByRole("button", { name: "Cập nhật mật khẩu" })
    expect(updateBtn).toBeDisabled()

    const newPassField = screen.getByLabelText("Mật khẩu mới")
    const confirmPassField = screen.getByLabelText("Xác nhận mật khẩu mới")

    await user.type(newPassField, "short")
    await user.type(confirmPassField, "short")
    expect(updateBtn).toBeDisabled()

    await user.clear(newPassField)
    await user.clear(confirmPassField)
    await user.type(newPassField, "password123")
    await user.type(confirmPassField, "password456")
    expect(updateBtn).toBeDisabled()

    await user.clear(confirmPassField)
    await user.type(confirmPassField, "password123")
    expect(updateBtn).toBeEnabled()
  })

  it("calls updatePassword and shows success message upon valid submission", async () => {
    const user = userEvent.setup()
    const updatePassword = vi.fn(() => Promise.resolve({ ok: true as const }))
    renderAccountPage(undefined, updatePassword)

    const newPassField = await screen.findByLabelText("Mật khẩu mới")
    const confirmPassField = screen.getByLabelText("Xác nhận mật khẩu mới")
    const updateBtn = screen.getByRole("button", { name: "Cập nhật mật khẩu" })

    await user.type(newPassField, "validPassword123")
    await user.type(confirmPassField, "validPassword123")
    await user.click(updateBtn)

    expect(updatePassword).toHaveBeenCalledWith("validPassword123")
    expect(await screen.findByRole("status")).toHaveTextContent("Đã đổi mật khẩu thành công.")
  })
})
