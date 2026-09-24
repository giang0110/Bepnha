import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"

import { useAuth } from "@/app/auth/auth-context"
import { Button } from "@/app/components/ui/button"
import { Icon } from "@/app/components/ui/icon"

export function SignUpPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [confirmationPending, setConfirmationPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setFailed(false)
    const fields = new FormData(event.currentTarget)
    const email = fields.get("email")
    const password = fields.get("password")
    const result = await auth.signUp(
      typeof email === "string" ? email : "",
      typeof password === "string" ? password : ""
    )
    setBusy(false)
    if (!result.ok) {
      setFailed(true)
    } else if (result.confirmationPending === true) {
      setConfirmationPending(true)
    } else if (result.session !== null) {
      void navigate("/onboarding", { replace: true })
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-8">
      <div>
        <p className="flex items-center gap-2 text-sm font-extrabold text-herb-700">
          <span className="grid size-9 place-items-center rounded-2xl bg-herb-100 text-herb-700">
            <Icon name="bowl" className="size-5" />
          </span>
          Bếp Nhà
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Tạo tài khoản</h1>
      </div>
      {confirmationPending ? (
        <p role="status">Kiểm tra email để xác nhận tài khoản, sau đó quay lại đăng nhập.</p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
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
          <label className="flex flex-col gap-1 text-sm font-medium">
            Mật khẩu
            <input
              className="h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {failed ? (
            <p role="alert" className="text-sm text-chilli-700">
              Không thể tạo tài khoản. Vui lòng thử lại.
            </p>
          ) : null}
          <Button className="h-11" type="submit" disabled={busy}>
            {busy ? "Đang tạo…" : "Tạo tài khoản"}
          </Button>
        </form>
      )}
      <p className="text-sm">
        Đã có tài khoản?{" "}
        <Link
          className="font-bold text-herb-700 underline underline-offset-2 hover:text-herb-900"
          to="/sign-in"
        >
          Đăng nhập
        </Link>
      </p>
      <p className="flex flex-wrap gap-4 text-sm">
        <Link
          className="inline-flex min-h-11 items-center text-ink-soft underline underline-offset-2 hover:text-herb-700"
          to="/privacy"
        >
          Chính sách riêng tư
        </Link>
        <Link
          className="inline-flex min-h-11 items-center text-ink-soft underline underline-offset-2 hover:text-herb-700"
          to="/terms"
        >
          Điều khoản sử dụng
        </Link>
      </p>
    </main>
  )
}
