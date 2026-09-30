import { useState, type FormEvent } from "react"

import { Button } from "@/app/components/ui/button"

import {
  addManualShoppingExtra,
  loadManualShoppingExtras,
  removeManualShoppingExtra,
  toggleManualShoppingExtra
} from "./manual-shopping-extras"

export function ManualShoppingExtrasSection({ revisionId }: Readonly<{ revisionId: string }>) {
  const [extras, setExtras] = useState(() =>
    loadManualShoppingExtras(window.localStorage, revisionId)
  )
  const [label, setLabel] = useState("")

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!addManualShoppingExtra(window.localStorage, revisionId, label)) return
    setExtras(loadManualShoppingExtras(window.localStorage, revisionId))
    setLabel("")
  }

  return (
    <section
      className="grid gap-3 rounded-2xl border border-dashed border-edge-strong p-4"
      data-print="hide"
    >
      <div>
        <h2 className="font-semibold text-ink">Mua thêm</h2>
        <p className="text-sm text-ink-soft">
          Chỉ lưu trên thiết bị này, không tính vào ngân sách hay số lượng của kế hoạch.
        </p>
      </div>
      <form className="flex gap-2" onSubmit={submit}>
        <label className="sr-only" htmlFor="manual-shopping-extra">
          Món mua thêm
        </label>
        <input
          className="min-h-11 min-w-0 flex-1 rounded-full border border-edge-strong bg-paper-raised px-4 text-ink"
          id="manual-shopping-extra"
          maxLength={80}
          placeholder="Ví dụ: túi rác"
          value={label}
          onChange={(event) => setLabel(event.currentTarget.value)}
        />
        <Button type="submit">Thêm món mua riêng</Button>
      </form>
      {extras.length === 0 ? null : (
        <ul className="grid gap-2">
          {extras.map((extra) => (
            <li className="flex min-h-11 items-center gap-3" key={extra.id}>
              <input
                aria-label={extra.label}
                checked={extra.checked}
                className="size-5 accent-herb-600"
                type="checkbox"
                onChange={(event) => {
                  toggleManualShoppingExtra(
                    window.localStorage,
                    revisionId,
                    extra.id,
                    event.currentTarget.checked
                  )
                  setExtras(loadManualShoppingExtras(window.localStorage, revisionId))
                }}
              />
              <span className={extra.checked ? "flex-1 line-through opacity-60" : "flex-1"}>
                {extra.label}
              </span>
              <Button
                aria-label={`Xóa ${extra.label}`}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => {
                  removeManualShoppingExtra(window.localStorage, revisionId, extra.id)
                  setExtras(loadManualShoppingExtras(window.localStorage, revisionId))
                }}
              >
                Xóa
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
