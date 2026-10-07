import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"

import type { AccountApi, DeleteAccountFailure } from "@/application/account/account-deletion"
import { useAuth } from "@/app/auth/auth-context"
import { Button } from "@/app/components/ui/button"
import { toast } from "@/app/components/ui/toast"
import { AppPageShell } from "@/app/components/app-page-shell"

const failureMessages: Record<DeleteAccountFailure | "INVALID_PASSWORD", string> = {
  ACCOUNT_DELETE_UNAVAILABLE: "Chưa xoá được tài khoản. Vui lòng thử lại sau ít phút.",
  ACCOUNT_RETAINED_FOR_CATALOG_AUTHORSHIP:
    "Tài khoản này đã tạo dữ liệu thực phẩm dùng chung nên không thể tự xoá, vì việc đó sẽ làm mất nguồn gốc của dữ liệu đó. Vui lòng liên hệ người vận hành.",
  UNAUTHORIZED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử lại.",
  INVALID_PASSWORD: "Mật khẩu xác nhận không chính xác. Vui lòng kiểm tra lại."
}

interface AccountSettingsPageProps {
  accountApi: AccountApi
}

/**
 * Deletion is immediate and permanent: there is no grace period and no export step. The typed-email
 * confirmation exists so the action cannot be taken by a mis-click, and the button stays disabled
 * until it matches the signed-in address exactly.
 */
export function AccountSettingsPage({ accountApi }: Readonly<AccountSettingsPageProps>) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [typedEmail, setTypedEmail] = useState("")
  const [typedPassword, setTypedPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<DeleteAccountFailure | "INVALID_PASSWORD" | null>(null)

  const email = auth.session?.identity.email ?? null
  const confirmed =
    email !== null &&
    typedEmail.trim().toLowerCase() === email.toLowerCase() &&
    typedPassword.trim().length > 0

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!confirmed || auth.session === null || email === null) return

    setBusy(true)
    setFailure(null)

    const authResult = await auth.signIn(email, typedPassword)
    if (!authResult.ok) {
      setBusy(false)
      setFailure("INVALID_PASSWORD")
      return
    }

    const result = await accountApi.deleteOwnAccount(auth.session.accessToken)
    if (result.ok) {
      toast.info("Tài khoản của bạn đã được xoá.")
      // The account is gone; clearing the local session is what turns that into a signed-out app.
      await auth.signOut()
      void navigate("/sign-in", { replace: true })
      return
    }
    setBusy(false)
    setFailure(result.reason)
  }

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "error" | "success"
    text: string
  } | null>(null)

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword.length < 8) {
      setPasswordMessage({ type: "error", text: "Mật khẩu cần ít nhất 8 ký tự." })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "Mật khẩu xác nhận không khớp." })
      return
    }
    setPasswordBusy(true)
    setPasswordMessage(null)
    const result = await auth.updatePassword(newPassword)
    setPasswordBusy(false)
    if (result.ok) {
      setNewPassword("")
      setConfirmPassword("")
      setPasswordMessage({ type: "success", text: "Đã đổi mật khẩu thành công." })
      toast.success("Đã đổi mật khẩu thành công!")
    } else {
      setPasswordMessage({
        type: "error",
        text:
          result.reason === "WEAK_PASSWORD"
            ? "Mật khẩu không đủ mạnh (cần ít nhất 8 ký tự)."
            : "Không thể đổi mật khẩu lúc này. Vui lòng thử lại sau ít phút."
      })
    }
  }

  return (
    <AppPageShell className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-herb-700">Cài đặt</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Tài khoản</h1>
        {email === null ? null : <p className="text-sm text-ink-soft">{email}</p>}
      </header>

      <section className="flex max-w-2xl flex-col gap-3 rounded-2xl border border-edge bg-paper-raised p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-ink">Đổi mật khẩu</h2>
        <p className="text-sm text-ink-soft">
          Đặt mật khẩu mới cho tài khoản của bạn (tối thiểu 8 ký tự).
        </p>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => void submitPasswordChange(event)}
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            Mật khẩu mới
            <input
              className="h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Xác nhận mật khẩu mới
            <input
              className="h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          {passwordMessage !== null ? (
            <p
              role={passwordMessage.type === "error" ? "alert" : "status"}
              className={`text-sm ${passwordMessage.type === "error" ? "text-chilli-700" : "text-herb-700"}`}
            >
              {passwordMessage.text}
            </p>
          ) : null}
          <Button
            type="submit"
            className="h-11 w-fit"
            disabled={newPassword.length < 8 || newPassword !== confirmPassword || passwordBusy}
          >
            {passwordBusy ? "Đang cập nhật…" : "Cập nhật mật khẩu"}
          </Button>
        </form>
      </section>

      <section className="flex max-w-2xl flex-col gap-3 rounded-2xl border border-chilli-200 bg-paper-raised p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-chilli-900">Xoá tài khoản</h2>
        <p>
          Xoá tài khoản sẽ xoá luôn thông tin gia đình, toàn bộ kế hoạch bữa ăn, tủ bếp và danh sách
          đi chợ của bạn.
        </p>
        <p className="font-medium">Thao tác này diễn ra ngay lập tức và không thể hoàn tác.</p>

        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nhập lại email của bạn để xác nhận
            <input
              className="h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
              name="confirmEmail"
              type="email"
              autoComplete="off"
              value={typedEmail}
              onChange={(event) => setTypedEmail(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Mật khẩu tài khoản để xác thực lại
            <input
              className="h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
              name="confirmDeletePassword"
              type="password"
              placeholder="Nhập mật khẩu tài khoản của bạn"
              autoComplete="current-password"
              value={typedPassword}
              onChange={(event) => setTypedPassword(event.target.value)}
            />
          </label>
          {failure === null ? null : (
            <p role="alert" className="text-sm text-chilli-700">
              {failureMessages[failure]}
            </p>
          )}
          <Button
            type="submit"
            variant="destructive"
            className="h-11"
            disabled={!confirmed || busy}
          >
            {busy ? "Đang xoá…" : "Xoá tài khoản của tôi"}
          </Button>
        </form>
      </section>

      <Link className="w-fit text-sm font-medium underline" to="/household">
        Quay lại trang gia đình
      </Link>
    </AppPageShell>
  )
}
