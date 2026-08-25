import { NextRequest, NextResponse } from "next/server";
import { OpenRouteServiceProvider } from "@/lib/routing/OpenRouteServiceProvider";
import { GeoPoint } from "@/types/booking";

export const runtime = "nodejs";

// POST /api/route { points: GeoPoint[] } -> RouteResult
// NOTE: we never trust client-provided distances/durations — this
// endpoint is the only source of truth for road-network numbers, and it
// always recalculates from the raw points against OpenRouteService.
export async function POST(req: NextRequest) {
  let body: { points?: GeoPoint[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const points = body.points;
  if (!Array.isArray(points) || points.length < 2) {
    return NextResponse.json(
      { error: "At least two points are required." },
      { status: 400 }
    );
  }

  const valid = points.every(
    (p) =>
      typeof p?.lat === "number" &&
      typeof p?.lng === "number" &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng)
  );
  if (!valid) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  }

  try {
    const provider = new OpenRouteServiceProvider(process.env.OPENROUTESERVICE_API_KEY);
    const result = await provider.route(points);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Unable to calculate the route right now. Try again." },
      { status: 502 }
    );
  }
}
