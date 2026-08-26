import { Booking } from "@/types/booking";
import { Launch27StaffBooking } from "./types";

/**
 * Converts a UTC ISO datetime into a YYYY-MM-DD date string IN THE GIVEN
 * TENANT TIMEZONE. This matters: Launch27 returns service_date in UTC
 * (e.g. "2026-09-10T00:00:00Z"), which can land on the PREVIOUS calendar
 * day once converted to a US timezone (e.g. Arizona is UTC-7 with no
 * DST, so midnight UTC is 5pm the day before). Naively slicing the ISO
 * string's date portion would misfile bookings onto the wrong day.
 */
function toLocalDateString(isoUtc: string, timeZone: string): string {
  // en-CA locale formats as YYYY-MM-DD directly
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoUtc));
}

/** Formats as "8:00 AM" — matches the format parseTimeToMinutes already understands */
function toLocalTimeString(isoUtc: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(isoUtc));
}

function parseTeams(teams: Launch27StaffBooking["teams"]): {
  teamKey: string;
  teamLabel: string;
} {
  if (!teams || teams.length === 0) {
    return { teamKey: "unassigned", teamLabel: "Unassigned" };
  }

  const teamKey = teams
    .map((t) => String(t.id))
    .sort()
    .join("+");
  const teamLabel = teams.map((t) => t.title).join(" & ");

  return { teamKey, teamLabel };
}

/**
 * Maps one raw Launch27 staff booking into the app's Booking type.
 * Returns null for bookings that shouldn't participate in routing at all
 * (missing address, or no coordinates) — the caller filters these out.
 */
export function mapLaunch27Booking(
  raw: Launch27StaffBooking,
  timeZone: string
): Booking | null {
  if (!raw.address || !raw.address.street) return null;
  if (
    typeof raw.address.latitude !== "number" ||
    typeof raw.address.longitude !== "number"
  ) {
    return null;
  }

  const { teamKey, teamLabel } = parseTeams(raw.teams);

  return {
    bookingId: String(raw.id),
    date: toLocalDateString(raw.service_date, timeZone),
    time: toLocalTimeString(raw.service_date, timeZone),
    address: raw.address.street,
    city: raw.address.city,
    state: raw.address.state,
    postalCode: raw.address.zip,
    teamsAssignedRaw: (raw.teams ?? []).map((t) => `${t.id}: ${t.title}`).join(", "),
    teamKey,
    teamLabel,
    duration: raw.duration,
    status: raw.booking_status,
    fullAddress: raw.address.full_address,
    presetLocation: { lat: raw.address.latitude, lng: raw.address.longitude },
  };
}
