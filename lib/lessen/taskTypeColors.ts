// Colors for Lessen task-type pins. Deliberately distinct from the
// cleaner-route PALETTE (lib/route-analysis/colors.ts) so a Lessen pin
// is never mistaken for a scheduled cleaner stop. Also avoids yellow/
// orange (road colors) for the same reason routes do.
export const LESSEN_TASK_COLORS: Record<number, string> = {
  39: "#7c3aed", // Pending Vendor Acceptance — violet
  49: "#0891b2", // Pending Schedule — cyan
  45: "#dc2626", // Missed Check In — red
  46: "#be123c", // Missed Check Out — rose
  50: "#4f46e5", // Return Trip Needed — indigo
  95: "#0284c7", // Reschedule for Weather — sky
  92: "#374151", // Deferred — slate/gray
};

export function colorForTaskType(taskTypeId: number): string {
  return LESSEN_TASK_COLORS[taskTypeId] ?? "#374151";
}
