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
 * Reached from the emailed recovery link. Supabase emits PASSWORD_RECOVERY for a valid recovery
 * redirect; an ordinary authenticated session is not sufficient to expose the reset form.
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

  if (auth.status === "signed-out" || !auth.passwordRecoveryReady) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Liên kết không còn hiệu lực
        </h1>
        <p>
          Liên kết đặt lại mật khẩu đã hết hạn hoặc đã được dùng. Vui lòng yêu cầu một liên kết mới.
        </p>
        <Link
          className="font-bold text-herb-700 underline underline-offset-2 hover:text-herb-900"
          to="/forgot-password"
        >
          Yêu cầu liên kết mới
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-8">
      <div>
        <p className="flex items-center gap-2 text-sm font-extrabold text-herb-700">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-2xl bg-herb-100 text-lg"
          >
            🍚
          </span>
          Bếp Nhà
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Đặt mật khẩu mới</h1>
      </div>
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Mật khẩu mới
          <input
            className="h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nhập lại mật khẩu mới
          <input
            className="h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </label>
        {failure === null ? null : (
          <p role="alert" className="text-sm text-chilli-700">
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
