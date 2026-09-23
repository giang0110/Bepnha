import { useState, type FormEvent } from "react"
import { Link } from "react-router"

import { useAuth } from "@/app/auth/auth-context"
import { Button } from "@/app/components/ui/button"

export const RESET_PASSWORD_PATH = "/reset-password"

/**
 * The confirmation copy is identical whether or not the address has an account. Saying "no account
 * found" here would let an anonymous visitor test which emails are registered, and household data
 * is exactly what that leak would help someone target.
 */
export function ForgotPasswordPage() {
  const auth = useAuth()
  const [busy, setBusy] = useState(false)
  const [requested, setRequested] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setFailed(false)
    const email = new FormData(event.currentTarget).get("email")
    const result = await auth.requestPasswordReset(
      typeof email === "string" ? email : "",
      `${window.location.origin}${RESET_PASSWORD_PATH}`
    )
    setBusy(false)
    if (result.ok) {
      setRequested(true)
    } else {
      setFailed(true)
    }
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
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Quên mật khẩu</h1>
      </div>

      {requested ? (
        <>
          <p role="status">
            Nếu địa chỉ này có tài khoản Bếp Nhà, chúng tôi đã gửi một liên kết đặt lại mật khẩu.
            Vui lòng kiểm tra hộp thư, kể cả mục thư rác.
          </p>
          <p className="text-sm text-ink-soft">
            Liên kết chỉ dùng được một lần và sẽ hết hạn. Nếu không nhận được thư, bạn có thể yêu
            cầu lại.
          </p>
          <Button
            className="h-11"
            type="button"
            variant="outline"
            onClick={() => setRequested(false)}
          >
            Gửi lại
          </Button>
        </>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <p className="text-sm text-ink-soft">
            Nhập email bạn dùng để đăng nhập. Chúng tôi sẽ gửi liên kết đặt lại mật khẩu.
          </p>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email
            <input
              className="h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          {failed ? (
            <p role="alert" className="text-sm text-chilli-700">
              Chưa gửi được yêu cầu. Vui lòng thử lại sau ít phút.
            </p>
          ) : null}
          <Button className="h-11" type="submit" disabled={busy}>
            {busy ? "Đang gửi…" : "Gửi liên kết đặt lại"}
          </Button>
        </form>
      )}

      <p className="text-sm">
        <Link
          className="font-bold text-herb-700 underline underline-offset-2 hover:text-herb-900"
          to="/sign-in"
        >
          Quay lại đăng nhập
        </Link>
      </p>
    </main>
  )
}
