import { Link } from "react-router"

import { LEGAL_LAST_UPDATED, PRIVACY_SECTIONS, TERMS_SECTIONS } from "./legal-content"

import type { LegalSection } from "./legal-content"

function Section({ section }: Readonly<{ section: LegalSection }>) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold text-ink">{section.heading}</h2>
      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph} className="text-ink-soft">
          {paragraph}
        </p>
      ))}
      {section.items === undefined ? null : (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-ink-soft">
          {section.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function LegalDocument({
  sections,
  title
}: Readonly<{ sections: readonly LegalSection[]; title: string }>) {
  return (
    <main className="mx-auto flex min-w-0 max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink-soft">Bếp Nhà</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        <p className="text-sm text-ink-soft">Cập nhật lần cuối: {LEGAL_LAST_UPDATED}</p>
      </div>
      {sections.map((section) => (
        <Section key={section.heading} section={section} />
      ))}
      <nav className="flex flex-wrap gap-4 border-t pt-4 text-sm">
        <Link className="font-medium underline" to="/privacy">
          Chính sách riêng tư
        </Link>
        <Link className="font-medium underline" to="/terms">
          Điều khoản sử dụng
        </Link>
        <Link className="font-medium underline" to="/sign-in">
          Đăng nhập
        </Link>
      </nav>
    </main>
  )
}

export function PrivacyPage() {
  return <LegalDocument title="Chính sách riêng tư" sections={PRIVACY_SECTIONS} />
}

export function TermsPage() {
  return <LegalDocument title="Điều khoản sử dụng" sections={TERMS_SECTIONS} />
}
