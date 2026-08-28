"use client";

import { useEffect, useState } from "react";
import { LessenTask } from "@/types/lessen";
import { colorForTaskType } from "@/lib/lessen/taskTypeColors";

const TASK_TYPE_ORDER = [39, 49, 45, 46, 50, 95, 92];
const TASK_TYPE_FALLBACK_LABELS: Record<number, string> = {
  39: "Pending Vendor Acceptance",
  49: "Pending Schedule",
  45: "Missed Check In",
  46: "Missed Check Out",
  50: "Return Trip Needed",
  95: "Reschedule for Weather",
  92: "Deferred",
};

type Props = {
  onVisibleTasksChange: (tasks: LessenTask[]) => void;
};

export default function LessenLayer({ onVisibleTasksChange }: Props) {
  const [tasks, setTasks] = useState<LessenTask[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  async function loadTasks() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lessen/tasks");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to load Lessen tasks.");
      }
      const data = await res.json();
      setTasks(data.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Lessen tasks.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(taskTypeId: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(taskTypeId)) next.delete(taskTypeId);
      else next.add(taskTypeId);
      return next;
    });

    // Lazy-load on first checkbox interaction rather than on mount, so
    // opening the app doesn't automatically spend a Lessen API call.
    if (!tasks && !loading) loadTasks();
  }

  useEffect(() => {
    if (!tasks) {
      onVisibleTasksChange([]);
      return;
    }
    onVisibleTasksChange(tasks.filter((t) => checked.has(t.taskTypeId) && t.location));
  }, [tasks, checked, onVisibleTasksChange]);

  const counts = new Map<number, number>();
  (tasks ?? []).forEach((t) => counts.set(t.taskTypeId, (counts.get(t.taskTypeId) ?? 0) + 1));

  return (
    <div>
      <ul className="space-y-1">
        {TASK_TYPE_ORDER.map((id) => (
          <li key={id}>
            <label className="flex items-center gap-2 px-1 py-1.5 min-h-[36px] cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={checked.has(id)}
                onChange={() => toggle(id)}
                className="w-4 h-4 flex-shrink-0"
              />
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ background: colorForTaskType(id) }}
              />
              <span className="flex-1 truncate">{TASK_TYPE_FALLBACK_LABELS[id]}</span>
              {tasks && (
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {counts.get(id) ?? 0}
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>

      {loading && <p className="text-xs text-gray-400 mt-1">Loading Lessen tasks…</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {tasks && (
        <p className="text-xs text-gray-400 mt-1">
          Click a pin on the map to search that address.
        </p>
      )}
    </div>
  );
}
