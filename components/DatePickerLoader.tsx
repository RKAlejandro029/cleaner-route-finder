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

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayIso(): string {
  const t = new Date();
  return toIso(t.getFullYear(), t.getMonth(), t.getDate());
}

export default function DatePickerLoader({ onDateSelected, activeDate, jobCount }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set([todayIso()]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingsByDate, setBookingsByDate] = useState<Map<string, Booking[]> | null>(null);

  function toggleDate(iso: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  }

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  async function handleSearch() {
    if (selectedDates.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const sortedSelected = [...selectedDates].sort();
      const from = sortedSelected[0];
      const to = sortedSelected[sortedSelected.length - 1];
      if (!from || !to) return;

      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/launch27/bookings?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to load these dates from Launch27.");
      }
      const data = await res.json();
      const bookings: Booking[] = data.bookings;

      // Fetching a range may include dates in between that weren't
      // actually clicked — only keep the ones the user selected.
      const map = new Map<string, Booking[]>();
      for (const b of bookings) {
        if (!selectedDates.has(b.date)) continue;
        const list = map.get(b.date) ?? [];
        list.push(b);
        map.set(b.date, list);
      }
      setBookingsByDate(map);

      const firstDate = sortedSelected[0];
      if (firstDate) onDateSelected(firstDate, map.get(firstDate) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load these dates.");
    } finally {
      setBusy(false);
    }
  }

  const loadedDates = bookingsByDate ? [...bookingsByDate.keys()].sort() : [];

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthLabel = firstOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Select Date(s)</label>

      <div className="border border-gray-200 rounded-lg p-3 bg-white">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => changeMonth(-1)}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="text-sm font-medium">{monthLabel}</span>
          <button
            onClick={() => changeMonth(1)}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 mb-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;
            const iso = toIso(viewYear, viewMonth, day);
            const isSelected = selectedDates.has(iso);
            return (
              <button
                key={iso}
                onClick={() => toggleDate(iso)}
                className={`aspect-square min-h-[36px] rounded-md text-sm flex items-center justify-center transition ${
                  isSelected
                    ? "bg-brand-600 text-white font-semibold"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-2">
        {selectedDates.size === 0
          ? "Click one or more dates above"
          : `${selectedDates.size} date${selectedDates.size === 1 ? "" : "s"} selected`}
      </p>

      <button
        onClick={handleSearch}
        disabled={busy || selectedDates.size === 0}
        className="mt-2 w-full min-h-[44px] px-5 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <Spinner className="w-4 h-4" />}
        {busy ? "Searching…" : "Search"}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {loadedDates.length > 1 && (
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1">Viewing:</label>
          <select
            value={activeDate ?? ""}
            onChange={(e) => {
              const d = e.target.value;
              onDateSelected(d, bookingsByDate!.get(d) ?? []);
            }}
            className="w-full min-h-[44px] px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {loadedDates.map((d) => {
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
