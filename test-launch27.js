/**
 * Standalone test script for the Launch27/Automaid API — run this LOCALLY
 * against your sandbox before we wire anything into the app.
 *
 * Usage:
 *   node test-launch27.js
 *
 * Set these environment variables first (or edit the CONFIG block below):
 *   LAUNCH27_SUBDOMAIN   e.g. "acme" for acme.launch27.com
 *   LAUNCH27_EMAIL       staff login email
 *   LAUNCH27_PASSWORD    staff login password
 *   LAUNCH27_OTP         (optional) 6-digit 2FA code, only if your account has 2FA on
 *
 * This script does NOT modify or create anything in Launch27 — it only
 * logs in and reads bookings. Safe to run against your sandbox.
 */

const CONFIG = {
  subdomain: process.env.LAUNCH27_SUBDOMAIN || "leblanccleaning",
  email: process.env.LAUNCH27_EMAIL || "jana.createandreach@gmail.com",
  password: process.env.LAUNCH27_PASSWORD || "Cnr@2024",
  otp: process.env.LAUNCH27_OTP || undefined,
};

function baseUrl() {
  if (!CONFIG.subdomain) {
    throw new Error("Set LAUNCH27_SUBDOMAIN (e.g. 'acme' for acme.launch27.com)");
  }
  return `https://${CONFIG.subdomain}.launch27.com/v1`;
}

async function login() {
  console.log(`\n1) Logging in as ${CONFIG.email} at ${baseUrl()} ...`);

  const body = { email: CONFIG.email, password: CONFIG.password };
  if (CONFIG.otp) body.token = CONFIG.otp;

  const res = await fetch(`${baseUrl()}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Login response wasn't JSON (status ${res.status}): ${text.slice(0, 300)}`);
  }

  if (res.status === 403 && data.error === "OTP token is required") {
    throw new Error(
      "This account has 2FA enabled. Re-run with LAUNCH27_OTP=<6-digit code> set."
    );
  }

  if (!res.ok) {
    throw new Error(`Login failed (${res.status}): ${JSON.stringify(data)}`);
  }

  console.log("   ✓ Login succeeded");
  console.log(`   User type: ${data.type}`);
  console.log(`   User: ${data.first_name ?? ""} ${data.last_name ?? ""} <${data.email}>`);

  if (data.type !== "Tenant::Admin" && data.type !== "Tenant::Staff") {
    console.log(
      `   ⚠ WARNING: user type is "${data.type}", not an obvious staff/admin type.`
    );
    console.log(
      "     /staff/bookings may reject this token — if step 2 fails with 401/403,"
    );
    console.log("     you likely need office-staff credentials, not a customer login.");
  }

  return data.bearer;
}

async function fetchStaffBookings(bearer) {
  const today = new Date().toISOString().slice(0, 10);
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  console.log(`\n2) Fetching staff bookings from ${today} to ${in14Days} ...`);

  const url = `${baseUrl()}/staff/bookings?from=${today}&to=${in14Days}&limit=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
  });

  console.log(`   Rate limit remaining: ${res.headers.get("x-ratelimit-remaining") ?? "n/a"}`);

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Bookings response wasn't JSON (status ${res.status}): ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    throw new Error(`Fetching bookings failed (${res.status}): ${JSON.stringify(data)}`);
  }

  console.log(`   ✓ Got ${data.length} bookings`);
  return data;
}

function inspectShape(bookings) {
  console.log("\n3) Inspecting the shape of the first booking (if any)...\n");

  if (bookings.length === 0) {
    console.log("   No bookings in this date range — try widening the date range");
    console.log("   in this script, or check that your sandbox has seed data.");
    return;
  }

  const b = bookings[0];
  console.log("   id:              ", b.id);
  console.log("   service_date:    ", b.service_date);
  console.log("   duration:        ", b.duration);
  console.log("   booking_status:  ", b.booking_status);
  console.log("   active/completed:", b.active, "/", b.completed);
  console.log("   address:         ", JSON.stringify(b.address));
  console.log("   teams:           ", JSON.stringify(b.teams));

  const hasLatLng =
    b.address && typeof b.address.latitude === "number" && typeof b.address.longitude === "number";
  console.log(
    `\n   Has lat/lng on address: ${hasLatLng ? "YES ✓ (great — we can skip geocoding these)" : "NO — we'll need to geocode via ORS as before"}`
  );

  console.log("\n   Full raw JSON of first booking, for reference:\n");
  console.log(JSON.stringify(b, null, 2));
}

async function main() {
  try {
    if (!CONFIG.email || !CONFIG.password) {
      throw new Error(
        "Set LAUNCH27_EMAIL and LAUNCH27_PASSWORD environment variables first."
      );
    }
    const bearer = await login();
    const bookings = await fetchStaffBookings(bearer);
    inspectShape(bookings);
    console.log("\n✅ Test complete. Paste this output back so we can build the real integration.\n");
  } catch (err) {
    console.error("\n❌ Test failed:", err.message);
    process.exit(1);
  }
}

main();