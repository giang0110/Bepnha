import { memo, useMemo, useState } from "react"
import { Icon } from "@/app/components/ui/icon"
import { Button } from "@/app/components/ui/button"
import type { PrepTask } from "@/domain/planner/meal-prep-defrost"
import { loadCompletedPrepTasks, setPrepTaskCompleted } from "./daily-prep-store"

export interface DailyPrepDefrostCardProps {
  readonly revisionId: string
  readonly dayIndex: number
  readonly dayLabelVi: string
  readonly mealOptionNameVi: string
  readonly tasks: readonly PrepTask[]
  readonly isEatOut?: boolean | undefined
  readonly onShareReminder?: (
    dayLabelVi: string,
    mealNameVi: string,
    tasks: readonly PrepTask[]
  ) => void | Promise<void>
}

export const DailyPrepDefrostCard = memo(function DailyPrepDefrostCard({
  revisionId,
  dayIndex,
  dayLabelVi,
  mealOptionNameVi,
  tasks,
  isEatOut,
  onShareReminder
}: DailyPrepDefrostCardProps) {
  const currentKey = `${revisionId}:${dayIndex}`

  const [completedOverride, setCompletedOverride] = useState<{
    key: string
    completed: ReadonlySet<string>
  } | null>(null)

  const completedTaskIds = useMemo(() => {
    if (completedOverride && completedOverride.key === currentKey) {
      return completedOverride.completed
    }
    return loadCompletedPrepTasks(
      typeof window !== "undefined" ? window.localStorage : undefined,
      revisionId,
      dayIndex
    )
  }, [revisionId, dayIndex, currentKey, completedOverride])

  if (isEatOut) {
    return (
      <section
        aria-label="Chuẩn bị và rã đông sớm"
        className="grid gap-3.5 rounded-3xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/40 dark:bg-amber-950/20 sm:p-6"
        data-testid="daily-prep-defrost-card"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
            <span className="text-lg">🍜</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">
              {dayLabelVi}: Gia đình ăn ngoài / nghỉ nấu
            </h3>
            <p className="text-xs text-ink-soft">
              Hôm nay không cần rã đông hoặc chuẩn bị nguyên liệu sớm từ sáng.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (tasks.length === 0) {
    return null
  }

  const handleToggleTask = (taskId: string, currentStatus: boolean) => {
    const updated = setPrepTaskCompleted(
      typeof window !== "undefined" ? window.localStorage : undefined,
      revisionId,
      dayIndex,
      taskId,
      !currentStatus
    )
    setCompletedOverride({ key: currentKey, completed: updated })
  }

  const completedCount = tasks.filter((t) => completedTaskIds.has(t.id)).length
  const allCompleted = completedCount === tasks.length

  return (
    <section
      aria-label="Chuẩn bị và rã đông sớm"
      className="grid gap-3.5 rounded-3xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-soft dark:border-amber-900/40 dark:bg-amber-950/20 sm:p-5"
      data-testid="daily-prep-defrost-card"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 pb-3 dark:border-amber-900/40">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
            <Icon name="sun" className="size-4.5 text-amber-700 dark:text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-ink">Chuẩn bị & Rã đông sớm ({dayLabelVi})</h3>
              {allCompleted && (
                <span className="rounded-full bg-herb-100 px-2 py-0.2 text-[10px] font-bold text-herb-800 dark:bg-herb-950 dark:text-herb-300">
                  Đã sẵn sàng 🎉
                </span>
              )}
            </div>
            <p className="text-xs text-ink-soft truncate max-w-xs sm:max-w-md">
              Bữa tối: {mealOptionNameVi}
            </p>
          </div>
        </div>

        {onShareReminder && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onShareReminder(dayLabelVi, mealOptionNameVi, tasks)}
            className="flex items-center gap-1.5 rounded-full border-amber-300 bg-paper-raised text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200"
            data-testid="share-prep-reminder-btn"
            title="Gửi lời nhắc rã đông và chuẩn bị cho người nhà qua Zalo / SMS"
          >
            <Icon name="share" className="size-3.5" />
            <span>Nhắc người nhà</span>
          </Button>
        )}
      </div>

      {/* Task Checklist */}
      <div className="grid gap-2">
        {tasks.map((task) => {
          const isDone = completedTaskIds.has(task.id)

          let iconEmoji = "📌"
          let badgeColor = "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"

          if (task.type === "defrost") {
            iconEmoji = "🧊"
            badgeColor = "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
          } else if (task.type === "rice") {
            iconEmoji = "🍚"
            badgeColor = "bg-herb-100 text-herb-800 dark:bg-herb-950/60 dark:text-herb-300"
          } else if (task.type === "soak") {
            iconEmoji = "🍄"
            badgeColor = "bg-clay-100 text-clay-800 dark:bg-clay-950/60 dark:text-clay-300"
          }

          return (
            <label
              key={task.id}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-2.5 transition-colors sm:p-3 ${
                isDone
                  ? "border-edge/50 bg-paper/40 opacity-70"
                  : "border-edge bg-paper hover:border-amber-400"
              }`}
            >
              <input
                type="checkbox"
                checked={isDone}
                onChange={() => handleToggleTask(task.id, isDone)}
                className="mt-1 size-4.5 rounded text-amber-600 focus:ring-amber-500"
                data-testid={`prep-task-checkbox-${task.id}`}
                aria-label={`Đánh dấu việc: ${task.titleVi}`}
              />

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-ink">
                    <span aria-hidden="true">{iconEmoji}</span>
                    <span className={isDone ? "line-through text-ink-muted" : "text-ink"}>
                      {task.titleVi}
                    </span>
                  </div>

                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeColor}`}
                  >
                    {task.timingHintVi}
                  </span>
                </div>

                <p
                  className={`mt-1 text-xs leading-relaxed ${
                    isDone ? "line-through text-ink-muted" : "text-ink-soft"
                  }`}
                >
                  {task.detailVi}
                </p>
              </div>
            </label>
          )
        })}
      </div>

      {/* Progress Footer */}
      <div className="flex items-center justify-between text-xs text-ink-soft pt-1">
        <span>Tiến độ chuẩn bị:</span>
        <span className="font-bold text-ink">
          {completedCount}/{tasks.length} đầu việc đã xong
        </span>
      </div>
    </section>
  )
})
