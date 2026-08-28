"use client";

import { useEffect, useRef, useState } from "react";
import { RoutingProvider, GeocodeSuggestion } from "@/lib/routing/RoutingProvider";

type Props = {
  routingProvider: RoutingProvider;
  onFind: (address: string) => void;
  busy: boolean;
  error: string | null;
  prefillAddress?: string | null;
};

export default function AddressSearch({ routingProvider, onFind, busy, error, prefillAddress }: Props) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Populated when the caller sets it (e.g. clicking a Lessen pin on the
  // map). Intentionally a one-way sync — typing afterward is unaffected.
  useEffect(() => {
    if (prefillAddress) setValue(prefillAddress);
  }, [prefillAddress]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await routingProvider.autocomplete(value);
      setSuggestions(results);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, routingProvider]);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        New Cleaning Location
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="1234 E Main St, Mesa, AZ"
          className="flex-1 min-h-[44px] px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={() => value.trim() && onFind(value.trim())}
          disabled={busy || value.trim().length === 0}
          className="min-h-[44px] px-5 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 active:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? "Finding…" : "Find Best Cleaner"}
        </button>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-w-xl bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={() => {
                setValue(s.label);
                setShowSuggestions(false);
                onFind(s.label);
              }}
              className="px-3 py-2.5 text-sm hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
