import { GeoPoint } from "@/types/booking";
import { RouteResult } from "@/types/route";
import { RoutingProvider, GeocodeSuggestion } from "./RoutingProvider";

const GH_BASE = "https://graphhopper.com/api/1";

/**
 * Runs SERVER-SIDE ONLY. Second link in the routing fallback chain —
 * used only when OpenRouteService errors or is rate-limited.
 */
export class GraphHopperProvider implements RoutingProvider {
  private apiKey: string;

  constructor(apiKey: string | undefined) {
    if (!apiKey) {
      throw new Error("GRAPHHOPPER_API_KEY is not configured on the server.");
    }
    this.apiKey = apiKey;
  }

  async geocode(address: string): Promise<GeoPoint> {
    const url = `${GH_BASE}/geocode?q=${encodeURIComponent(
      address
    )}&locale=en&limit=1&key=${this.apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`GraphHopper geocode failed (${res.status})`);

    const data = await res.json();
    const hit = data?.hits?.[0];
    if (!hit) throw new Error("Address not found.");

    return { lat: hit.point.lat, lng: hit.point.lng };
  }

  async autocomplete(partialAddress: string): Promise<GeocodeSuggestion[]> {
    const url = `${GH_BASE}/geocode?q=${encodeURIComponent(
      partialAddress
    )}&locale=en&limit=5&key=${this.apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`GraphHopper autocomplete failed (${res.status})`);

    const data = await res.json();
    const hits = data?.hits ?? [];

    return hits.map((h: any) => ({
      label: [h.name, h.street, h.city, h.state, h.postcode]
        .filter(Boolean)
        .join(", "),
      location: { lat: h.point.lat, lng: h.point.lng },
    }));
  }

  async route(points: GeoPoint[]): Promise<RouteResult> {
    const pointParams = points
      .map((p) => `point=${p.lat},${p.lng}`)
      .join("&");
    const url = `${GH_BASE}/route?${pointParams}&vehicle=car&points_encoded=false&key=${this.apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`GraphHopper route failed (${res.status})`);

    const data = await res.json();
    const path = data?.paths?.[0];
    if (!path) throw new Error("No route found.");

    const geometry: GeoPoint[] = path.points.coordinates.map(
      ([lng, lat]: [number, number]) => ({ lat, lng })
    );

    return {
      distanceMeters: path.distance,
      durationSeconds: path.time / 1000,
      geometry,
    };
  }
}
