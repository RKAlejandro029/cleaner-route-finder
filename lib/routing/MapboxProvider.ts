import { GeoPoint } from "@/types/booking";
import { RouteResult } from "@/types/route";
import { RoutingProvider, GeocodeSuggestion } from "./RoutingProvider";

/**
 * Runs SERVER-SIDE ONLY. Third/last link in the routing fallback chain —
 * used only when both OpenRouteService and GraphHopper have errored or
 * are rate-limited. Requires a Mapbox access token (Mapbox requires a
 * card on file even for the free tier, unlike ORS/GraphHopper).
 */
export class MapboxProvider implements RoutingProvider {
  private accessToken: string;

  constructor(accessToken: string | undefined) {
    if (!accessToken) {
      throw new Error("MAPBOX_ACCESS_TOKEN is not configured on the server.");
    }
    this.accessToken = accessToken;
  }

  async geocode(address: string): Promise<GeoPoint> {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      address
    )}.json?access_token=${this.accessToken}&country=US&limit=1`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox geocode failed (${res.status})`);

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) throw new Error("Address not found.");

    const [lng, lat] = feature.center;
    return { lat, lng };
  }

  async autocomplete(partialAddress: string): Promise<GeocodeSuggestion[]> {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      partialAddress
    )}.json?access_token=${this.accessToken}&country=US&limit=5`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox autocomplete failed (${res.status})`);

    const data = await res.json();
    const features = data?.features ?? [];

    return features.map((f: any) => ({
      label: f.place_name,
      location: { lat: f.center[1], lng: f.center[0] },
    }));
  }

  async route(points: GeoPoint[]): Promise<RouteResult> {
    const coordString = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordString}?geometries=geojson&access_token=${this.accessToken}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox route failed (${res.status})`);

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) throw new Error("No route found.");

    const geometry: GeoPoint[] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => ({ lat, lng })
    );

    return {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      geometry,
    };
  }
}
