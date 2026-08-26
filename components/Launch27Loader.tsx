"use client";

import { useState } from "react";
import { Booking } from "@/types/booking";
import { Launch27BookingDataSource } from "@/lib/data-source/Launch27BookingDataSource";

type Props = {
  onLoaded: (bookings: Booking[]) => void;
  loadedCount: number | null;
  dateCount: number | null;
};

function defaultRange() {
  const today = new Date();
  const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(today), to: fmt(in60Days) };
}

export default function Launch27Loader({ onLoaded, loadedCount, dateCount }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad() {
    setBusy(true);
    setError(null);
    try {
      const source = new Launch27BookingDataSource(defaultRange());
      const bookings = await source.loadBookings();
      if (bookings.length === 0) {
        setError("No bookings were found in the next 60 days.");
        return;
      }
      onLoaded(bookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the Launch27 schedule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Launch27 Schedule
      </label>

      <button
        onClick={handleLoad}
        disabled={busy}
        className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-lg bg-white border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
      >
        {busy ? "Loading…" : loadedCount ? "Reload Schedule" : "Load Schedule"}
      </button>

      {loadedCount !== null && !error && (
        <p className="mt-2 text-sm text-green-700">
          ✓ Launch27 schedule loaded — {loadedCount} bookings loaded, {dateCount} dates available
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
