/**
 * Lessen affiliate-one.lessen.com task/schedule puller.
 *
 * Modes:
 *   node test-lessen.js --login
 *     One-time: opens a real (visible) Chromium window so YOU log in by
 *     hand (password + 2FA/captcha if any). Once you land on the
 *     dashboard, press Enter in the terminal — saves session cookies to
 *     ./lessen-session.json.
 *
 *   node test-lessen.js
 *     Quick overall schedule: basic fields only, all task types, no
 *     per-item detail calls. Fast. Saves lessen-schedule.json.
 *
 *   node test-lessen.js --full
 *     Everything: every task type, full WODetail + visit overview (ovw)
 *     per item, plus available dates for any Pending Schedule items.
 *     Slower (one detail call per item). Saves lessen-all-tasks-full.json.
 *
 *   node test-lessen.js --pending-vendor-acceptance
 *   node test-lessen.js --pending
 *   node test-lessen.js --missed-check-in
 *   node test-lessen.js --missed-check-out
 *   node test-lessen.js --returntrip
 *   node test-lessen.js --reschedule-weather
 *   node test-lessen.js --deferred
 *     Same full-detail treatment as --full, but restricted to just that
 *     one task type. Each saves its own lessen-<type>.json file.
 *
 * Session cookies eventually expire — if requests start coming back
 * unauthorized, re-run with --login.
 *
 * Requires: npm install playwright   (then once: npx playwright install chromium)
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const CONFIG = {
  baseUrl: "https://affiliate-one.lessen.com",
  sessionFile: path.join(__dirname, "lessen-session.json"),
  pageSize: 100,
  // All task-type group IDs this portal's filter panel offers (confirmed
  // straight from a "select all" capture). Trim if you only ever want a
  // subset by default.
  taskTypeIds: [39, 49, 45, 46, 50, 95, 92],
};

const PENDING_SCHEDULE_TASK_TYPE_ID = 49;
const RETURN_TRIP_TASK_TYPE_ID = 50;

// Maps a CLI flag to a task type ID + a label used for console output and
// the output filename. Add/remove entries here if the portal's task types
// ever change.
const TASK_TYPE_FLAGS = {
  "--pending-vendor-acceptance": { id: 39, label: "Pending Vendor Acceptance", file: "lessen-pending-vendor-acceptance.json" },
  "--pending": { id: 49, label: "Pending Schedule", file: "lessen-pending-schedule.json" },
  "--missed-check-in": { id: 45, label: "Missed Check In", file: "lessen-missed-check-in.json" },
  "--missed-check-out": { id: 46, label: "Missed Check Out", file: "lessen-missed-check-out.json" },
  "--returntrip": { id: 50, label: "Return Trip Needed", file: "lessen-return-trips.json" },
  "--reschedule-weather": { id: 95, label: "Reschedule for Weather", file: "lessen-reschedule-weather.json" },
  "--deferred": { id: 92, label: "Deferred", file: "lessen-deferred.json" },
};

// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------

async function doInteractiveLogin() {
  console.log("Opening browser — log in manually, then come back here and press Enter.");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${CONFIG.baseUrl}/`);

  await new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
    console.log("\n>>> Press Enter once you're logged in and see your dashboard...");
  });

  const state = await context.storageState();
  fs.writeFileSync(CONFIG.sessionFile, JSON.stringify(state, null, 2));
  console.log(`\n✓ Session saved to ${CONFIG.sessionFile}`);

  await browser.close();
  process.exit(0);
}

async function getAffiliateId(request) {
  const res = await request.get(`${CONFIG.baseUrl}/Resource/GetUserInfoForMenu`);
  if (!res.ok()) {
    throw new Error(
      `Not logged in (HTTP ${res.status()}) — run "node test-lessen.js --login" first.`
    );
  }
  const data = await res.json();
  return { affiliateId: Number(data.affiliateId), userName: data.userName };
}

// ---------------------------------------------------------------------
// Task type names (discovered live, not hardcoded, in case the portal
// adds/renames a category later)
// ---------------------------------------------------------------------

async function getTaskTypeNames(request, affiliateId) {
  const res = await request.post(`${CONFIG.baseUrl}/TaskManager/GetFilterConditionsV2`, {
    data: { affiliateId, TaskTypeIds: CONFIG.taskTypeIds },
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });

  if (!res.ok()) return {};

  const data = await res.json();
  const map = {};
  for (const t of data.taskTypeGroup || []) {
    map[t.id] = t.name;
  }
  return map;
}

// ---------------------------------------------------------------------
// Basic (fast) task list — no per-item detail calls
// ---------------------------------------------------------------------

async function fetchAllTasks(request, affiliateId, taskTypeIds) {
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
        TaskTypeIds: taskTypeIds,
      },
      headers: { "Content-Type": "application/json; charset=UTF-8" },
    });

    if (!res.ok()) {
      throw new Error(`GetTaskInfoPageListV2 failed (HTTP ${res.status()}): ${await res.text()}`);
    }

    const data = await res.json();
    const items = data.Items || [];
    all.push(...items);

    console.log(
      `  page ${page}: got ${items.length} (running total ${all.length} / ${data.TotalItemsCount})`
    );

    if (all.length >= data.TotalItemsCount || items.length === 0) break;
    page += 1;
  }

  return all;
}

function summarizeByDate(tasks) {
  const byDate = {};
  for (const t of tasks) {
    const d = (t.ScheduleStartTime || "unscheduled").slice(0, 10);
    byDate[d] = (byDate[d] || 0) + 1;
  }
  return Object.entries(byDate).sort();
}

// ---------------------------------------------------------------------
// Full detail — list + WODetail + ovw (+ available dates for Pending
// Schedule items) for every task, across whichever task types you pass in
// ---------------------------------------------------------------------

function printTaskSummary(task, typeName, detail, overview, dates) {
  console.log(`\n  ── [${typeName}] WOId ${task.WOId} (Task ${task.TaskId}) ─────────────────`);
  console.log(`     Address:      ${task.Address}, ${task.City}, ${task.State} ${task.ZipCode}`);
  console.log(`     Client:       ${task.ClientName}`);
  console.log(`     Service:      ${task.ServiceCodeName}${task.ServiceCombo ? ` (${task.ServiceCombo})` : ""}`);
  console.log(`     Technician:   ${task.TechnicianName || "(unassigned)"}`);
  console.log(`     Scheduled:    ${task.ScheduleStartTime || "—"} to ${task.ScheduleEndTime || "—"}`);
  console.log(`     Overdue by:   ${task.OverDueTime || "—"}`);
  console.log(`     NTE:          ${task.AffiliateNTE != null ? `$${task.AffiliateNTE}` : "—"}`);

  if (detail) {
    console.log(`     Trade:        ${detail.TradeName || "—"}`);
    console.log(`     Priority ID:  ${detail.PriorityId ?? "—"}`);
    console.log(`     Problem:      ${detail.ProblemDescription || "—"}`);
    if (detail.AddtionalDetail) console.log(`     Notes:        ${detail.AddtionalDetail}`);
    if (detail.Instruction) console.log(`     Instructions: ${detail.Instruction}`);
    if (detail.AccesccInformation) console.log(`     Access info:  ${detail.AccesccInformation}`);
    console.log(`     Dispatched:   ${detail.DispatchTime || "—"}`);
    console.log(`     Accepted:     ${detail.AcceptOrDeclineTime || "—"}`);
    if (detail.IsTurn) console.log(`     Turn job:     yes`);
    if (detail.HelperTechnicians && detail.HelperTechnicians.length) {
      console.log(`     Helpers:      ${detail.HelperTechnicians.length}`);
    }
  } else {
    console.log(`     (WODetail unavailable)`);
  }

  if (overview) {
    console.log(`     Open days:    ${overview.openDays ?? "—"}`);
    console.log(`     Visit count:  ${overview.visitCount ?? "—"}`);
    console.log(`     Watchers:     ${overview.watchCount ?? "—"}`);
  }

  if (dates && dates.length) {
    console.log(`     Avail dates:  ${dates.join(", ")}`);
  }
}

async function fetchTasksWithFullDetail(request, affiliateId, taskTypeIds, typeNameMap) {
  const all = await fetchAllTasks(request, affiliateId, taskTypeIds);
  console.log(`Total tasks (all requested types): ${all.length}`);

  const enriched = [];
  const allAvailableDates = new Set();

  for (const task of all) {
    const woId = task.WOId;
    const locationId = task.LocationId;
    const typeName = typeNameMap[task.TaskTypeId] || `Type ${task.TaskTypeId}`;

    let detail = null;
    let overview = null;

    try {
      const res = await request.get(`${CONFIG.baseUrl}/reactiveWo/${woId}/WODetail`);
      if (res.ok()) {
        detail = await res.json();
      } else {
        console.log(`  ⚠ WOId ${woId}: WODetail failed (HTTP ${res.status()})`);
      }
    } catch (err) {
      console.log(`  ⚠ WOId ${woId}: WODetail error: ${err.message}`);
    }

    try {
      const res = await request.post(`${CONFIG.baseUrl}/reactiveWo/${woId}/ovw`);
      if (res.ok()) {
        overview = await res.json();
      }
    } catch {
      // non-critical, skip
    }

    let dates = [];
    if (task.TaskTypeId === PENDING_SCHEDULE_TASK_TYPE_ID) {
      try {
        const res = await request.get(
          `${CONFIG.baseUrl}/ResidentAvailableSchedule/GetAvailableScheduleTime`,
          { params: { woId, locationId } }
        );
        if (res.ok()) {
          const data = await res.json();
          const scheduleItems = data.scheduleItems || [];
          dates = scheduleItems
            .map(s => (s.date || s.Date || s.startTime || s.StartTime || "").slice(0, 10))
            .filter(Boolean);
          dates.forEach(d => allAvailableDates.add(d));
        }
      } catch (err) {
        console.log(`  ⚠ WOId ${woId}: availability error: ${err.message}`);
      }
    }

    printTaskSummary(task, typeName, detail, overview, dates);

    enriched.push({
      taskTypeId: task.TaskTypeId,
      taskTypeName: typeName,
      taskId: task.TaskId,
      woId,
      woNum: task.WoNum,
      clientName: task.ClientName,
      address: task.Address,
      city: task.City,
      state: task.State,
      zipCode: task.ZipCode,
      locationId,
      serviceCodeName: task.ServiceCodeName,
      overDueTime: task.OverDueTime,
      scheduleStartTime: task.ScheduleStartTime,
      scheduleEndTime: task.ScheduleEndTime,
      technicianName: task.TechnicianName,
      availableDates: dates,
      overview, // openDays, visitCount, watchCount, monthlyVisitCount
      detail,   // full WODetail payload
    });
  }

  return {
    total: all.length,
    byType: Object.fromEntries(
      Object.entries(
        enriched.reduce((acc, t) => {
          acc[t.taskTypeName] = (acc[t.taskTypeName] || 0) + 1;
          return acc;
        }, {})
      )
    ),
    allAvailableDates: [...allAvailableDates].sort(),
    items: enriched,
  };
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

async function main() {
  const loginMode = process.argv.includes("--login");
  const fullMode = process.argv.includes("--full");
  const matchedFlag = Object.keys(TASK_TYPE_FLAGS).find(flag => process.argv.includes(flag));

  if (loginMode) {
    await doInteractiveLogin();
    return;
  }

  if (!fs.existsSync(CONFIG.sessionFile)) {
    console.error(
      `No saved session found at ${CONFIG.sessionFile}.\nRun: node test-lessen.js --login`
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: CONFIG.sessionFile,
  });
  const request = context.request;

  try {
    console.log("Checking session...");
    const { affiliateId, userName } = await getAffiliateId(request);
    console.log(`✓ Logged in as ${userName} (affiliateId ${affiliateId})`);

    if (fullMode || matchedFlag) {
      const typeNameMap = await getTaskTypeNames(request, affiliateId);

      let taskTypeIds = CONFIG.taskTypeIds;
      let outFile = path.join(__dirname, "lessen-all-tasks-full.json");
      let label = "ALL task types";

      if (matchedFlag) {
        const { id, label: flagLabel, file } = TASK_TYPE_FLAGS[matchedFlag];
        taskTypeIds = [id];
        outFile = path.join(__dirname, file);
        label = flagLabel;
      }

      console.log(`\nFetching full detail for: ${label}...`);
      const result = await fetchTasksWithFullDetail(request, affiliateId, taskTypeIds, typeNameMap);

      console.log(`\n✓ Total: ${result.total}`);
      console.log("By type:");
      for (const [name, count] of Object.entries(result.byType)) {
        console.log(`  ${name}: ${count}`);
      }
      if (result.allAvailableDates.length) {
        console.log(`Available dates (Pending Schedule items): ${result.allAvailableDates.join(", ")}`);
      }

      fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
      console.log(`\nFull data saved to ${outFile}`);
      return;
    }

    console.log("\nFetching overall schedule (quick, no per-item detail)...");
    const tasks = await fetchAllTasks(request, affiliateId, CONFIG.taskTypeIds);

    console.log(`\n✓ Total tasks: ${tasks.length}`);
    console.log("\nBy scheduled date:");
    for (const [date, count] of summarizeByDate(tasks)) {
      console.log(`  ${date} (${count})`);
    }

    const outFile = path.join(__dirname, "lessen-schedule.json");
    fs.writeFileSync(outFile, JSON.stringify(tasks, null, 2));
    console.log(`\nFull data saved to ${outFile}`);
  } catch (err) {
    console.error("\n❌", err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();