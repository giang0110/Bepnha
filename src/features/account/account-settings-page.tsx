import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"

import type { AccountApi, DeleteAccountFailure } from "@/application/account/account-deletion"
import { useAuth } from "@/app/auth/auth-context"
import { Button } from "@/app/components/ui/button"
import { AppPageShell } from "@/app/components/app-page-shell"

const failureMessages: Record<DeleteAccountFailure, string> = {
  ACCOUNT_DELETE_UNAVAILABLE: "Chưa xoá được tài khoản. Vui lòng thử lại sau ít phút.",
  ACCOUNT_RETAINED_FOR_CATALOG_AUTHORSHIP:
    "Tài khoản này đã tạo dữ liệu thực phẩm dùng chung nên không thể tự xoá, vì việc đó sẽ làm mất nguồn gốc của dữ liệu đó. Vui lòng liên hệ người vận hành.",
  UNAUTHORIZED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử lại."
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
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<DeleteAccountFailure | null>(null)

  const email = auth.session?.identity.email ?? null
  const confirmed = email !== null && typedEmail.trim() === email

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!confirmed || auth.session === null) return

    setBusy(true)
    setFailure(null)
    const result = await accountApi.deleteOwnAccount(auth.session.accessToken)
    if (result.ok) {
      // The account is gone; clearing the local session is what turns that into a signed-out app.
      await auth.signOut()
      void navigate("/sign-in", { replace: true })
      return
    }
    setBusy(false)
    setFailure(result.reason)
  }

  return (
    <AppPageShell className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-herb-700">Cài đặt</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Tài khoản</h1>
        {email === null ? null : <p className="text-sm text-ink-soft">{email}</p>}
      </header>

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
