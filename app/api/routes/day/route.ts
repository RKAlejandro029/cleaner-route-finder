import { NextRequest, NextResponse } from "next/server";
import { Booking, GeocodedBooking } from "@/types/booking";
import { groupAndOrderDay } from "@/lib/route-analysis/groupAndOrder";
import { fingerprintTeamDay } from "@/lib/route-analysis/fingerprint";
import { loadCacheIndex, upsertCacheRow } from "@/lib/cache/googleSheetsCache";
import { buildRoutingProviderChain } from "@/lib/routing/providerChain";

export const runtime = "nodejs";

// POST /api/routes/day  { date: string, bookings: Booking[] }
// Returns fully-built CleanerRoute[] (including road-network geometry),
// reusing cached geometry from Google Sheets whenever a team's schedule
// for that date hasn't changed since it was last computed.
export async function POST(req: NextRequest) {
  let body: { date?: string; bookings?: Booking[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { date, bookings } = body;
  if (!date || !Array.isArray(bookings)) {
    return NextResponse.json({ error: "date and bookings are required." }, { status: 400 });
  }

  try {
    const provider = buildRoutingProviderChain();

    // Resolve locations for anything that isn't already geocoded (Launch27
    // bookings always are via presetLocation; this is just a safety net).
    const geocoded: GeocodedBooking[] = [];
    for (const b of bookings) {
      if (b.presetLocation) {
        geocoded.push({ ...b, location: b.presetLocation });
      } else {
        try {
          const location = await provider.geocode(b.fullAddress);
          geocoded.push({ ...b, location });
        } catch {
          // drop bookings that fail to geocode rather than failing the whole day
        }
      }
    }

    const teams = groupAndOrderDay(geocoded, date);
    const cacheIndex = await loadCacheIndex();

    const routes = await Promise.all(
      teams.map(async (team) => {
        const fingerprint = fingerprintTeamDay(team.orderedBookings);
        const cacheKey = `${date}|${team.teamKey}`;
        const cached = cacheIndex.get(cacheKey);

        let geometry;
        let fromCache = false;

        if (cached && cached.fingerprint === fingerprint) {
          geometry = cached.geometry;
          fromCache = true;
        } else if (team.orderedBookings.length >= 2) {
          try {
            const points = team.orderedBookings.map((b) => b.location);
            const result = await provider.route(points);
            geometry = result.geometry;
            await upsertCacheRow(
              date,
              team.teamKey,
              fingerprint,
              {
                distanceMeters: result.distanceMeters,
                durationSeconds: result.durationSeconds,
                geometry: result.geometry,
              },
              cached?.rowNumber
            );
          } catch {
            geometry = undefined;
          }
        }

        return {
          teamKey: team.teamKey,
          teamLabel: team.teamLabel,
          color: team.color,
          stops: team.orderedBookings.map((booking) => ({ kind: "booking" as const, booking })),
          geometry,
          orderSource: team.orderSource,
          fromCache,
        };
      })
    );

    return NextResponse.json({ routes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to build routes for this date.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
