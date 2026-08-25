import { NextRequest, NextResponse } from "next/server";
import { OpenRouteServiceProvider } from "@/lib/routing/OpenRouteServiceProvider";

export const runtime = "nodejs";

function getProvider() {
  return new OpenRouteServiceProvider(process.env.OPENROUTESERVICE_API_KEY);
}

// GET /api/geocode?q=partial+address  -> autocomplete suggestions
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 4) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const provider = getProvider();
    const suggestions = await provider.autocomplete(q.trim());
    return NextResponse.json({ suggestions });
  } catch (err) {
    // Fail soft for autocomplete — an empty list is fine
    return NextResponse.json({ suggestions: [] });
  }
}

// POST /api/geocode { address }  -> resolved GeoPoint
export async function POST(req: NextRequest) {
  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const address = body.address?.trim();
  if (!address) {
    return NextResponse.json({ error: "Address is required." }, { status: 400 });
  }

  try {
    const provider = getProvider();
    const location = await provider.geocode(address);
    return NextResponse.json({ location });
  } catch (err) {
    return NextResponse.json(
      { error: "We couldn't find that address. Check the address and try again." },
      { status: 422 }
    );
  }
}
