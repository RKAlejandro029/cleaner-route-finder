import { GeoPoint } from "@/types/booking";
import { getAccessToken, getSpreadsheetId } from "./googleSheetsAuth";

/**
 * Since Lessen tasks are now fetched LIVE on every request (no more
 * scheduled sync), this tab exists purely to avoid re-geocoding the same
 * address every time — geocoding is the only part worth caching here.
 *
 * Sheet tab: "LessenGeocodeCache", columns: Address | Latitude | Longitude | UpdatedAt
 */

const SHEET_TAB = "LessenGeocodeCache";
const SHEET_RANGE = `${SHEET_TAB}!A2:D`;

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
    throw new Error(`Google Sheets request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

export async function loadGeocodeCache(): Promise<Map<string, GeoPoint>> {
  const map = new Map<string, GeoPoint>();
  try {
    const data = await sheetsFetch(`/values/${encodeURIComponent(SHEET_RANGE)}`);
    const rows: string[][] = data.values ?? [];
    for (const row of rows) {
      const address = row[0];
      const lat = row[1];
      const lng = row[2];
      if (address && lat && lng) {
        map.set(address, { lat: parseFloat(lat), lng: parseFloat(lng) });
      }
    }
  } catch {
    // Sheet/tab not set up yet — return empty, everything just geocodes fresh.
  }
  return map;
}

export async function appendGeocodeCacheRow(address: string, location: GeoPoint): Promise<void> {
  try {
    await sheetsFetch(`/values/${encodeURIComponent(SHEET_RANGE)}:append?valueInputOption=RAW`, {
      method: "POST",
      body: JSON.stringify({
        values: [[address, location.lat, location.lng, new Date().toISOString()]],
      }),
    });
  } catch {
    // Best-effort — a failed cache write just means this address gets
    // re-geocoded next time, not a broken app.
  }
}
