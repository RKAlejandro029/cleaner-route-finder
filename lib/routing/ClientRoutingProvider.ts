import { GeoPoint } from "@/types/booking";
import { RouteResult } from "@/types/route";
import { RoutingProvider, GeocodeSuggestion } from "./RoutingProvider";

/**
 * Runs in the BROWSER. Never contacts OpenRouteService directly and never
 * sees the API key — it only calls our own /api/geocode and /api/route
 * serverless functions, which hold the key server-side.
 */
export class ClientRoutingProvider implements RoutingProvider {
  private geocodeCache = new Map<string, GeoPoint>();
  private routeCache = new Map<string, RouteResult>();

  async geocode(address: string): Promise<GeoPoint> {
    const key = address.trim().toLowerCase();
    const cached = this.geocodeCache.get(key);
    if (cached) return cached;

    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });

    if (!res.ok) {
      throw new Error("We couldn't find that address. Check the address and try again.");
    }

    const data = await res.json();
    const point: GeoPoint = data.location;
    this.geocodeCache.set(key, point);
    return point;
  }

  async autocomplete(partialAddress: string): Promise<GeocodeSuggestion[]> {
    if (partialAddress.trim().length < 4) return [];

    const res = await fetch(
      `/api/geocode?q=${encodeURIComponent(partialAddress)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.suggestions ?? [];
  }

  async route(points: GeoPoint[]): Promise<RouteResult> {
    if (points.length < 2) {
      return { distanceMeters: 0, durationSeconds: 0, geometry: points };
    }

    const key = JSON.stringify(points.map((p) => [p.lat.toFixed(5), p.lng.toFixed(5)]));
    const cached = this.routeCache.get(key);
    if (cached) return cached;

    const res = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });

    if (!res.ok) {
      throw new Error("Unable to calculate the route right now. Try again.");
    }

    const data: RouteResult = await res.json();
    this.routeCache.set(key, data);
    return data;
  }
}
