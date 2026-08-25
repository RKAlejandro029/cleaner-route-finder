"use client";

import { formatDateForDisplay } from "@/lib/csv/formatHelpers";

type Props = {
  availableDates: string[]; // ISO dates, sorted
  selectedDate: string | null;
  onChange: (date: string) => void;
};

export default function DateSelector({ availableDates, selectedDate, onChange }: Props) {
  if (availableDates.length === 0) return null;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
      <select
        value={selectedDate ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full sm:w-72 min-h-[44px] px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="" disabled>
          Select a date
        </option>
        {availableDates.map((date) => (
          <option key={date} value={date}>
            {formatDateForDisplay(date)}
          </option>
        ))}
      </select>
    </div>
  );
}
