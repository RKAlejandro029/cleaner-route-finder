import { GeoPoint } from "@/types/booking";
import { getAccessToken, getSpreadsheetId } from "./googleSheetsAuth";

/**
 * Cache sheet layout (tab name: "RouteCache"), row 1 = headers:
 *   A: Date          (YYYY-MM-DD)
 *   B: TeamKey
 *   C: Fingerprint    (see lib/route-analysis/fingerprint.ts)
 *   D: DistanceMeters
 *   E: DurationSeconds
 *   F: GeometryJSON   (JSON array of {lat,lng})
 *   G: UpdatedAt      (ISO timestamp, for humans skimming the sheet)
 *
 * One whole-sheet read happens per date load (cheap — a single Sheets API
 * call regardless of how many teams that day has); writes happen only for
 * teams whose fingerprint changed (a cache miss).
 */

const SHEET_TAB = "RouteCache";
const SHEET_RANGE = `${SHEET_TAB}!A2:G`;

export type CachedRoute = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: GeoPoint[];
};

type CacheRow = CachedRoute & {
  fingerprint: string;
  rowNumber: number; // 1-indexed sheet row, for targeted updates
};

async function sheetsFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const spreadsheetId = getSpreadsheetId();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Sheets request failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Reads the whole cache sheet once and returns a lookup keyed by
 * "date|teamKey". Failures here are treated as "no cache available" —
 * routing still works, it just always fetches fresh, so a Sheets outage
 * never breaks the app.
 */
export async function loadCacheIndex(): Promise<Map<string, CacheRow>> {
  const index = new Map<string, CacheRow>();

  try {
    const data = await sheetsFetch(`/values/${encodeURIComponent(SHEET_RANGE)}`);
    const rows: string[][] = data.values ?? [];

    rows.forEach((row, i) => {
      const date = row[0];
      const teamKey = row[1];
      const fingerprint = row[2] ?? "";
      const distanceStr = row[3] ?? "0";
      const durationStr = row[4] ?? "0";
      const geometryJson = row[5];
      if (!date || !teamKey) return;

      try {
        index.set(`${date}|${teamKey}`, {
          fingerprint,
          distanceMeters: parseFloat(distanceStr) || 0,
          durationSeconds: parseFloat(durationStr) || 0,
          geometry: geometryJson ? JSON.parse(geometryJson) : [],
          rowNumber: i + 2, // +2: 1-indexed, plus header row
        });
      } catch {
        // Malformed row — skip it, treat as a cache miss for that key
      }
    });
  } catch {
    // Sheets unavailable/misconfigured — return an empty index so every
    // lookup is a cache miss and the app falls back to always routing.
  }

  return index;
}

/**
 * Writes (updates or appends) one team's cached route for a date. Best-
 * effort — if this fails, the computed route is still returned to the
 * user, it just won't be cached for next time.
 */
export async function upsertCacheRow(
  date: string,
  teamKey: string,
  fingerprint: string,
  route: CachedRoute,
  existingRowNumber?: number
): Promise<void> {
  const values = [
    [
      date,
      teamKey,
      fingerprint,
      String(route.distanceMeters),
      String(route.durationSeconds),
      JSON.stringify(route.geometry),
      new Date().toISOString(),
    ],
  ];

  try {
    if (existingRowNumber) {
      const range = `${SHEET_TAB}!A${existingRowNumber}:G${existingRowNumber}`;
      await sheetsFetch(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ values }),
      });
    } else {
      await sheetsFetch(
        `/values/${encodeURIComponent(SHEET_RANGE)}:append?valueInputOption=RAW`,
        {
          method: "POST",
          body: JSON.stringify({ values }),
        }
      );
    }
  } catch {
    // Non-fatal — see comment above.
  }
}
