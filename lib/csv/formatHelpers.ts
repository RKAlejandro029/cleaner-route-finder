/** Converts "08/26/2026" -> "2026-08-26". Returns null if unparseable. */
export function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const mm = match[1] ?? "01";
    const dd = match[2] ?? "01";
    const yyyy = match[3] ?? "1970";
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return null;
}

/** Formats "2026-09-03" -> "September 3, 2026" for display */
export function formatDateForDisplay(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Converts "3:15:00" (H:MM:SS) -> minutes. Returns undefined if unparseable. */
export function parseDurationToMinutes(raw?: string): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const parts = trimmed.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return undefined;

  if (parts.length === 3) {
    const h = parts[0] ?? 0;
    const m = parts[1] ?? 0;
    const s = parts[2] ?? 0;
    return h * 60 + m + Math.round(s / 60);
  }
  if (parts.length === 2) {
    const h = parts[0] ?? 0;
    const m = parts[1] ?? 0;
    return h * 60 + m;
  }
  return undefined;
}
