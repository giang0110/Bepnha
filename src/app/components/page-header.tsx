import type { ReactNode } from "react"
import { Icon } from "./ui/icon"

export function PageHeader({
  title,
  description,
  children
}: Readonly<{ title: string; description: string; children?: ReactNode }>) {
  return (
    <header className="grid gap-3 border-b border-edge/70 pb-5 sm:pb-6">
      <p className="flex items-center gap-2 text-xs font-extrabold tracking-wide text-herb-700">
        <Icon name="bowl" className="size-4" />
        Bếp Nhà
      </p>
      <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
        {title}
      </h1>
      <p className="max-w-2xl text-sm leading-6 text-ink-soft">{description}</p>
      {children}
    </header>
  )
}
