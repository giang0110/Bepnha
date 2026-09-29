import { Link } from "react-router"

import { AppPageShell } from "@/app/components/app-page-shell"

const sections = [
  {
    to: "/settings/household",
    title: "Chỉnh sửa thông tin gia đình",
    description: "Thành viên, ngân sách, thời gian nấu và các quy tắc ăn uống."
  },
  {
    to: "/settings/account",
    title: "Tài khoản và bảo mật",
    description: "Email đăng nhập, mật khẩu và quyền kiểm soát dữ liệu tài khoản."
  }
] as const

export function SettingsPage() {
  return (
    <AppPageShell className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-herb-700">Bếp Nhà của bạn</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Cài đặt</h1>
        <p className="max-w-2xl text-sm leading-6 text-ink-soft">
          Quản lý thông tin dùng để lập kế hoạch và bảo vệ tài khoản tại một nơi.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            aria-label={section.title}
            className="group rounded-3xl border border-edge bg-paper-raised p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-herb-300 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-600 focus-visible:ring-offset-2"
            key={section.to}
            to={section.to}
          >
            <h2 className="font-bold text-ink group-hover:text-herb-800">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{section.description}</p>
            <span
              className="mt-4 inline-flex text-sm font-semibold text-herb-700"
              aria-hidden="true"
            >
              Mở cài đặt →
            </span>
          </Link>
        ))}
      </div>
    </AppPageShell>
  )
}
