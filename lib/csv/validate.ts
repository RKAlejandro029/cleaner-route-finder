export const REQUIRED_COLUMNS = [
  "Date",
  "Time",
  "Address",
  "City",
  "State",
  "Postal Code",
  "Teams Assigned",
  "Duration",
  "Booking ID",
  "Booking Status",
] as const;

export type CsvValidationResult =
  | { valid: true }
  | { valid: false; message: string; missingColumns?: string[] };

/**
 * Checks that a parsed CSV header row contains every column the app
 * depends on. Kept isolated so the expected format can be adjusted
 * in one place later.
 */
export function validateHeaders(headers: string[]): CsvValidationResult {
  const normalized = headers.map((h) => h.trim());
  const missing = REQUIRED_COLUMNS.filter((col) => !normalized.includes(col));

  if (missing.length > 0) {
    return {
      valid: false,
      message: `The Launch27 export is missing required columns: ${missing.join(", ")}`,
      missingColumns: missing,
    };
  }

  return { valid: true };
}
