/**
 * Runs on a SCHEDULE inside GitHub Actions (not locally, not on Vercel).
 * Logs into Lessen automatically (email + password only, no 2FA per your
 * confirmation), pulls the task list, and writes it into a "LessenTasks"
 * tab in the same Google Sheet used for route caching.
 *
 * The Next.js app never runs Playwright itself — it only reads this
 * sheet tab. This script is the only thing that ever launches a browser.
 *
 * Required GitHub Actions secrets (Settings -> Secrets and variables ->
 * Actions -> New repository secret):
 *   LESSEN_EMAIL
 *   LESSEN_PASSWORD
 *   GOOGLE_SHEETS_ID
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 *
 * ⚠️ LOGIN SELECTORS: I don't have Lessen's actual login page markup, so
 * the selectors below (`page.fill(...)`) are my best guess at a typical
 * email/password form. If this fails on first run, open the Actions log
 * — Playwright's error will show what it couldn't find — and adjust the
 * three `page.fill(...)` / `page.click(...)` lines below to match
 * Lessen's real field names/IDs. Everything else in this script doesn't
 * need to change.
 *
 * Local test run (uses the same secrets as env vars):
 *   LESSEN_EMAIL=... LESSEN_PASSWORD=... GOOGLE_SHEETS_ID=... \
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL=... GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=... \
 *   node scripts/lessen-sync.js
 */

const crypto = require("crypto");
const { chromium } = require("playwright");

const CONFIG = {
  baseUrl: "https://affiliate-one.lessen.com",
  pageSize: 100,
  taskTypeIds: [39, 49, 45, 46, 50, 95, 92],
};

const TASK_TYPE_LABELS = {
  39: "Pending Vendor Acceptance",
  49: "Pending Schedule",
  45: "Missed Check In",
  46: "Missed Check Out",
  50: "Return Trip Needed",
  95: "Reschedule for Weather",
  92: "Deferred",
};

const SHEET_TAB = "LessenTasks";
const SHEET_RANGE = `${SHEET_TAB}!A2:Q`;
const HEADER_ROW = [
  "TaskTypeId", "TaskTypeName", "WOId", "TaskId", "Address", "City", "State",
  "Zip", "ClientName", "ServiceCodeName", "ScheduleStartTime", "ScheduleEndTime",
  "TechnicianName", "OverDueTime", "Latitude", "Longitude", "UpdatedAt",
];

