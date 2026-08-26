import { RoutingProvider } from "./RoutingProvider";
import { OpenRouteServiceProvider } from "./OpenRouteServiceProvider";
import { GraphHopperProvider } from "./GraphHopperProvider";
import { MapboxProvider } from "./MapboxProvider";
import { FallbackRoutingProvider } from "./FallbackRoutingProvider";

/**
 * Builds the server-side routing chain in priority order:
 *   1. OpenRouteService (primary — free, no card required)
 *   2. GraphHopper (fallback — free tier, no card required)
 *   3. Mapbox (last resort — free tier, requires a card on file)
 *
 * Any provider whose API key env var isn't set is silently skipped
 * rather than breaking the whole chain, so this works fine with just
 * ORS configured (the minimum) or all three (maximum resilience).
 */
export function buildRoutingProviderChain(): RoutingProvider {
  const providers: RoutingProvider[] = [];

  if (process.env.OPENROUTESERVICE_API_KEY) {
    providers.push(new OpenRouteServiceProvider(process.env.OPENROUTESERVICE_API_KEY));
  }
  if (process.env.GRAPHHOPPER_API_KEY) {
    providers.push(new GraphHopperProvider(process.env.GRAPHHOPPER_API_KEY));
  }
  if (process.env.MAPBOX_ACCESS_TOKEN) {
    providers.push(new MapboxProvider(process.env.MAPBOX_ACCESS_TOKEN));
  }

  if (providers.length === 0) {
    throw new Error(
      "No routing provider is configured. Set at least OPENROUTESERVICE_API_KEY."
    );
  }

  return new FallbackRoutingProvider(providers);
}
