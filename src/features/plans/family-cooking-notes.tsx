import { useCallback, useState } from "react"

import { Button } from "@/app/components/ui/button"
import { Icon } from "@/app/components/ui/icon"
import { toast } from "@/app/components/ui/toast"

import { clearCookingNote, loadCookingNote, saveCookingNote } from "./cooking-notes-store"

export interface FamilyCookingNotesProps {
  readonly mealOptionId: string
  readonly mealOptionNameVi?: string | undefined
  readonly className?: string | undefined
  readonly onNoteChange?: ((note: string | null) => void) | undefined
}

export function FamilyCookingNotes({
  mealOptionId,
  mealOptionNameVi,
  className = "",
  onNoteChange
}: Readonly<FamilyCookingNotesProps>) {
  const [cookingNote, setCookingNote] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    return loadCookingNote(window.localStorage, mealOptionId) ?? ""
  })
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState("")
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false)

  const handleStartEdit = useCallback(() => {
    setNoteDraft(cookingNote)
    setIsEditingNote(true)
  }, [cookingNote])

  const handleSaveNote = useCallback(() => {
    if (typeof window === "undefined") return
    const trimmed = noteDraft.trim()
    saveCookingNote(window.localStorage, mealOptionId, trimmed)
    setCookingNote(trimmed)
    setIsEditingNote(false)
    setNoteSavedFeedback(true)
    toast.success("Đã lưu ghi chú món ăn!")
    onNoteChange?.(trimmed.length > 0 ? trimmed : null)
    setTimeout(() => setNoteSavedFeedback(false), 2500)
  }, [mealOptionId, noteDraft, onNoteChange])

  const handleClearNote = useCallback(() => {
    if (typeof window === "undefined") return
    clearCookingNote(window.localStorage, mealOptionId)
    setCookingNote("")
    setNoteDraft("")
    setIsEditingNote(false)
    toast.info("Đã xóa ghi chú món ăn.")
    onNoteChange?.(null)
  }, [mealOptionId, onNoteChange])

  return (
    <div
      className={`rounded-2xl border border-edge bg-paper-raised p-4 shadow-soft transition-colors ${className}`}
      data-testid={`family-cooking-notes-${mealOptionId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="note" className="size-4 text-herb-700" />
          <h3 className="text-sm font-bold text-ink">
            Mẹo & Ghi chú của gia đình
            {mealOptionNameVi ? (
              <span className="font-normal text-ink-soft"> · {mealOptionNameVi}</span>
            ) : null}
          </h3>
        </div>
        {!isEditingNote && (
          <button
            type="button"
            onClick={handleStartEdit}
            data-testid="edit-cooking-note-btn"
            className="text-xs font-semibold text-herb-700 hover:underline"
          >
            {cookingNote ? "Sửa ghi chú" : "+ Thêm ghi chú"}
          </button>
        )}
      </div>

      {isEditingNote ? (
        <div className="mt-2.5 grid gap-2">
          <textarea
            aria-label="Nội dung ghi chú món ăn"
            className="w-full rounded-xl border border-edge bg-paper p-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-herb-500 focus:outline-none"
            rows={3}
            placeholder="Ví dụ: Giảm 1 thìa đường, chiên giòn hơn cho bé, ướp tiêu 15 phút trước khi nấu..."
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            data-testid="cooking-note-textarea"
          />
          <div className="flex items-center justify-between gap-2">
            <div>
              {cookingNote ? (
                <button
                  type="button"
                  onClick={handleClearNote}
                  className="text-xs font-medium text-chilli-700 hover:underline"
                  data-testid="clear-cooking-note-btn"
                >
                  Xóa ghi chú
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setIsEditingNote(false)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveNote}
                data-testid="save-cooking-note-btn"
              >
                Lưu ghi chú
              </Button>
            </div>
          </div>
        </div>
      ) : cookingNote ? (
        <div className="mt-2 rounded-xl bg-paper-sunken/60 p-3">
          <p
            className="text-sm whitespace-pre-wrap text-ink font-medium leading-relaxed"
            data-testid="cooking-note-display"
          >
            {cookingNote}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">
          Chưa có ghi chú khẩu vị cho món này. Thêm mẹo để nhớ cho những lần nấu sau!
        </p>
      )}

      {noteSavedFeedback && (
        <p className="mt-1.5 text-xs font-bold text-herb-700" role="status">
          ✓ Đã lưu ghi chú cho món này
        </p>
      )}
    </div>
  )
}
