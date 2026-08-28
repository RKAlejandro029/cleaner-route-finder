"use client";

import { useRef, useState } from "react";
import DayLoader from "@/components/DayLoader";
import AddressSearch from "@/components/AddressSearch";
import RouteMap, { ExtraPin } from "@/components/RouteMap";
import BestFitCard from "@/components/BestFitCard";
import CleanerResults from "@/components/CleanerResults";
import CleanerList from "@/components/CleanerList";
import LessenLayer from "@/components/LessenLayer";
import { Booking, GeoPoint } from "@/types/booking";
import { CleanerRoute, RouteStop } from "@/types/route";
import { RankedCandidate, InsertionCandidate } from "@/types/recommendation";
import { LessenTask } from "@/types/lessen";
import { colorForTaskType } from "@/lib/lessen/taskTypeColors";
import { ClientRoutingProvider } from "@/lib/routing/ClientRoutingProvider";
import { rankInsertionsAcrossRoutes } from "@/lib/route-analysis/insertion";

export default function Home() {
  // The RoutingProvider instance is stable for the whole session so its
  // internal geocode/route caches persist across searches.
  const routingProviderRef = useRef(new ClientRoutingProvider());

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Distinct job count for display — a 2-cleaner job produces 2 Booking
  // rows internally (one per individual cleaner's route) but is still one
  // real job, so the UI should say "1 job", not "2".
  const [jobCount, setJobCount] = useState<number | null>(null);
  const [routes, setRoutes] = useState<CleanerRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<{ cached: number; total: number } | null>(null);

  const [newAddress, setNewAddress] = useState<string | null>(null);
  const [newLocation, setNewLocation] = useState<GeoPoint | null>(null);
  const [addressAdjusted, setAddressAdjusted] = useState(false);

  const [candidates, setCandidates] = useState<RankedCandidate[] | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  // Single selection driving BOTH: which cleaner's route is isolated on
  // the map, and (when that cleaner is among the current search results)
  // which candidate's insertion preview line is shown. Clicking a cleaner
  // anywhere — the "Cleaners Today" list or the "Other Options" results
  // list — sets this same value, so the two views always stay in sync.
  const [selectedTeamKey, setSelectedTeamKey] = useState<string | null>(null);
  const [addingTemp, setAddingTemp] = useState(false);

  const [visibleLessenTasks, setVisibleLessenTasks] = useState<LessenTask[]>([]);
  const [prefillAddress, setPrefillAddress] = useState<string | null>(null);

  // Called once DayLoader has already fetched just this date's bookings
  // from Launch27 (from=to=date — the only reliably-filtered query shape).
  // `bookings` may contain multiple rows per job (one per assigned
  // cleaner) — that's intentional, see lib/launch27/mapBooking.ts.
  async function handleDayLoaded(date: string, bookings: Booking[]) {
    setSelectedDate(date);
    setJobCount(new Set(bookings.map((b) => b.bookingId)).size);
    setNewAddress(null);
    setNewLocation(null);
    setAddressAdjusted(false);
    setCandidates(null);
    setFindError(null);
    setSelectedTeamKey(null);
    setRoutesError(null);
    setRoutes([]);
    setCacheInfo(null);

    if (bookings.length === 0) return;

    setLoadingRoutes(true);
    try {
      const res = await fetch("/api/routes/day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, bookings }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to build routes for this date.");
      }
      const data = await res.json();
      setRoutes(data.routes);
      const cachedCount = data.routes.filter((r: CleanerRoute & { fromCache?: boolean }) => r.fromCache).length;
      setCacheInfo({ cached: cachedCount, total: data.routes.length });
    } catch (err) {
      setRoutesError(err instanceof Error ? err.message : "Unable to build routes for this date.");
    } finally {
      setLoadingRoutes(false);
    }
  }

  async function handleFind(address: string) {
    if (!selectedDate) return;
    setFinding(true);
    setFindError(null);
    setCandidates(null);
    setSelectedTeamKey(null);

    try {
      const location = await routingProviderRef.current.geocode(address);
      setNewAddress(address);
      setNewLocation(location);
      setAddressAdjusted(false);

      const ranked = await rankInsertionsAcrossRoutes(
        routes,
        location,
        routingProviderRef.current
      );
      setCandidates(ranked);
      const firstValid = ranked.find((c): c is InsertionCandidate => !c.excluded);
      if (firstValid) setSelectedTeamKey(firstValid.teamKey);
    } catch (err: any) {
      setFindError(err?.message ?? "We couldn't find that address. Check the address and try again.");
    } finally {
      setFinding(false);
    }
  }

  async function recalculateAfterDrag(location: GeoPoint) {
    setNewLocation(location);
    setAddressAdjusted(true);
    if (!newAddress) return;

    setFinding(true);
    try {
      const ranked = await rankInsertionsAcrossRoutes(
        routes,
        location,
        routingProviderRef.current
      );
      setCandidates(ranked);
    } finally {
      setFinding(false);
    }
  }

  function handleAddTemporary(candidate: InsertionCandidate) {
    if (!newLocation || !newAddress) return;
    setAddingTemp(true);

    const route = routes.find((r) => r.teamKey === candidate.teamKey);
    if (!route) {
      setAddingTemp(false);
      return;
    }

    const newStop: RouteStop = {
      kind: "temporary",
      temporaryId: `temp-${Date.now()}`,
      label: "NEW PROPERTY",
      location: newLocation,
      address: newAddress,
    };

    const insertAt = candidate.insertAfterIndex + 1;
    const updatedStops = [
      ...route.stops.slice(0, insertAt),
      newStop,
      ...route.stops.slice(insertAt),
    ];

    setRoutes((prev) =>
      prev.map((r) => (r.teamKey === route.teamKey ? { ...r, stops: updatedStops } : r))
    );

    // Clear the search so the next property is evaluated fresh against
    // the now-updated route, per spec.
    setNewAddress(null);
    setNewLocation(null);
    setCandidates(null);
    setSelectedTeamKey(null);
    setAddingTemp(false);
  }

  function handleToggleSelection(teamKey: string) {
    setSelectedTeamKey((prev) => (prev === teamKey ? null : teamKey));
  }

  const bestCandidate =
    candidates?.find((c): c is InsertionCandidate => !c.excluded) ?? null;
  const otherCandidates = candidates?.filter((c) => c !== bestCandidate) ?? [];

  const selectedRoute = routes.find((r) => r.teamKey === selectedTeamKey);
  const selectedCandidate =
    candidates?.find((c): c is InsertionCandidate => !c.excluded && c.teamKey === selectedTeamKey) ?? null;

  // Selecting a cleaner (from either list) isolates their route on the
  // map. The search/insertion algorithm always considers every cleaner
  // regardless of what's currently isolated.
  const visibleRoutes = selectedTeamKey
    ? routes.filter((r) => r.teamKey === selectedTeamKey)
    : routes;

  const hasBookingsForDate = jobCount !== null && jobCount > 0;

  const extraPins: ExtraPin[] = visibleLessenTasks
    .filter((t) => t.location)
    .map((t) => ({
      id: t.woId,
      label: `[${t.taskTypeName}] ${t.address}, ${t.city} — ${t.clientName}`,
      location: t.location!,
      color: colorForTaskType(t.taskTypeId),
    }));

  function handleExtraPinClick(pin: ExtraPin) {
    const task = visibleLessenTasks.find((t) => t.woId === pin.id);
    if (!task) return;
    const fullAddress = [task.address, task.city, task.state, task.zipCode]
      .filter(Boolean)
      .join(", ");
    setPrefillAddress(fullAddress);
  }

  return (
    <main className="h-screen flex flex-col">
      <header className="border-b border-gray-200 bg-white px-4 sm:px-6 py-3 flex-shrink-0">
        <h1 className="text-xl font-bold">Cleaner Route Finder</h1>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left navigation: date, search, and results all live here,
            grouped into clear steps matching how the app is actually used */}
        <aside className="w-full lg:w-96 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white p-4 sm:p-6 overflow-y-auto">

          {/* STEP 1 — Load a day's schedule */}
          <section>
            <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide mb-2">
              1. Load a Date
            </p>
            <DayLoader onLoaded={handleDayLoaded} loadedDate={selectedDate} jobCount={jobCount} />

            {selectedDate && jobCount === 0 && (
              <p className="text-sm text-gray-500 mt-2">
                No Launch27 bookings found for this date.
              </p>
            )}
            {routesError && <p className="text-sm text-red-600 mt-2">{routesError}</p>}
          </section>

          {selectedDate && hasBookingsForDate && (
            <>
              {/* STEP 2 — Browse who's working, and where */}
              <section className="border-t border-gray-200 mt-5 pt-5">
                <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide mb-2">
                  2. Today's Cleaners
                </p>

                {loadingRoutes && <p className="text-sm text-gray-500">Loading routes…</p>}

                {!loadingRoutes && cacheInfo && cacheInfo.total > 0 && (
                  <p className="text-xs text-gray-400 mb-2">
                    {cacheInfo.cached > 0
                      ? `${cacheInfo.cached}/${cacheInfo.total} routes reused from cache (schedule unchanged)`
                      : `${cacheInfo.total} routes freshly calculated`}
                  </p>
                )}

                {!loadingRoutes && routes.length > 0 && (
                  <CleanerList
                    routes={routes}
                    selectedTeamKey={selectedTeamKey}
                    onToggle={handleToggleSelection}
                  />
                )}
              </section>

              {/* STEP 3 — Search a new property */}
              <section className="border-t border-gray-200 mt-5 pt-5">
                <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide mb-2">
                  3. Find Best Cleaner
                </p>
                <AddressSearch
                  routingProvider={routingProviderRef.current}
                  onFind={handleFind}
                  busy={finding}
                  error={findError}
                  prefillAddress={prefillAddress}
                />

                {!loadingRoutes && !candidates && (
                  <p className="text-sm text-gray-500 mt-2">
                    Enter a new cleaning location above, or click a Lessen pin
                    on the map below.
                  </p>
                )}
              </section>

              {/* STEP 4 — Results */}
              {candidates && (
                <section className="border-t border-gray-200 mt-5 pt-5 space-y-3">
                  <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">
                    4. Results
                  </p>

                  {addressAdjusted && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                      Location adjusted. Recalculated automatically.
                    </p>
                  )}

                  {bestCandidate && (
                    <BestFitCard
                      candidate={bestCandidate}
                      onAddTemporary={() => handleAddTemporary(bestCandidate)}
                      adding={addingTemp}
                    />
                  )}

                  <CleanerResults
                    candidates={otherCandidates}
                    onSelect={handleToggleSelection}
                    selectedTeamKey={selectedTeamKey}
                  />
                </section>
              )}
            </>
          )}

          {/* Optional overlay — kept visually separate since it's not part
              of the core load → browse → search flow above */}
          <section className="border-t border-gray-200 mt-5 pt-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Optional: Dispatch Overlays
            </p>
            <LessenLayer onVisibleTasksChange={setVisibleLessenTasks} />
          </section>
        </aside>

        {/* Map fills the remaining space — always rendered, even before
            any date is loaded, so the app opens on Arizona immediately */}
        <div className="flex-1 min-h-[320px] p-4 sm:p-6">
          <RouteMap
            routes={selectedDate && hasBookingsForDate ? visibleRoutes : []}
            newProperty={newLocation && newAddress ? { location: newLocation, address: newAddress } : null}
            previewGeometry={selectedCandidate?.previewGeometry}
            previewColor={selectedRoute?.color}
            onMarkerDrag={recalculateAfterDrag}
            extraPins={extraPins}
            onExtraPinClick={handleExtraPinClick}
          />
        </div>
      </div>
    </main>
  );
}
