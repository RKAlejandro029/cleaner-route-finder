import { GeoPoint } from "@/types/booking";
import { RouteResult } from "@/types/route";

export type GeocodeSuggestion = {
  label: string;
  location: GeoPoint;
};

/**
 * Abstraction over the road-routing/geocoding backend. Implementations
 * may call any provider; the rest of the app never talks to a specific
 * provider directly. This lets OpenRouteService be swapped out later
 * without rewriting route-analysis code.
 */
export interface RoutingProvider {
  geocode(address: string): Promise<GeoPoint>;
  autocomplete(partialAddress: string): Promise<GeocodeSuggestion[]>;
  route(points: GeoPoint[]): Promise<RouteResult>;
}
