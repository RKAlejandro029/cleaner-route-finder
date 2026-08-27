"use client";

import { CleanerRoute } from "@/types/route";

type Props = {
  routes: CleanerRoute[];
  selectedTeamKey: string | null;
  onToggle: (teamKey: string) => void;
};

export default function CleanerList({ routes, selectedTeamKey, onToggle }: Props) {
  if (routes.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Cleaners Today
      </p>
      <ul className="space-y-1">
        {routes.map((route) => {
          const isSelected = selectedTeamKey === route.teamKey;
          const isDimmed = selectedTeamKey !== null && !isSelected;

          return (
            <li key={route.teamKey}>
              <button
                onClick={() => onToggle(route.teamKey)}
                className={`w-full flex items-center gap-2 text-left rounded-lg border px-3 py-2 min-h-[44px] transition ${
                  isSelected
                    ? "border-gray-400 bg-gray-100"
                    : isDimmed
                    ? "border-transparent opacity-50 hover:opacity-100"
                    : "border-transparent hover:bg-gray-50"
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: route.color }}
                />
                <span className="font-medium text-sm truncate">{route.teamLabel}</span>
                <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
                  {route.stops.length} stop{route.stops.length === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {selectedTeamKey && (
        <p className="text-xs text-gray-400 mt-2">
          Showing only this cleaner's route. Click them again to show everyone.
        </p>
      )}
    </div>
  );
}
