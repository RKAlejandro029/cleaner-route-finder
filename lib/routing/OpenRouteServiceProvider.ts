import { GeoPoint } from "@/types/booking";
import { RouteResult } from "@/types/route";
import { RoutingProvider, GeocodeSuggestion } from "./RoutingProvider";

const ORS_BASE = "https://api.openrouteservice.org";

/**
 * Runs SERVER-SIDE ONLY (inside app/api/* route handlers). Reads the API
 * key from a private environment variable. Never import this file from
 * client components.
 */
export class OpenRouteServiceProvider implements RoutingProvider {
  private apiKey: string;

  constructor(apiKey: string | undefined) {
    if (!apiKey) {
      throw new Error(
        "OPENROUTESERVICE_API_KEY is not configured on the server."
      );
    }
    this.apiKey = apiKey;
  }

  async geocode(address: string): Promise<GeoPoint> {
    const url = `${ORS_BASE}/geocode/search?api_key=${this.apiKey}&text=${encodeURIComponent(
      address
    )}&boundary.country=US&boundary.circle.lat=34.0&boundary.circle.lon=-111.6&boundary.circle.radius=250&size=1`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Geocoding request failed.");

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) throw new Error("Address not found.");

    const [lng, lat] = feature.geometry.coordinates;
    return { lat, lng };
  }

  async autocomplete(partialAddress: string): Promise<GeocodeSuggestion[]> {
    const url = `${ORS_BASE}/geocode/autocomplete?api_key=${this.apiKey}&text=${encodeURIComponent(
      partialAddress
    )}&boundary.country=US&focus.point.lat=34.0&focus.point.lon=-111.6&size=5`;

    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    const features = data?.features ?? [];

    return features.map((f: any) => ({
      label: f.properties?.label ?? "Unknown address",
      location: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
    }));
  }

  async route(points: GeoPoint[]): Promise<RouteResult> {
    const url = `${ORS_BASE}/v2/directions/driving-car/geojson`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: points.map((p) => [p.lng, p.lat]),
      }),
    });

    if (!res.ok) throw new Error("Routing request failed.");

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) throw new Error("No route found.");

    const summary = feature.properties.summary;
    const geometry: GeoPoint[] = feature.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => ({ lat, lng })
    );

    return {
      distanceMeters: summary.distance,
      durationSeconds: summary.duration,
      geometry,
    };
  }
}
