"use client";

import { RankedCandidate } from "@/types/recommendation";
import { formatMiles, formatDuration } from "@/lib/route-analysis/formatMetrics";

type Props = {
  candidates: RankedCandidate[]; // all EXCEPT the top/best one
  onSelect: (teamKey: string) => void;
  selectedTeamKey: string | null;
};

export default function CleanerResults({ candidates, onSelect, selectedTeamKey }: Props) {
  if (candidates.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Other Options
      </p>
      <ul className="space-y-2">
        {candidates.map((c, i) => (
          <li key={c.teamKey}>
            {c.excluded ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
                  <span className="font-medium">{c.teamLabel}</span>
                </div>
                <p className="mt-1 text-xs">
                  Excluded from ranking: {c.reason}
                </p>
              </div>
            ) : (
              <button
                onClick={() => onSelect(c.teamKey)}
                className={`w-full text-left rounded-lg border p-3 min-h-[44px] transition ${
                  selectedTeamKey === c.teamKey
                    ? "border-brand-500 bg-brand-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-400 flex-shrink-0">{i + 2}.</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: c.color }}
                    />
                    <span className="font-medium truncate">{c.teamLabel}</span>
                  </div>
                  <div className="text-right text-xs text-gray-600 flex-shrink-0">
                    <div>{formatMiles(c.additionalDistanceMeters)}</div>
                    <div>{formatDuration(c.additionalDurationSeconds)}</div>
                  </div>
                </div>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
