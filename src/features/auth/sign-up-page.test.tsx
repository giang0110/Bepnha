import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import type { AuthSessionPort } from "@/application/auth/auth-session-port"
import { AppRoutes } from "@/app/App"
import { AuthProvider } from "@/app/auth/auth-provider"

function renderSignUp(signUp: AuthSessionPort["signUp"]) {
  const port = {
    getSession: vi.fn(() => Promise.resolve(null)),
    onAuthStateChange: vi.fn(() => vi.fn()),
    signIn: vi.fn(),
    signOut: vi.fn(),
    signUp
  } as unknown as AuthSessionPort
  render(
    <MemoryRouter initialEntries={["/sign-up"]}>
      <AuthProvider port={port}>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>
  )
}

async function submitSignUp() {
  const user = userEvent.setup()
  await user.type(await screen.findByRole("textbox", { name: "Email" }), "new@example.test")
  await user.type(screen.getByLabelText("Mật khẩu"), "a-secure-test-password")
  await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }))
}

describe("sign up", () => {
  it("navigates immediate local sessions to onboarding without collecting a name", async () => {
    renderSignUp(
      vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          session: {
            accessToken: "token",
            identity: { userId: "user-a", email: "new@example.test" }
          }
        })
      )
    )

    expect(screen.queryByLabelText(/tên|họ/i)).not.toBeInTheDocument()
    await submitSignUp()

    expect(await screen.findByRole("heading", { name: "Thiết lập gia đình" })).toBeInTheDocument()
  })

  it("shows confirmation-pending status when sign-up has no session", async () => {
    renderSignUp(
      vi.fn(() =>
        Promise.resolve({ ok: true as const, session: null, confirmationPending: true as const })
      )
    )

    await submitSignUp()

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Kiểm tra email để xác nhận tài khoản"
    )
  })
})
