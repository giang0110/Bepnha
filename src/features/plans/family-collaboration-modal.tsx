import { useState } from "react"
import { Button } from "@/app/components/ui/button"
import { Icon } from "@/app/components/ui/icon"
import { toast } from "@/app/components/ui/toast"
import {
  formatFamilyMenuAnnouncement,
  generateFamilyMealCalendarIcs,
  type FamilyMealWish,
  type WeeklyAnnouncementItem
} from "@/domain/planner/family-meal-wishlist"
import {
  loadFamilyWishlist,
  saveFamilyWishlist,
  addWishToStore,
  removeWishFromStore
} from "./family-wishlist-store"

export interface FamilyCollaborationModalProps {
  readonly isOpen: boolean
  readonly householdId: string
  readonly householdName?: string
  readonly weekStart: string
  readonly planItems: readonly WeeklyAnnouncementItem[]
  readonly availableMealOptions: readonly { readonly id: string; readonly nameVi: string }[]
  readonly initialWishes?: readonly FamilyMealWish[]
  readonly onClose: () => void
}

export function FamilyCollaborationModal({
  isOpen,
  householdId,
  householdName,
  weekStart,
  planItems,
  availableMealOptions,
  initialWishes,
  onClose
}: Readonly<FamilyCollaborationModalProps>) {
  const [activeTab, setActiveTab] = useState<"wishes" | "share">("wishes")
  const [wishes, setWishes] = useState<readonly FamilyMealWish[]>(() => {
    if (typeof window !== "undefined") {
      const stored = loadFamilyWishlist(window.localStorage, householdId)
      if (stored.length > 0) return stored
      if (initialWishes !== undefined && initialWishes.length > 0) {
        saveFamilyWishlist(window.localStorage, householdId, initialWishes)
        return initialWishes
      }
    }
    return initialWishes ?? []
  })

  // Add wish form state
  const [selectedMealId, setSelectedMealId] = useState<string>(availableMealOptions[0]?.id ?? "")
  const [customMealName, setCustomMealName] = useState<string>("")
  const [memberName, setMemberName] = useState<string>("")
  const [note, setNote] = useState<string>("")
  const [copied, setCopied] = useState<boolean>(false)

  if (!isOpen) return null

  const announcementText = formatFamilyMenuAnnouncement({
    householdName,
    weekStart,
    items: planItems
  })

  const handleUpvote = (item: FamilyMealWish) => {
    if (typeof window === "undefined") return
    const updated = addWishToStore(window.localStorage, householdId, {
      mealOptionId: item.mealOptionId,
      mealOptionNameVi: item.mealOptionNameVi,
      requestedBy: "Thành viên gia đình"
    })
    setWishes(updated)
    toast.success("Đã ghi nhận bình chọn của bạn!")
  }

  const handleRemove = (mealOptionId: string) => {
    if (typeof window === "undefined") return
    const updated = removeWishFromStore(window.localStorage, householdId, mealOptionId)
    setWishes(updated)
    toast.info("Đã xoá món khỏi danh sách mong muốn")
  }

  const handleAddWish = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMealId || !memberName.trim()) return

    const isCustom = selectedMealId === "custom"
    const finalMealName = isCustom
      ? customMealName.trim()
      : availableMealOptions.find((o) => o.id === selectedMealId)?.nameVi
    if (!finalMealName) return

    const finalMealId = isCustom ? `custom-${Date.now()}` : selectedMealId

    if (typeof window !== "undefined") {
      const updated = addWishToStore(window.localStorage, householdId, {
        mealOptionId: finalMealId,
        mealOptionNameVi: finalMealName,
        requestedBy: memberName.trim(),
        note: note.trim() || undefined
      })
      setWishes(updated)
      toast.success("Đã thêm món vào danh sách mong muốn!")
    }

    setMemberName("")
    setCustomMealName("")
    setNote("")
  }

  const handleCopyAnnouncement = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(announcementText)
        setCopied(true)
        toast.success("Đã sao chép thông báo thực đơn tuần!")
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Fallback
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Thực đơn Bếp Nhà tuần này",
          text: announcementText
        })
        toast.success("Đã chia sẻ thực đơn tuần!")
      } catch {
        // User cancelled share
      }
    } else {
      await handleCopyAnnouncement()
    }
  }

  const handleDownloadIcs = () => {
    const icsContent = generateFamilyMealCalendarIcs({
      householdName,
      weekStart,
      items: planItems
    })

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `thuc-don-bep-nha-${weekStart}.ics`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success("Đã tải tệp lịch thực đơn tuần (.ics)!")
  }

  return (
    <div
      aria-label="Gia đình & Chia sẻ thực đơn"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs"
      role="dialog"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-3xl border border-edge bg-paper-raised p-6 shadow-lift">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-edge pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-herb-100 text-herb-700">
              <Icon name="users" className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-ink">Gia đình & Chia sẻ thực đơn</h2>
              <p className="text-xs text-ink-soft">
                Cùng nhau chọn món, gắn kết yêu thương qua từng bữa cơm
              </p>
            </div>
          </div>
          <Button
            aria-label="Đóng hộp thoại"
            className="size-8 p-0"
            size="sm"
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            ✕
          </Button>
        </div>

        {/* Tab switcher */}
        <div className="mt-4 flex gap-1 rounded-2xl border border-edge bg-paper p-1" role="tablist">
          <button
            aria-selected={activeTab === "wishes"}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition-colors ${
              activeTab === "wishes"
                ? "bg-paper-raised text-ink shadow-soft"
                : "text-ink-soft hover:text-ink"
            }`}
            role="tab"
            type="button"
            onClick={() => setActiveTab("wishes")}
          >
            Món cả nhà thèm ({wishes.length})
          </button>
          <button
            aria-selected={activeTab === "share"}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition-colors ${
              activeTab === "share"
                ? "bg-paper-raised text-ink shadow-soft"
                : "text-ink-soft hover:text-ink"
            }`}
            role="tab"
            type="button"
            onClick={() => setActiveTab("share")}
          >
            Gửi thực đơn cho cả nhà
          </button>
        </div>

        {/* Tab 1: Wishes */}
        {activeTab === "wishes" && (
          <div className="mt-4 flex flex-1 flex-col overflow-y-auto pr-1">
            {wishes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-edge bg-paper p-5 text-center text-xs text-ink-soft">
                <p>Chưa có món nào trong danh sách mong muốn tuần này.</p>
                <p className="mt-1">
                  Hãy thêm món các thành viên thèm để ưu tiên gợi ý khi đổi bữa!
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {wishes.map((item) => (
                  <li
                    className="flex items-center justify-between gap-3 rounded-2xl border border-edge bg-paper p-3.5"
                    key={item.mealOptionId}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink">{item.mealOptionNameVi}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-clay-100 px-2 py-0.5 text-[11px] font-bold text-clay-900">
                          <Icon name="heart" className="size-3 text-clay-600" />
                          {item.voteCount}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Đề xuất bởi: {item.requestedBy}
                      </p>
                      {item.note && (
                        <p className="mt-0.5 text-xs italic text-herb-800">
                          &ldquo;{item.note}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        aria-label={`Thả tim món ${item.mealOptionNameVi}`}
                        className="gap-1 px-2 py-1 text-xs"
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => handleUpvote(item)}
                      >
                        <Icon name="heart" className="size-3.5 text-clay-600" />
                        +1
                      </Button>
                      <Button
                        aria-label={`Xóa món ${item.mealOptionNameVi}`}
                        className="px-2 py-1 text-xs text-ink-soft hover:text-chilli-700"
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => handleRemove(item.mealOptionId)}
                      >
                        ✕
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Add Wish Form */}
            <form
              onSubmit={handleAddWish}
              className="mt-4 rounded-2xl border border-edge bg-paper-sunken p-4"
            >
              <h3 className="text-xs font-bold tracking-wide text-ink uppercase">
                + Thêm món người nhà muốn ăn
              </h3>
              <div className="mt-2.5 flex flex-col gap-2.5">
                <div>
                  <label htmlFor="wish-meal-select" className="text-xs font-medium text-ink-soft">
                    Chọn món muốn ăn
                  </label>
                  <select
                    id="wish-meal-select"
                    className="mt-1 w-full rounded-xl border border-edge bg-paper-raised px-3 py-2 text-xs font-semibold text-ink"
                    value={selectedMealId}
                    onChange={(e) => setSelectedMealId(e.target.value)}
                  >
                    {availableMealOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.nameVi}
                      </option>
                    ))}
                    <option value="custom">✏️ Nhập món khác ngoài danh sách...</option>
                  </select>
                </div>
                {selectedMealId === "custom" && (
                  <div>
                    <label
                      htmlFor="wish-custom-meal-input"
                      className="text-xs font-medium text-ink-soft"
                    >
                      Tên món muốn ăn
                    </label>
                    <input
                      id="wish-custom-meal-input"
                      type="text"
                      placeholder="Ví dụ: Sườn xào chua ngọt, Chả lá lốt..."
                      className="mt-1 w-full rounded-xl border border-edge bg-paper-raised px-3 py-2 text-xs text-ink placeholder:text-ink-soft/60"
                      value={customMealName}
                      onChange={(e) => setCustomMealName(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="wish-member-input" className="text-xs font-medium text-ink-soft">
                    Ai muốn ăn món này?
                  </label>
                  <input
                    id="wish-member-input"
                    type="text"
                    placeholder="Ví dụ: Bé Bắp, Mẹ, Bố"
                    className="mt-1 w-full rounded-xl border border-edge bg-paper-raised px-3 py-2 text-xs text-ink placeholder:text-ink-soft/60"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="wish-note-input" className="text-xs font-medium text-ink-soft">
                    Lời nhắn / Lý do (không bắt buộc)
                  </label>
                  <input
                    id="wish-note-input"
                    type="text"
                    placeholder="Ví dụ: Thèm lâu rồi, Cuối tuần ăn mừng..."
                    className="mt-1 w-full rounded-xl border border-edge bg-paper-raised px-3 py-2 text-xs text-ink placeholder:text-ink-soft/60"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <Button
                  className="mt-1 w-full justify-center gap-1.5"
                  size="sm"
                  type="submit"
                  disabled={
                    !memberName.trim() ||
                    (selectedMealId === "custom" ? !customMealName.trim() : !selectedMealId)
                  }
                >
                  <Icon name="heart" className="size-4" />
                  Thêm nguyện vọng
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 2: Share & Calendar */}
        {activeTab === "share" && (
          <div className="mt-4 flex flex-1 flex-col overflow-y-auto pr-1">
            <label htmlFor="family-announcement-preview" className="text-xs font-bold text-ink">
              Lời nhắn gửi nhóm Zalo / Tin nhắn gia đình:
            </label>
            <textarea
              id="family-announcement-preview"
              readOnly
              rows={8}
              className="mt-2 w-full rounded-2xl border border-edge bg-paper p-3 text-xs leading-relaxed text-ink select-all focus:outline-none"
              value={announcementText}
            />

            <div className="mt-4 flex flex-col gap-2">
              <Button
                className="w-full justify-center gap-2"
                type="button"
                onClick={() => void handleCopyAnnouncement()}
              >
                <Icon name="note" className="size-4" />
                {copied ? "Đã sao chép vào bộ nhớ tạm! 🎉" : "Sao chép tin nhắn Zalo"}
              </Button>

              {typeof navigator !== "undefined" && "share" in navigator && (
                <Button
                  className="w-full justify-center gap-2"
                  type="button"
                  variant="outline"
                  onClick={() => void handleShare()}
                >
                  <Icon name="speaker" className="size-4" />
                  Chia sẻ trực tiếp qua ứng dụng khác
                </Button>
              )}

              <Button
                className="w-full justify-center gap-2"
                type="button"
                variant="outline"
                onClick={handleDownloadIcs}
              >
                <Icon name="calendar" className="size-4 text-herb-700" />
                Xuất file Lịch (.ics) cho điện thoại
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-ink-soft">
              File .ics tương thích với Google Calendar, Apple Calendar, Outlook
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
