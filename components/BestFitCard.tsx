"use client";

import { InsertionCandidate } from "@/types/recommendation";
import { formatMiles, formatDuration } from "@/lib/route-analysis/formatMetrics";

type Props = {
  candidate: InsertionCandidate;
  onAddTemporary: () => void;
  adding: boolean;
};

export default function BestFitCard({ candidate, onAddTemporary, adding }: Props) {
  return (
    <div className="rounded-xl border-2 border-brand-500 bg-brand-50 p-4">
      <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">
        ⭐ Best Fit
      </p>
      <div className="flex items-center gap-2 mt-1">
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: candidate.color }}
        />
        <h3 className="text-lg font-bold">{candidate.teamLabel}</h3>
      </div>

      <div className="mt-2 flex gap-4 text-sm">
        <span className="font-medium text-gray-800">
          {formatMiles(candidate.additionalDistanceMeters)}
        </span>
        <span className="font-medium text-gray-800">
          {formatDuration(candidate.additionalDurationSeconds)}
        </span>
      </div>

      <p className="mt-2 text-sm text-gray-600 break-words">{candidate.insertionLabel}</p>

      <button
        onClick={onAddTemporary}
        disabled={adding}
        className="mt-3 w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
      >
        {adding ? "Adding…" : "Add to Temporary Route"}
      </button>
    </div>
  );
}
