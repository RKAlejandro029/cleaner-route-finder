import { Booking, GeocodedBooking } from "@/types/booking";
import { isBookingActive } from "@/lib/csv/statusFilter";
import { orderTeamBookings } from "./routeOrdering";
import { assignColors } from "./colors";

export type GroupedTeam = {
  teamKey: string;
  teamLabel: string;
  color: string;
  orderedBookings: GeocodedBooking[];
  orderSource: "csv" | "derived";
};

/**
 * Filters, groups, and orders bookings for one day. Pure/synchronous —
 * assumes every booking already has a resolved location (Launch27
 * bookings always do via presetLocation; the caller is responsible for
 * geocoding anything else before calling this).
 */
export function groupAndOrderDay(
  bookings: GeocodedBooking[],
  date: string
): GroupedTeam[] {
  const dayBookings = bookings.filter(
    (b) => b.date === date && isBookingActive(b.status)
  );

  const grouped = new Map<string, GeocodedBooking[]>();
  for (const b of dayBookings) {
    const list = grouped.get(b.teamKey) ?? [];
    list.push(b);
    grouped.set(b.teamKey, list);
  }

  const colors = assignColors([...grouped.keys()]);

  const teams: GroupedTeam[] = [...grouped.entries()].map(([teamKey, groupBookings]) => {
    const { bookings: ordered, source } = orderTeamBookings(groupBookings);
    return {
      teamKey,
      teamLabel: groupBookings[0]?.teamLabel ?? "Unassigned",
      color: colors.get(teamKey) ?? "#2563eb",
      orderedBookings: ordered,
      orderSource: source,
    };
  });

  teams.sort((a, b) => a.teamLabel.localeCompare(b.teamLabel));
  return teams;
}

/** Bookings that are missing a resolved location (only possible for non-Launch27 sources) */
export function bookingsNeedingGeocode(bookings: Booking[]): Booking[] {
  return bookings.filter((b) => !b.presetLocation);
}
