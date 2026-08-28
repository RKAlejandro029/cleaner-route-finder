import { NextResponse } from "next/server";
import { fetchLessenTasks } from "@/lib/lessen/client";
import { buildRoutingProviderChain } from "@/lib/routing/providerChain";
import { loadGeocodeCache, appendGeocodeCacheRow } from "@/lib/cache/lessenGeocodeCache";
import { LessenTask } from "@/types/lessen";

export const runtime = "nodejs";

// GET /api/lessen/tasks -> { tasks: LessenTask[] }
// Fetches tasks live from Lessen (no scheduled sync needed — login is
// plain HTTP, fast enough to do per-request) and geocodes any address
// missing cached coordinates, writing new ones back to the sheet.
export async function GET() {
  try {
    const [rawTasks, geocodeCache] = await Promise.all([
      fetchLessenTasks(),
      loadGeocodeCache(),
    ]);

    const provider = buildRoutingProviderChain();

    const tasks: LessenTask[] = await Promise.all(
      rawTasks.map(async (t) => {
        const fullAddress = [t.address, t.city, t.state, t.zipCode].filter(Boolean).join(", ");
        let location = geocodeCache.get(fullAddress) ?? null;

        if (!location) {
          try {
            location = await provider.geocode(fullAddress);
            await appendGeocodeCacheRow(fullAddress, location);
          } catch {
            location = null; // this task just won't render as a pin
          }
        }

        return { ...t, location };
      })
    );

    return NextResponse.json({ tasks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load Lessen tasks.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
