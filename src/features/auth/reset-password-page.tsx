import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"

import { useAuth } from "@/app/auth/auth-context"
import { Button } from "@/app/components/ui/button"

type Failure = "MISMATCH" | "RECOVERY_SESSION_REQUIRED" | "RETRYABLE_FAILURE" | "WEAK_PASSWORD"

const failureMessages: Record<Failure, string> = {
  MISMATCH: "Hai ô mật khẩu chưa khớp nhau.",
  RECOVERY_SESSION_REQUIRED:
    "Liên kết đặt lại đã hết hạn hoặc đã được dùng. Vui lòng yêu cầu một liên kết mới.",
  RETRYABLE_FAILURE: "Chưa đổi được mật khẩu. Vui lòng thử lại sau ít phút.",
  WEAK_PASSWORD: "Mật khẩu chưa đủ mạnh. Vui lòng chọn mật khẩu dài hơn."
}

/**
 * Reached from the emailed recovery link. The Supabase browser client turns that link into a
 * recovery session on load, so an authenticated status here means the link was valid. A signed-out
 * status means it expired, was already spent, or the page was opened directly.
 */
export function ResetPasswordPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const password = fields.get("password")
    const confirmation = fields.get("confirmPassword")
    if (typeof password !== "string" || password !== confirmation) {
      setFailure("MISMATCH")
      return
    }

    setBusy(true)
    setFailure(null)
    const result = await auth.updatePassword(password)
    setBusy(false)
    if (result.ok) {
      void navigate("/", { replace: true })
      return
    }
    setFailure(result.reason)
  }

  if (auth.status === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-8">
        <p role="status">Đang kiểm tra liên kết đặt lại…</p>
      </main>
    )
  }

  if (auth.status === "signed-out") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-8">
        <h1 className="text-2xl font-semibold">Liên kết không còn hiệu lực</h1>
        <p>
          Liên kết đặt lại mật khẩu đã hết hạn hoặc đã được dùng. Vui lòng yêu cầu một liên kết mới.
        </p>
        <Link className="font-medium underline" to="/forgot-password">
          Yêu cầu liên kết mới
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-8">
      <div>
        <p className="text-sm font-medium text-slate-600">Bếp Nhà</p>
        <h1 className="text-2xl font-semibold">Đặt mật khẩu mới</h1>
      </div>
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Mật khẩu mới
          <input
            className="h-11 rounded-lg border px-3"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nhập lại mật khẩu mới
          <input
            className="h-11 rounded-lg border px-3"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </label>
        {failure === null ? null : (
          <p role="alert" className="text-sm text-red-700">
            {failureMessages[failure]}
          </p>
        )}
        <Button className="h-11" type="submit" disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu mật khẩu mới"}
        </Button>
      </form>
    </main>
  )
}
