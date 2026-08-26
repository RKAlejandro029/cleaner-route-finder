import { Booking } from "@/types/booking";

/**
 * Produces a stable string fingerprint for one team's ordered bookings on
 * a given day. If a booking is added, removed, reassigned to a different
 * team, or reordered, this string changes — which is exactly the signal
 * the cache uses to know it must re-route instead of reusing a stale
 * result. Deliberately simple (just booking IDs in order) rather than
 * hashing full addresses, since booking ID changes are what actually
 * happen in Launch27 when a schedule is edited.
 */
export function fingerprintTeamDay(orderedBookings: Booking[]): string {
  return orderedBookings.map((b) => b.bookingId).join(",");
}
