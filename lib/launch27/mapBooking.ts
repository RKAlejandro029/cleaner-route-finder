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

/**
 * Maps one raw Launch27 staff booking into ONE Booking entry PER
 * INDIVIDUAL CLEANER assigned to it — not one combined "team" entry.
 *
 * Why: when a job has two people assigned (e.g. "Gabriel Baldonado &
 * Payton Limon"), both of them physically go to that address. Each
 * cleaner needs their own separate route, and this stop belongs on BOTH
 * of their individual route lists — so a 2-person job produces 2 Booking
 * entries here (same address/location/bookingId, different teamKey),
 * which downstream grouping (by teamKey) then naturally separates into
 * two individual routes.
 *
 * Returns an empty array for bookings that shouldn't participate in
 * routing at all (missing address, no coordinates, or no one assigned).
 */
export function mapLaunch27Booking(
  raw: Launch27StaffBooking,
  timeZone: string
): Booking[] {
  if (!raw.address || !raw.address.street) return [];
  if (
    typeof raw.address.latitude !== "number" ||
    typeof raw.address.longitude !== "number"
  ) {
    return [];
  }

  const members = raw.teams && raw.teams.length > 0 ? raw.teams : null;
  if (!members) return []; // unassigned jobs have no individual cleaner to route

  const teamsAssignedRaw = members.map((t) => `${t.id}: ${t.title}`).join(", ");

  return members.map((member) => ({
    bookingId: String(raw.id),
    date: toLocalDateString(raw.service_date, timeZone),
    time: toLocalTimeString(raw.service_date, timeZone),
    address: raw.address!.street,
    city: raw.address!.city,
    state: raw.address!.state,
    postalCode: raw.address!.zip,
    teamsAssignedRaw,
    teamKey: String(member.id),
    teamLabel: member.title,
    duration: raw.duration,
    status: raw.booking_status,
    fullAddress: raw.address!.full_address,
    presetLocation: { lat: raw.address!.latitude, lng: raw.address!.longitude },
  }));
}