// ---------------------------------------------------------------------
// Google Sheets auth (same JWT-bearer pattern as the app's own
// lib/cache/googleSheetsAuth.ts, duplicated here since this script runs
// standalone outside the Next.js build)
// ---------------------------------------------------------------------

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getGoogleAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "";
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(privateKey));
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function sheetsFetch(path, init) {
  const token = await getGoogleAccessToken();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init && init.headers),
    },
  });

  if (!res.ok) throw new Error(`Sheets request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function readExistingLatLng() {
  // Preserve previously-geocoded lat/lng across syncs (keyed by WOId) so
  // the app doesn't have to re-geocode every address on every sync.
  try {
    const data = await sheetsFetch(`/values/${encodeURIComponent(SHEET_RANGE)}`);
    const rows = data.values || [];
    const map = new Map();
    for (const row of rows) {
      const woId = row[2];
      const lat = row[14];
      const lng = row[15];
      if (woId && lat && lng) map.set(String(woId), { lat, lng });
    }
    return map;
  } catch {
    return new Map();
  }
}

async function writeTasksToSheet(tasks) {
  const existingLatLng = await readExistingLatLng();
  const now = new Date().toISOString();

  const values = tasks.map((t) => {
    const preserved = existingLatLng.get(String(t.woId));
    return [
      t.taskTypeId,
      t.taskTypeName,
      t.woId,
      t.taskId,
      t.address,
      t.city,
      t.state,
      t.zipCode,
      t.clientName,
      t.serviceCodeName,
      t.scheduleStartTime || "",
      t.scheduleEndTime || "",
      t.technicianName || "",
      t.overDueTime || "",
      preserved ? preserved.lat : "",
      preserved ? preserved.lng : "",
      now,
    ];
  });

  // Overwrite the whole tab each run — clears completed/removed tasks
  // automatically. Header row is written once and left alone thereafter.
  await sheetsFetch(`/values/${encodeURIComponent(SHEET_TAB)}!A1:Q1?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [HEADER_ROW] }),
  });

  // Clear old data rows first (in case this run has fewer tasks than last time)
  await sheetsFetch(`/values/${encodeURIComponent(SHEET_TAB)}!A2:Q10000:clear`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  if (values.length > 0) {
    await sheetsFetch(`/values/${encodeURIComponent(SHEET_RANGE)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values }),
    });
  }

  console.log(`✓ Wrote ${values.length} tasks to the "${SHEET_TAB}" tab.`);
}

// ---------------------------------------------------------------------
// Lessen login + fetch (adapted from test-lessen.js, login automated)
// ---------------------------------------------------------------------

async function login(page) {
  await page.goto(`${CONFIG.baseUrl}/`);

  // ⚠️ ADJUST THESE THREE LINES if they don't match Lessen's real login
  // form. Common alternatives to try: 'input[name="email"]',
  // '#Email', '#username', 'input[name="UserName"]'.
  await page.fill('input[type="email"], input[name="email"], #Email', process.env.LESSEN_EMAIL);
  await page.fill('input[type="password"], input[name="password"], #Password', process.env.LESSEN_PASSWORD);
  await page.click('button[type="submit"], input[type="submit"]');

  await page.waitForLoadState("networkidle");
}

async function getAffiliateId(request) {
  const res = await request.get(`${CONFIG.baseUrl}/Resource/GetUserInfoForMenu`);
  if (!res.ok()) throw new Error(`Not logged in (HTTP ${res.status()}) — check login selectors/credentials.`);
  const data = await res.json();
  return { affiliateId: Number(data.affiliateId), userName: data.userName };
}

async function getTaskTypeNames(request, affiliateId) {
  const res = await request.post(`${CONFIG.baseUrl}/TaskManager/GetFilterConditionsV2`, {
    data: { affiliateId, TaskTypeIds: CONFIG.taskTypeIds },
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
  if (!res.ok()) return TASK_TYPE_LABELS;
  const data = await res.json();
  const map = {};
  for (const t of data.taskTypeGroup || []) map[t.id] = t.name;
  return { ...TASK_TYPE_LABELS, ...map };
}

async function fetchAllTasks(request, affiliateId) {
  const all = [];
  let page = 1;

  while (true) {
    const res = await request.post(`${CONFIG.baseUrl}/TaskManager/GetTaskInfoPageListV2`, {
      data: {
        page,
        pageSize: CONFIG.pageSize,
        orderBy: "",
        asc: false,
        affiliateId,
        flag: -1,
        TaskTypeIds: CONFIG.taskTypeIds,
      },
      headers: { "Content-Type": "application/json; charset=UTF-8" },
    });

    if (!res.ok()) throw new Error(`GetTaskInfoPageListV2 failed (${res.status()}): ${await res.text()}`);

    const data = await res.json();
    const items = data.Items || [];
    all.push(...items);
    console.log(`  page ${page}: ${items.length} (total ${all.length} / ${data.TotalItemsCount})`);

    if (all.length >= data.TotalItemsCount || items.length === 0) break;
    page += 1;
  }

  return all;
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

async function main() {
  const required = [
    "LESSEN_EMAIL", "LESSEN_PASSWORD", "GOOGLE_SHEETS_ID",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log("Logging into Lessen...");
    await login(page);

    const request = context.request;
    const { affiliateId, userName } = await getAffiliateId(request);
    console.log(`✓ Logged in as ${userName} (affiliateId ${affiliateId})`);

    const typeNameMap = await getTaskTypeNames(request, affiliateId);

    console.log("Fetching tasks...");
    const rawTasks = await fetchAllTasks(request, affiliateId);
    console.log(`✓ Got ${rawTasks.length} tasks total`);

    const tasks = rawTasks.map((t) => ({
      taskTypeId: t.TaskTypeId,
      taskTypeName: typeNameMap[t.TaskTypeId] || `Type ${t.TaskTypeId}`,
      woId: t.WOId,
      taskId: t.TaskId,
      address: t.Address,
      city: t.City,
      state: t.State,
      zipCode: t.ZipCode,
      clientName: t.ClientName,
      serviceCodeName: t.ServiceCodeName,
      scheduleStartTime: t.ScheduleStartTime,
      scheduleEndTime: t.ScheduleEndTime,
      technicianName: t.TechnicianName,
      overDueTime: t.OverDueTime,
    }));

    await writeTasksToSheet(tasks);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
