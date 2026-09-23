import { useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router"

import { Button } from "@/app/components/ui/button"
import { useAuth } from "@/app/auth/auth-context"
import { Icon } from "@/app/components/ui/icon"

function redirectFromState(state: unknown): string {
  if (
    typeof state === "object" &&
    state !== null &&
    "from" in state &&
    typeof state.from === "string" &&
    state.from.startsWith("/") &&
    !state.from.startsWith("//")
  ) {
    return state.from
  }
  return "/"
}

export function SignInPage() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setFailed(false)
    const fields = new FormData(event.currentTarget)
    const email = fields.get("email")
    const password = fields.get("password")
    const result = await auth.signIn(
      typeof email === "string" ? email : "",
      typeof password === "string" ? password : ""
    )
    setBusy(false)
    if (result.ok && result.session !== null) {
      void navigate(redirectFromState(location.state), { replace: true })
    } else {
      setFailed(true)
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
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Đăng nhập</h1>
      </div>
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
            autoComplete="current-password"
            required
          />
        </label>
        {failed ? (
          <p role="alert" className="text-sm text-chilli-700">
            Không thể đăng nhập. Vui lòng kiểm tra thông tin và thử lại.
          </p>
        ) : null}
        <Button className="h-11" type="submit" disabled={busy}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>
      <p className="text-sm">
        <Link
          className="font-bold text-herb-700 underline underline-offset-2 hover:text-herb-900"
          to="/forgot-password"
        >
          Quên mật khẩu?
        </Link>
      </p>
      <p className="text-sm">
        Chưa có tài khoản?{" "}
        <Link
          className="font-bold text-herb-700 underline underline-offset-2 hover:text-herb-900"
          to="/sign-up"
        >
          Tạo tài khoản
        </Link>
      </p>
      <p className="flex flex-wrap gap-4 text-sm">
        <Link
          className="text-ink-soft underline underline-offset-2 hover:text-herb-700"
          to="/privacy"
        >
          Chính sách riêng tư
        </Link>
        <Link
          className="text-ink-soft underline underline-offset-2 hover:text-herb-700"
          to="/terms"
        >
          Điều khoản sử dụng
        </Link>
      </p>
    </main>
  )
}
