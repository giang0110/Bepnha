import { beforeEach, describe, expect, test } from "vitest"
import {
  clearPrepTasksForRevision,
  loadCompletedPrepTasks,
  setPrepTaskCompleted
} from "./daily-prep-store"

describe("daily-prep-store", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test("loads empty set when no tasks have been completed", () => {
    const tasks = loadCompletedPrepTasks(localStorage, "rev-1", 0)
    expect(tasks.size).toBe(0)
  })

  test("handles undefined storage gracefully", () => {
    expect(loadCompletedPrepTasks(undefined, "rev-1", 0).size).toBe(0)
    expect(setPrepTaskCompleted(undefined, "rev-1", 0, "task-1", true).size).toBe(0)
  })

  test("toggles and persists completed prep tasks per day and revision", () => {
    // 1. Mark task-1 as completed
    const updated1 = setPrepTaskCompleted(localStorage, "rev-1", 0, "task-1", true)
    expect(updated1.has("task-1")).toBe(true)

    // 2. Mark task-2 as completed
    const updated2 = setPrepTaskCompleted(localStorage, "rev-1", 0, "task-2", true)
    expect(updated2.has("task-1")).toBe(true)
    expect(updated2.has("task-2")).toBe(true)

    // 3. Unmark task-1
    const updated3 = setPrepTaskCompleted(localStorage, "rev-1", 0, "task-1", false)
    expect(updated3.has("task-1")).toBe(false)
    expect(updated3.has("task-2")).toBe(true)

    // 4. Reload from storage
    const reloaded = loadCompletedPrepTasks(localStorage, "rev-1", 0)
    expect(reloaded.has("task-2")).toBe(true)
    expect(reloaded.has("task-1")).toBe(false)
  })

  test("isolates state across different days and revisions", () => {
    setPrepTaskCompleted(localStorage, "rev-1", 0, "task-1", true)
    setPrepTaskCompleted(localStorage, "rev-1", 1, "task-2", true)
    setPrepTaskCompleted(localStorage, "rev-2", 0, "task-3", true)

    expect(loadCompletedPrepTasks(localStorage, "rev-1", 0).has("task-1")).toBe(true)
    expect(loadCompletedPrepTasks(localStorage, "rev-1", 0).has("task-2")).toBe(false)

    expect(loadCompletedPrepTasks(localStorage, "rev-1", 1).has("task-2")).toBe(true)
    expect(loadCompletedPrepTasks(localStorage, "rev-1", 1).has("task-1")).toBe(false)

    expect(loadCompletedPrepTasks(localStorage, "rev-2", 0).has("task-3")).toBe(true)
    expect(loadCompletedPrepTasks(localStorage, "rev-2", 0).has("task-1")).toBe(false)
  })

  test("clears completed prep tasks for a specific revision", () => {
    setPrepTaskCompleted(localStorage, "rev-1", 0, "task-1", true)
    setPrepTaskCompleted(localStorage, "rev-2", 0, "task-2", true)

    clearPrepTasksForRevision(localStorage, "rev-1")

    expect(loadCompletedPrepTasks(localStorage, "rev-1", 0).size).toBe(0)
    expect(loadCompletedPrepTasks(localStorage, "rev-2", 0).has("task-2")).toBe(true)
  })
})
