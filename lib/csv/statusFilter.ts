/**
 * Status filtering is isolated here because the real-world values coming
 * out of Launch27 exports are inconsistent (e.g. "not complete" is
 * actually a VALID/active status in this export, not a cancellation).
 *
 * Adjust these lists as real-world data reveals new status strings —
 * nothing else in the app should need to change.
 */

// Statuses that mean the booking should NOT participate in routing.
const EXCLUDED_STATUSES = new Set(
  [
    "cancelled",
    "canceled",
    "cancel",
    "declined",
    "skipped",
    "deleted",
    "void",
  ].map((s) => s.toLowerCase())
);

export function isBookingActive(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  if (normalized.length === 0) return true; // unknown/blank -> assume active
  return !EXCLUDED_STATUSES.has(normalized);
}
