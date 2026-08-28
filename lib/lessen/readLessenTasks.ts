import { LessenTask } from "@/types/lessen";
import { getAccessToken, getSpreadsheetId } from "@/lib/cache/googleSheetsAuth";
import { RoutingProvider } from "@/lib/routing/RoutingProvider";

const SHEET_TAB = "LessenTasks";
const SHEET_RANGE = `${SHEET_TAB}!A2:Q`;

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

/**
 * Reads every row from the LessenTasks tab (written by the scheduled
 * GitHub Actions sync — see scripts/lessen-sync.js). Any row missing
 * lat/lng is geocoded here and written back to the sheet, so repeat
 * page loads don't re-geocode the same address twice.
 */
export async function loadLessenTasks(routingProvider: RoutingProvider): Promise<LessenTask[]> {
  let rows: string[][] = [];
  try {
    const data = await sheetsFetch(`/values/${encodeURIComponent(SHEET_RANGE)}`);
    rows = data.values ?? [];
  } catch {
    // Sheet/tab not set up yet, or sync hasn't run — just return nothing
    // rather than breaking the whole app.
    return [];
  }

  const tasks: LessenTask[] = [];
  const rowsNeedingGeocode: { rowNumber: number; task: LessenTask }[] = [];

  rows.forEach((row, i) => {
    const [
      taskTypeIdStr, taskTypeName, woId, taskId, address, city, state, zip,
      clientName, serviceCodeName, scheduleStartTime, scheduleEndTime,
      technicianName, overDueTime, latStr, lngStr,
    ] = row;

    if (!woId || !address) return;

    const hasLatLng = latStr && lngStr && !Number.isNaN(parseFloat(latStr)) && !Number.isNaN(parseFloat(lngStr));

    const task: LessenTask = {
      taskTypeId: parseInt(taskTypeIdStr ?? "0", 10) || 0,
      taskTypeName: taskTypeName ?? "Unknown",
      woId,
      taskId: taskId ?? "",
      address,
      city: city ?? "",
      state: state ?? "",
      zipCode: zip ?? "",
      clientName: clientName ?? "",
      serviceCodeName: serviceCodeName ?? "",
      scheduleStartTime: scheduleStartTime ?? "",
      scheduleEndTime: scheduleEndTime ?? "",
      technicianName: technicianName ?? "",
      overDueTime: overDueTime ?? "",
      location: hasLatLng ? { lat: parseFloat(latStr), lng: parseFloat(lngStr) } : null,
    };

    tasks.push(task);
    if (!hasLatLng) rowsNeedingGeocode.push({ rowNumber: i + 2, task });
  });

  // Geocode anything missing coordinates, best-effort, and write results
  // back so future loads skip it.
  await Promise.all(
    rowsNeedingGeocode.map(async ({ rowNumber, task }) => {
      try {
        const fullAddress = [task.address, task.city, task.state, task.zipCode]
          .filter(Boolean)
          .join(", ");
        const location = await routingProvider.geocode(fullAddress);
        task.location = location;

        await sheetsFetch(
          `/values/${encodeURIComponent(`${SHEET_TAB}!O${rowNumber}:P${rowNumber}`)}?valueInputOption=RAW`,
          {
            method: "PUT",
            body: JSON.stringify({ values: [[location.lat, location.lng]] }),
          }
        );
      } catch {
        // Leave location null — this task just won't render as a pin
        // until it geocodes successfully on a future load.
      }
    })
  );

  return tasks;
}
