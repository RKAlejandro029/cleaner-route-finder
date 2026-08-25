import { GeoPoint } from "@/types/booking";
import { CleanerRoute } from "@/types/route";
import { InsertionCandidate, ExcludedCandidate, RankedCandidate } from "@/types/recommendation";
import { RoutingProvider } from "@/lib/routing/RoutingProvider";
import { stopLocation, stopLabel } from "./buildRoutes";

/**
 * ROUTE INSERTION ALGORITHM
 * ─────────────────────────
 * For a single cleaner/team route (an ordered list of stops A, B, C, ...),
 * we test inserting the new property at every possible position:
 *
 *   NEW → A → B → C          (before the first stop)
 *   A → NEW → B → C          (between stop 1 and 2)
 *   A → B → NEW → C          (between stop 2 and 3)
 *   A → B → C → NEW          (after the last stop)
 *
 * For each candidate position we ask OpenRouteService for the real
 * road-network distance/duration of the two affected legs individually,
 * then compute:
 *
 *   additionalDistance = distance(prev, NEW) + distance(NEW, next) - distance(prev, next)
 *   additionalTime     = duration(prev, NEW) + duration(NEW, next) - duration(prev, next)
 *
 * The existing prev→next leg distance is taken from the route's overall
 * geometry when available; if not, we fetch it directly. Every number
 * used in the comparison comes from real road routing — never Haversine —
 * per product spec (straight-line distance must not drive the ranking).
 *
 * The position with the lowest additional distance wins for that team;
 * additional time is the tie-breaker.
 */

export async function evaluateInsertionForRoute(
  route: CleanerRoute,
  newLocation: GeoPoint,
  routingProvider: RoutingProvider
): Promise<InsertionCandidate | ExcludedCandidate> {
  if (route.stops.length === 0) {
    // No existing stops: only one "insertion" is possible — nothing to
    // compare against. We still compute a single point as a de-facto
    // starting stop for that team's day.
    return {
      teamKey: route.teamKey,
      teamLabel: route.teamLabel,
      color: route.color,
      insertAfterIndex: -1,
      additionalDistanceMeters: 0,
      additionalDurationSeconds: 0,
      insertionLabel: "NEW PROPERTY (first stop of the day)",
      previewGeometry: [newLocation],
    };
  }

  const positions = route.stops.length + 1; // number of gaps including ends
  const results: {
    insertAfterIndex: number;
    additionalDistanceMeters: number;
    additionalDurationSeconds: number;
    insertionLabel: string;
  }[] = [];

  try {
    for (let gap = 0; gap < positions; gap++) {
      const prevStop = gap - 1 >= 0 ? route.stops[gap - 1] : null;
      const nextStop = gap < route.stops.length ? route.stops[gap] : null;

      const prevPoint = prevStop ? stopLocation(prevStop) : null;
      const nextPoint = nextStop ? stopLocation(nextStop) : null;

      let baselineDistance = 0;
      let baselineDuration = 0;
      if (prevPoint && nextPoint) {
        const baseline = await routingProvider.route([prevPoint, nextPoint]);
        baselineDistance = baseline.distanceMeters;
        baselineDuration = baseline.durationSeconds;
      }

      let addedDistance = 0;
      let addedDuration = 0;

      if (prevPoint) {
        const leg = await routingProvider.route([prevPoint, newLocation]);
        addedDistance += leg.distanceMeters;
        addedDuration += leg.durationSeconds;
      }
      if (nextPoint) {
        const leg = await routingProvider.route([newLocation, nextPoint]);
        addedDistance += leg.distanceMeters;
        addedDuration += leg.durationSeconds;
      }

      const additionalDistanceMeters = addedDistance - baselineDistance;
      const additionalDurationSeconds = addedDuration - baselineDuration;

      const prevLabel = prevStop ? shortLabel(stopLabel(prevStop)) : null;
      const nextLabel = nextStop ? shortLabel(stopLabel(nextStop)) : null;
      const insertionLabel = [prevLabel, "NEW PROPERTY", nextLabel]
        .filter(Boolean)
        .join(" → ");

      results.push({
        insertAfterIndex: gap - 1,
        additionalDistanceMeters,
        additionalDurationSeconds,
        insertionLabel,
      });
    }
  } catch (err) {
    return {
      teamKey: route.teamKey,
      teamLabel: route.teamLabel,
      color: route.color,
      excluded: true,
      reason: "No valid route could be calculated.",
    };
  }

  results.sort((a, b) => {
    if (a.additionalDistanceMeters !== b.additionalDistanceMeters) {
      return a.additionalDistanceMeters - b.additionalDistanceMeters;
    }
    return a.additionalDurationSeconds - b.additionalDurationSeconds;
  });

  const best = results[0];
  if (!best) {
    return {
      teamKey: route.teamKey,
      teamLabel: route.teamLabel,
      color: route.color,
      excluded: true,
      reason: "No valid route could be calculated.",
    };
  }

  const straightPreview = buildPreviewGeometry(route, newLocation, best.insertAfterIndex);
  let previewGeometry = straightPreview;

  // Prefer the actual road-network geometry for the dashed preview line
  // so it follows real roads instead of cutting straight across the map.
  if (straightPreview.length >= 2) {
    try {
      const fullRoute = await routingProvider.route(straightPreview);
      previewGeometry = fullRoute.geometry;
    } catch {
      previewGeometry = straightPreview;
    }
  }

  return {
    teamKey: route.teamKey,
    teamLabel: route.teamLabel,
    color: route.color,
    insertAfterIndex: best.insertAfterIndex,
    additionalDistanceMeters: best.additionalDistanceMeters,
    additionalDurationSeconds: best.additionalDurationSeconds,
    insertionLabel: best.insertionLabel,
    previewGeometry,
  };
}

export async function rankInsertionsAcrossRoutes(
  routes: CleanerRoute[],
  newLocation: GeoPoint,
  routingProvider: RoutingProvider
): Promise<RankedCandidate[]> {
  const evaluations = await Promise.all(
    routes.map((route) => evaluateInsertionForRoute(route, newLocation, routingProvider))
  );

  const valid = evaluations.filter((c): c is InsertionCandidate => !c.excluded);
  const excluded = evaluations.filter((c): c is ExcludedCandidate => !!c.excluded);

  valid.sort((a, b) => {
    if (a.additionalDistanceMeters !== b.additionalDistanceMeters) {
      return a.additionalDistanceMeters - b.additionalDistanceMeters;
    }
    return a.additionalDurationSeconds - b.additionalDurationSeconds;
  });

  return [...valid, ...excluded];
}

function shortLabel(address: string): string {
  const firstPart = address.split(",")[0] ?? address;
  return firstPart.length > 24 ? firstPart.slice(0, 24) + "…" : firstPart;
}

function buildPreviewGeometry(
  route: CleanerRoute,
  newLocation: GeoPoint,
  insertAfterIndex: number
): GeoPoint[] {
  const points = route.stops.map(stopLocation);
  const insertAt = insertAfterIndex + 1;
  return [...points.slice(0, insertAt), newLocation, ...points.slice(insertAt)];
}
