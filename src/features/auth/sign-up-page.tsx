import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"

import { useAuth } from "@/app/auth/auth-context"
import { Button } from "@/app/components/ui/button"

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
        <p className="text-sm font-medium text-slate-600">Bếp Nhà</p>
        <h1 className="text-2xl font-semibold">Tạo tài khoản</h1>
      </div>
      {confirmationPending ? (
        <p role="status">Kiểm tra email để xác nhận tài khoản, sau đó quay lại đăng nhập.</p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email
            <input
              className="h-11 rounded-lg border px-3"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Mật khẩu
            <input
              className="h-11 rounded-lg border px-3"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {failed ? (
            <p role="alert" className="text-sm text-red-700">
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
        <Link className="font-medium underline" to="/sign-in">
          Đăng nhập
        </Link>
      </p>
    </main>
  )
}
