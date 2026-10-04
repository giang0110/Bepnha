import { Link } from "react-router"

import { AppPageShell } from "@/app/components/app-page-shell"
import { PageHeader } from "@/app/components/page-header"
import { Icon } from "@/app/components/ui/icon"

const sections = [
  {
    to: "/settings/household",
    icon: "users",
    title: "Chỉnh sửa thông tin gia đình",
    description: "Thành viên, ngân sách, thời gian nấu và các quy tắc ăn uống."
  },
  {
    to: "/settings/account",
    icon: "shield",
    title: "Tài khoản và bảo mật",
    description: "Email đăng nhập, mật khẩu và quyền kiểm soát dữ liệu tài khoản."
  }
] as const

export function SettingsPage() {
  return (
    <AppPageShell className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Cài đặt"
        description="Quản lý thông tin dùng để lập kế hoạch và bảo vệ tài khoản tại một nơi."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            aria-label={section.title}
            className="group rounded-3xl border border-edge bg-paper-raised p-5 transition-colors hover:border-herb-200 hover:bg-herb-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-600 focus-visible:ring-offset-2 sm:p-6"
            key={section.to}
            to={section.to}
          >
            <span
              className="mb-5 grid size-11 place-items-center rounded-2xl bg-herb-50 text-herb-700"
              aria-hidden="true"
            >
              <Icon name={section.icon} className="size-5" />
            </span>
            <h2 className="text-lg font-bold text-ink group-hover:text-herb-700">
              {section.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{section.description}</p>
            <span
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-herb-700"
              aria-hidden="true"
            >
              Mở cài đặt <Icon name="arrowRight" />
            </span>
          </Link>
        ))}
      </div>
    </AppPageShell>
  )
}
