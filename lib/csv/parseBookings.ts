import Papa from "papaparse";
import { Booking } from "@/types/booking";
import { validateHeaders } from "./validate";
import { parseTeamsAssigned } from "./parseTeams";
import { normalizeDate, parseDurationToMinutes } from "./formatHelpers";

export type ParseBookingsResult =
  | { success: true; bookings: Booking[] }
  | { success: false; message: string };

/**
 * Parses a raw Launch27 CSV export (as text) into normalized Booking
 * records. This is intentionally the ONLY place that touches raw CSV
 * column names — everything downstream uses the normalized Booking type.
 */
export function parseBookingsCsv(csvText: string): ParseBookingsResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return {
      success: false,
      message: "This file doesn't appear to be a valid Launch27 export.",
    };
  }

  const headers = parsed.meta.fields ?? [];
  const headerCheck = validateHeaders(headers);
  if (!headerCheck.valid) {
    return { success: false, message: headerCheck.message };
  }

  const bookings: Booking[] = [];

  for (const row of parsed.data) {
    const rawDate = row["Date"] ?? "";
    const normalizedDate = normalizeDate(rawDate);
    const address = (row["Address"] ?? "").trim();
    const city = (row["City"] ?? "").trim();
    const state = (row["State"] ?? "").trim();
    const postalCode = (row["Postal Code"] ?? "").trim();
    const bookingId = (row["Booking ID"] ?? "").trim();

    // Skip rows that are unusable rather than failing the whole import
    if (!normalizedDate || !address || !bookingId) continue;

    const teamsRaw = row["Teams Assigned"] ?? "";
    const { teamKey, teamLabel } = parseTeamsAssigned(teamsRaw);

    bookings.push({
      bookingId,
      date: normalizedDate,
      time: (row["Time"] ?? "").trim() || undefined,
      address,
      city,
      state,
      postalCode,
      teamsAssignedRaw: teamsRaw,
      teamKey,
      teamLabel,
      duration: parseDurationToMinutes(row["Duration"]),
      status: (row["Booking Status"] ?? "").trim(),
      fullAddress: [address, city, state, postalCode]
        .filter(Boolean)
        .join(", "),
    });
  }

  if (bookings.length === 0) {
    return {
      success: false,
      message: "No usable bookings were found in this file.",
    };
  }

  return { success: true, bookings };
}
