"use client";

import { useMemo, useRef, useState } from "react";
import CsvUploader from "@/components/CsvUploader";
import DateSelector from "@/components/DateSelector";
import AddressSearch from "@/components/AddressSearch";
import RouteMap from "@/components/RouteMap";
import BestFitCard from "@/components/BestFitCard";
import CleanerResults from "@/components/CleanerResults";
import { Booking, GeoPoint } from "@/types/booking";
import { CleanerRoute, RouteStop } from "@/types/route";
import { RankedCandidate, InsertionCandidate } from "@/types/recommendation";
import { ClientRoutingProvider } from "@/lib/routing/ClientRoutingProvider";
import { buildRoutesForDate } from "@/lib/route-analysis/buildRoutes";
import { rankInsertionsAcrossRoutes } from "@/lib/route-analysis/insertion";

export default function Home() {
  // The RoutingProvider instance is stable for the whole session so its
  // internal geocode/route caches persist across searches.
  const routingProviderRef = useRef(new ClientRoutingProvider());

  const [allBookings, setAllBookings] = useState<Booking[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [routes, setRoutes] = useState<CleanerRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);

  const [newAddress, setNewAddress] = useState<string | null>(null);
  const [newLocation, setNewLocation] = useState<GeoPoint | null>(null);
  const [addressAdjusted, setAddressAdjusted] = useState(false);

  const [candidates, setCandidates] = useState<RankedCandidate[] | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [selectedTeamKey, setSelectedTeamKey] = useState<string | null>(null);
  const [addingTemp, setAddingTemp] = useState(false);

  const availableDates = useMemo(() => {
    if (!allBookings) return [];
    return [...new Set(allBookings.map((b) => b.date))].sort();
  }, [allBookings]);

  function resetForNewDate(date: string) {
    setSelectedDate(date);
    setNewAddress(null);
    setNewLocation(null);
    setAddressAdjusted(false);
    setCandidates(null);
    setFindError(null);
    setSelectedTeamKey(null);
    setRoutes([]);
    void loadRoutesForDate(date);
  }

  async function loadRoutesForDate(date: string) {
    if (!allBookings) return;
    setLoadingRoutes(true);
    try {
      const { routes } = await buildRoutesForDate(
        allBookings,
        date,
        routingProviderRef.current
      );
      setRoutes(routes);
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

  const bestCandidate =
    candidates?.find((c): c is InsertionCandidate => !c.excluded) ?? null;
  const otherCandidates = candidates?.filter((c) => c !== bestCandidate) ?? [];

  const selectedRoute = routes.find((r) => r.teamKey === selectedTeamKey);
  const selectedCandidate =
    candidates?.find((c): c is InsertionCandidate => !c.excluded && c.teamKey === selectedTeamKey) ?? null;

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200 bg-white px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold">Cleaner Route Finder</h1>
      </header>

      <section className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 space-y-4">
        <CsvUploader
          onLoaded={(bookings) => {
            setAllBookings(bookings);
            setSelectedDate(null);
            setRoutes([]);
            setCandidates(null);
            setNewAddress(null);
            setNewLocation(null);
          }}
          loadedCount={allBookings?.length ?? null}
          dateCount={availableDates.length || null}
        />

        {allBookings && (
          <DateSelector
            availableDates={availableDates}
            selectedDate={selectedDate}
            onChange={resetForNewDate}
          />
        )}

        {selectedDate && (
          <AddressSearch
            routingProvider={routingProviderRef.current}
            onFind={handleFind}
            busy={finding}
            error={findError}
          />
        )}
      </section>

      {selectedDate && routes.length === 0 && !loadingRoutes && (
        <p className="px-4 sm:px-6 py-6 text-sm text-gray-500">
          No Launch27 bookings found for this date.
        </p>
      )}

      {selectedDate && (loadingRoutes || routes.length > 0) && (
        <div className="flex-1 flex flex-col lg:flex-row min-h-[500px]">
          <div className="flex-1 min-h-[320px] lg:min-h-0 p-4 sm:p-6">
            <RouteMap
              routes={routes}
              newProperty={newLocation && newAddress ? { location: newLocation, address: newAddress } : null}
              previewGeometry={selectedCandidate?.previewGeometry}
              previewColor={selectedRoute?.color}
              onMarkerDrag={recalculateAfterDrag}
            />
          </div>

          <aside className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-gray-200 bg-white p-4 sm:p-6 space-y-4 overflow-y-auto">
            {loadingRoutes && (
              <p className="text-sm text-gray-500">Loading routes…</p>
            )}

            {!loadingRoutes && !candidates && (
              <p className="text-sm text-gray-500">
                Enter a new cleaning location above and click Find Best Cleaner.
              </p>
            )}

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

            {candidates && (
              <CleanerResults
                candidates={otherCandidates}
                onSelect={setSelectedTeamKey}
                selectedTeamKey={selectedTeamKey}
              />
            )}
          </aside>
        </div>
      )}

      {!allBookings && (
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-gray-400 text-sm">Upload a Launch27 export to get started.</p>
        </div>
      )}
    </main>
  );
}
