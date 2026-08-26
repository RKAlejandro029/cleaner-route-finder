import { Booking, GeocodedBooking, GeoPoint } from "@/types/booking";
import { CleanerRoute, RouteStop } from "@/types/route";
import { RoutingProvider } from "@/lib/routing/RoutingProvider";
import { isBookingActive } from "@/lib/csv/statusFilter";
import { orderTeamBookings } from "./routeOrdering";
import { assignColors } from "./colors";

/**
 * Filters bookings to a date, geocodes each address (with caching handled
 * by the RoutingProvider), groups by team, orders each group, and returns
 * one CleanerRoute per team.
 */
export async function buildRoutesForDate(
  allBookings: Booking[],
  date: string,
  routingProvider: RoutingProvider
): Promise<{ routes: CleanerRoute[]; geocodeFailures: Booking[] }> {
  const dayBookings = allBookings.filter(
    (b) => b.date === date && isBookingActive(b.status)
  );

  const geocodeFailures: Booking[] = [];
  const geocoded: GeocodedBooking[] = [];

  // Geocode sequentially-cached-but-parallel; ClientRoutingProvider caches
  // by normalized address so repeat addresses across dates are free.
  await Promise.all(
    dayBookings.map(async (booking) => {
      try {
        // Launch27-sourced bookings already carry coordinates — skip the
        // geocode API call entirely and save quota. CSV-sourced bookings
        // don't have this and fall through to the normal geocode call.
        const location = booking.presetLocation ?? (await routingProvider.geocode(booking.fullAddress));
        geocoded.push({ ...booking, location });
      } catch {
        geocodeFailures.push(booking);
      }
    })
  );

  const grouped = new Map<string, GeocodedBooking[]>();
  for (const b of geocoded) {
    const list = grouped.get(b.teamKey) ?? [];
    list.push(b);
    grouped.set(b.teamKey, list);
  }

  const colors = assignColors([...grouped.keys()]);

  const routes: CleanerRoute[] = await Promise.all(
    [...grouped.entries()].map(async ([teamKey, bookings]) => {
      const { bookings: ordered, source } = orderTeamBookings(bookings);
      const stops: RouteStop[] = ordered.map((booking) => ({
        kind: "booking",
        booking,
      }));

      // Fetch the actual road-network route geometry for the whole day's
      // stops so the map draws real roads instead of straight lines
      // between markers. If routing fails, fall back to no geometry and
      // the map will draw straight connector lines instead.
      let geometry: GeoPoint[] | undefined;
      if (stops.length >= 2) {
        try {
          const points = stops.map((s) => stopLocation(s));
          const result = await routingProvider.route(points);
          geometry = result.geometry;
        } catch {
          geometry = undefined;
        }
      }

      return {
        teamKey,
        teamLabel: bookings[0]?.teamLabel ?? "Unassigned",
        color: colors.get(teamKey) ?? "#2563eb",
        stops,
        geometry,
        orderSource: source,
      };
    })
  );

  routes.sort((a, b) => a.teamLabel.localeCompare(b.teamLabel));

  return { routes, geocodeFailures };
}

export function stopLocation(stop: RouteStop): GeoPoint {
  return stop.kind === "booking" ? stop.booking.location : stop.location;
}

export function stopLabel(stop: RouteStop): string {
  if (stop.kind === "booking") {
    return stop.booking.address;
  }
  return stop.label;
}
