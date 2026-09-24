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
  )
) {
  const signOut = vi.fn(() => Promise.resolve({ ok: true as const }))
  const port = {
    getSession: vi.fn(() => Promise.resolve(session)),
    onAuthStateChange: vi.fn(() => vi.fn()),
    signIn: vi.fn(),
    signOut,
    signUp: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn()
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
  return { deleteOwnAccount, signOut }
}

async function deleteButton() {
  return await screen.findByRole("button", { name: "Xoá tài khoản của tôi" })
}

/** The page is lazily loaded behind RequireAuth, so the field only exists after both resolve. */
async function emailField() {
  return await screen.findByLabelText("Nhập lại email của bạn để xác nhận")
}

describe("account deletion", () => {
  it("states plainly that deletion is immediate and irreversible", async () => {
    renderAccountPage()

    expect(await screen.findByRole("heading", { name: "Xoá tài khoản" })).toBeVisible()
    expect(document.body.textContent).toContain("ngay lập tức và không thể hoàn tác")
  })

  it("keeps the action disabled until the signed-in email is retyped exactly", async () => {
    const user = userEvent.setup()
    renderAccountPage()

    expect(await deleteButton()).toBeDisabled()

    const field = await emailField()
    await user.type(field, "chu-nha@example.co")
    expect(await deleteButton()).toBeDisabled()

    await user.type(field, "m")
    expect(await deleteButton()).toBeEnabled()
  })

  it("sends the owner's own token and nothing identifying the account", async () => {
    const user = userEvent.setup()
    const { deleteOwnAccount } = renderAccountPage()

    await user.type(await emailField(), OWNER_EMAIL)
    await user.click(await deleteButton())

    expect(deleteOwnAccount).toHaveBeenCalledWith("owner-token")
  })

  it("clears the local session after the account is gone", async () => {
    const user = userEvent.setup()
    const { signOut } = renderAccountPage()

    await user.type(await emailField(), OWNER_EMAIL)
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
    await user.click(await deleteButton())

    expect(await screen.findByRole("alert")).toHaveTextContent(expected)
    expect(await deleteButton()).toBeEnabled()
  })
})
