"use client";

import { useState } from "react";
import { Booking } from "@/types/booking";
import { formatDateForDisplay } from "@/lib/csv/formatHelpers";
import Spinner from "@/components/Spinner";

type Props = {
  onDateSelected: (date: string, bookings: Booking[]) => void;
  activeDate: string | null;
  jobCount: number | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DateRangeLoader({ onDateSelected, activeDate, jobCount }: Props) {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingsByDate, setBookingsByDate] = useState<Map<string, Booking[]> | null>(null);

  async function handleLoadRange() {
    if (!from || !to) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/launch27/bookings?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to load this date range from Launch27.");
      }
      const data = await res.json();
      const bookings: Booking[] = data.bookings;

      const map = new Map<string, Booking[]>();
      for (const b of bookings) {
        const list = map.get(b.date) ?? [];
        list.push(b);
        map.set(b.date, list);
      }
      setBookingsByDate(map);

      const dates = [...map.keys()].sort();
      if (dates.length === 0) {
        setError("No bookings found in this date range.");
        return;
      }
      // Auto-select the earliest date in the range so there's something
      // to look at immediately, without an extra click.
      const firstDate = dates[0];
      if (firstDate) onDateSelected(firstDate, map.get(firstDate)!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this date range.");
    } finally {
      setBusy(false);
    }
  }

  const dates = bookingsByDate ? [...bookingsByDate.keys()].sort() : [];

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="min-h-[44px] px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <span className="self-center text-gray-400 text-sm hidden sm:inline">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="min-h-[44px] px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={handleLoadRange}
          disabled={busy || !from || !to}
          className="min-h-[44px] px-5 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-2"
        >
          {busy && <Spinner className="w-4 h-4" />}
          {busy ? "Loading…" : "Load Days"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {dates.length > 0 && (
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1">
            {dates.length} date{dates.length === 1 ? "" : "s"} loaded — pick one to view
          </label>
          <select
            value={activeDate ?? ""}
            onChange={(e) => {
              const d = e.target.value;
              onDateSelected(d, bookingsByDate!.get(d)!);
            }}
            className="w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {dates.map((d) => {
              const count = new Set((bookingsByDate!.get(d) ?? []).map((b) => b.bookingId)).size;
              return (
                <option key={d} value={d}>
                  {formatDateForDisplay(d)} — {count} job{count === 1 ? "" : "s"}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {activeDate && jobCount !== null && jobCount > 0 && (
        <p className="mt-2 text-sm text-green-700">
          ✓ Viewing {formatDateForDisplay(activeDate)} — {jobCount} jobs
        </p>
      )}
    </div>
  );
}
