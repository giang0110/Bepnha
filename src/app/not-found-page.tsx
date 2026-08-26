import { Link } from "react-router"

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Không tìm thấy trang</h1>
      <p>Đường dẫn này không tồn tại.</p>
      <Link className="underline" to="/">
        Về trang chính
      </Link>
    </main>
  )
}
