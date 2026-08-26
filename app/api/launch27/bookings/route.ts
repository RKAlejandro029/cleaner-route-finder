import { NextRequest, NextResponse } from "next/server";
import { fetchLaunch27Bookings } from "@/lib/launch27/client";

export const runtime = "nodejs";

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(today), to: fmt(in60Days) };
}

// GET /api/launch27/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD
// Defaults to today -> +60 days if not provided.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const defaults = defaultRange();
  const from = params.get("from") ?? defaults.from;
  const to = params.get("to") ?? defaults.to;

  try {
    const bookings = await fetchLaunch27Bookings(from, to);
    return NextResponse.json({ bookings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load Launch27 schedule.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
