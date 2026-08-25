import { GeocodedBooking } from "@/types/booking";

/**
 * Decides the driving order of a team's bookings for a given day.
 *
 * The CSV does not always carry a trustworthy explicit order (this is
 * especially true for SMS Assist bookings). This module is intentionally
 * isolated so a smarter/derived strategy can be swapped in later without
 * touching the insertion algorithm or UI.
 */

export type OrderedResult = {
  bookings: GeocodedBooking[];
  source: "csv" | "derived";
};

/**
 * V1 strategy:
 *  - If every booking in the group has a parseable Time value, trust it
 *    and sort chronologically (this is the CSV's "reliable order").
 *  - Otherwise, fall back to a simple nearest-neighbor greedy ordering
 *    based on road-network-free straight-line distance as a cheap
 *    approximation, starting from the first geocoded booking. This is a
 *    reasonable placeholder; a full TSP/road-based solve can replace it
 *    later behind this same function signature.
 */
export function orderTeamBookings(bookings: GeocodedBooking[]): OrderedResult {
  if (bookings.length <= 1) {
    return { bookings, source: "csv" };
  }

  const allHaveTime = bookings.every((b) => !!b.time);

  if (allHaveTime) {
    const sorted = [...bookings].sort((a, b) =>
      parseTimeToMinutes(a.time!) - parseTimeToMinutes(b.time!)
    );
    return { bookings: sorted, source: "csv" };
  }

  // Derived: greedy nearest-neighbor
  const remaining = [...bookings];
  const ordered: GeocodedBooking[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    if (!last) break;
    let nearestIdx = 0;
    let nearestDist = Infinity;
    remaining.forEach((candidate, idx) => {
      const d = haversine(last.location, candidate.location);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = idx;
      }
    });
    const next = remaining.splice(nearestIdx, 1)[0];
    if (next) ordered.push(next);
  }

  return { bookings: ordered, source: "derived" };
}

function parseTimeToMinutes(time: string): number {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return 0;
  const hStr = match[1] ?? "0";
  const mStr = match[2] ?? "0";
  const ampm = match[3];
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (ampm) {
    const isPm = ampm.toLowerCase() === "pm";
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
  }
  return h * 60 + m;
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
