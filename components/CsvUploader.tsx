"use client";

import { useRef, useState } from "react";
import { Booking } from "@/types/booking";
import { parseBookingsCsv } from "@/lib/csv/parseBookings";

type Props = {
  onLoaded: (bookings: Booking[]) => void;
  loadedCount: number | null;
  dateCount: number | null;
};

export default function CsvUploader({ onLoaded, loadedCount, dateCount }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setError(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("This file doesn't appear to be a valid Launch27 export.");
      return;
    }

    setBusy(true);
    try {
      const text = await file.text();
      const result = parseBookingsCsv(text);
      if (!result.success) {
        setError(result.message);
        return;
      }
      onLoaded(result.bookings);
    } catch {
      setError("Unable to load the CSV data. Please upload the Launch27 export again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Launch27 Export
      </label>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-lg bg-white border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
      >
        {busy ? "Loading…" : loadedCount ? "Replace CSV" : "Upload CSV"}
      </button>

      {loadedCount !== null && !error && (
        <p className="mt-2 text-sm text-green-700">
          ✓ Launch27 export loaded — {loadedCount} bookings loaded, {dateCount} dates available
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
