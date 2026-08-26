import { useState } from "react"
import { useNavigate } from "react-router"

import { useAuth } from "@/app/auth/auth-context"
import { Button } from "@/app/components/ui/button"

export function SignOutButton() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function signOut() {
    setBusy(true)
    setFailed(false)
    const result = await auth.signOut()
    setBusy(false)
    if (result.ok) {
      void navigate("/sign-in", { replace: true })
    } else {
      setFailed(true)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void signOut()}>
        {busy ? "Đang đăng xuất…" : "Đăng xuất"}
      </Button>
      {failed ? <p role="alert">Không thể đăng xuất. Vui lòng thử lại.</p> : null}
    </div>
  )
}
