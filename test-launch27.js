const CONFIG = {
  subdomain: process.env.LAUNCH27_SUBDOMAIN,
  email: process.env.LAUNCH27_EMAIL,
  password: process.env.LAUNCH27_PASSWORD,
  otp: process.env.LAUNCH27_OTP || undefined,

  targetDate: "2026-08-26",
  timezone: "America/Phoenix",
};

function baseUrl() {
  if (!CONFIG.subdomain) {
    throw new Error("Set LAUNCH27_SUBDOMAIN first.");
  }
  return `https://${CONFIG.subdomain}.launch27.com/v1`;
}

function arizonaDate(value) {
  if (!value) return "";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function login() {
  console.log(`\n1) Logging in as ${CONFIG.email} ...`);

  const body = {
    email: CONFIG.email,
    password: CONFIG.password,
  };

  if (CONFIG.otp) body.token = CONFIG.otp;

  const res = await fetch(`${baseUrl()}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Login response wasn't JSON (${res.status}): ${text.slice(0, 300)}`
    );
  }

  if (res.status === 403 && data.error === "OTP token is required") {
    throw new Error(
      "2FA is enabled. Set LAUNCH27_OTP=123456 and run again."
    );
  }

  if (!res.ok) {
    throw new Error(
      `Login failed (${res.status}): ${JSON.stringify(data)}`
    );
  }

  console.log("   ✓ Login succeeded");
  console.log(`   User type: ${data.type}`);

  return data.bearer;
}

function summarize(bookings) {
  if (!Array.isArray(bookings)) {
    return {
      returned: null,
      targetCount: null,
      dates: [],
      error: "Response was not a booking array",
    };
  }

  const counts = {};

  for (const b of bookings) {
    const date =
      arizonaDate(b.service_date) ||
      "(missing/invalid service_date)";

    counts[date] = (counts[date] || 0) + 1;
  }

  const target = bookings.filter(
    b => arizonaDate(b.service_date) === CONFIG.targetDate
  );

  return {
    returned: bookings.length,
    targetCount: target.length,
    dates: Object.entries(counts)
      .sort()
      .map(([date, count]) => `${date} (${count})`),
    targetBookings: target,
  };
}

async function testRequest(bearer, label, query) {
  const url = `${baseUrl()}/staff/bookings?${query}`;

  console.log("\n============================================================");
  console.log(label);
  console.log("============================================================");
  console.log(url);

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: "application/json",
      },
    });

    const text = await res.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      console.log(`HTTP ${res.status}`);
      console.log(`Non-JSON response: ${text.slice(0, 500)}`);
      return;
    }

    console.log(`HTTP: ${res.status}`);

    if (!res.ok) {
      console.log("ERROR:", JSON.stringify(data));
      return;
    }

    const result = summarize(data);

    if (result.error) {
      console.log(result.error);
      return;
    }

    console.log(`Returned: ${result.returned}`);

    console.log(
      `Bookings whose Arizona service_date = ${CONFIG.targetDate}: ${result.targetCount}`
    );

    console.log("\nDates returned:");

    for (const date of result.dates) {
      console.log(`  ${date}`);
    }

    if (result.targetCount > 0) {
      console.log(
        `\n✓ THIS QUERY FOUND ${result.targetCount} BOOKING(S) FOR ${CONFIG.targetDate}`
      );

      console.log("\nMatching booking IDs:");

      for (const b of result.targetBookings) {
        console.log(
          `  ID=${b.id} | service_date=${b.service_date} | ` +
          `active=${b.active} | completed=${b.completed}`
        );
      }
    }
  } catch (err) {
    console.log(`REQUEST ERROR: ${err.message}`);
  }
}

async function main() {
  try {
    if (!CONFIG.email || !CONFIG.password) {
      throw new Error(
        "Set LAUNCH27_EMAIL and LAUNCH27_PASSWORD first."
      );
    }

    console.log("============================================================");
    console.log(" Launch27 Date Parameter Test");
    console.log("============================================================");
    console.log(`Target date: ${CONFIG.targetDate}`);
    console.log(`Timezone: ${CONFIG.timezone}`);

    const bearer = await login();

    // Test 1: existing parameter
    await testRequest(
      bearer,
      "TEST 1 — date",
      `date=${CONFIG.targetDate}&options=exclude_forecasted`
    );

    // Test 2: start_date / end_date
    await testRequest(
      bearer,
      "TEST 2 — start_date + end_date",
      `start_date=${CONFIG.targetDate}&end_date=${CONFIG.targetDate}&options=exclude_forecasted`
    );

    // Test 3: from / to
    await testRequest(
      bearer,
      "TEST 3 — from + to",
      `from=${CONFIG.targetDate}&to=${CONFIG.targetDate}&options=exclude_forecasted`
    );

    // Test 4: start / end
    await testRequest(
      bearer,
      "TEST 4 — start + end",
      `start=${CONFIG.targetDate}&end=${CONFIG.targetDate}&options=exclude_forecasted`
    );

    // Test 5: service_date
    await testRequest(
      bearer,
      "TEST 5 — service_date",
      `service_date=${CONFIG.targetDate}&options=exclude_forecasted`
    );

    // Test 6: Arizona full-day timestamps
    await testRequest(
      bearer,
      "TEST 6 — Arizona timestamp range",
      `start_date=${encodeURIComponent(
        "2026-08-26T00:00:00-07:00"
      )}&end_date=${encodeURIComponent(
        "2026-08-26T23:59:59-07:00"
      )}&options=exclude_forecasted`
    );

    console.log("\n============================================================");
    console.log(" Test complete");
    console.log("============================================================");

  } catch (err) {
    console.error("\n❌ Test failed:", err.message);
    process.exit(1);
  }
}

main();