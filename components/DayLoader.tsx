"use client";

import { useState } from "react";
import { Booking } from "@/types/booking";

type Props = {
  onLoaded: (date: string, bookings: Booking[]) => void;
  loadedDate: string | null;
  loadedCount: number | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DayLoader({ onLoaded, loadedDate, loadedCount }: Props) {
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad() {
    if (!date) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: date, to: date });
      const res = await fetch(`/api/launch27/bookings?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to load this date from Launch27.");
      }
      const data = await res.json();
      const bookings: Booking[] = data.bookings;

      if (bookings.length === 0) {
        setError("No Launch27 bookings found for this date.");
        onLoaded(date, []);
        return;
      }

      onLoaded(date, bookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this date from Launch27.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="min-h-[44px] px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={handleLoad}
          disabled={busy || !date}
          className="min-h-[44px] px-5 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? "Loading…" : "Load Day"}
        </button>
      </div>

      {loadedDate === date && loadedCount !== null && loadedCount > 0 && !error && (
        <p className="mt-2 text-sm text-green-700">
          ✓ {loadedCount} bookings loaded for this date
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
