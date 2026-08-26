import { GeoPoint } from "@/types/booking";
import { RouteResult } from "@/types/route";
import { RoutingProvider, GeocodeSuggestion } from "./RoutingProvider";

/**
 * Runs SERVER-SIDE ONLY. Tries each provider in the given priority order
 * for every call. If a provider is missing its API key, throws an error,
 * hits a quota/rate-limit (HTTP 429/402/403), or otherwise fails, the
 * next provider in the chain is tried automatically.
 *
 * This is intentionally stateless/per-request rather than tracking a
 * "this provider is down, skip it for N minutes" circuit breaker —
 * Vercel serverless functions don't share memory reliably between
 * invocations, so an in-memory breaker would rarely help and adds
 * complexity for little benefit at this scale.
 *
 * Providers that fail to even construct (e.g. missing env var) are
 * skipped just like providers that fail their actual API call.
 */
export class FallbackRoutingProvider implements RoutingProvider {
  constructor(private providers: RoutingProvider[]) {
    if (providers.length === 0) {
      throw new Error("FallbackRoutingProvider requires at least one provider.");
    }
  }

  async geocode(address: string): Promise<GeoPoint> {
    return this.tryEach((p) => p.geocode(address));
  }

  async autocomplete(partialAddress: string): Promise<GeocodeSuggestion[]> {
    // Autocomplete is best-effort UX, not critical — fail soft to an
    // empty list instead of throwing if every provider fails.
    try {
      return await this.tryEach((p) => p.autocomplete(partialAddress));
    } catch {
      return [];
    }
  }

  async route(points: GeoPoint[]): Promise<RouteResult> {
    return this.tryEach((p) => p.route(points));
  }

  private async tryEach<T>(fn: (provider: RoutingProvider) => Promise<T>): Promise<T> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      try {
        return await fn(provider);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        // continue to next provider
      }
    }

    throw new Error(
      `All routing providers failed: ${errors.join(" | ")}`
    );
  }
}
