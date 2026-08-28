/**
 * Tests whether Lessen's login can be done with plain HTTP requests
 * instead of Playwright/a real browser — based on the network capture
 * you shared. Run this LOCALLY first.
 *
 * Usage:
 *   LESSEN_EMAIL=you@example.com LESSEN_PASSWORD=yourpassword node test-lessen-login.js
 *
 * This does NOT touch Google Sheets or anything else — it just tries to
 * log in and then makes one authenticated request to confirm the
 * session cookie actually works.
 */

const BASE_URL = "https://affiliate-one.lessen.com";

function extractCookieValue(setCookieHeaders, name) {
  for (const raw of setCookieHeaders) {
    const match = raw.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

function buildCookieHeader(cookieMap) {
  return Object.entries(cookieMap)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function main() {
  const email = process.env.LESSEN_EMAIL;
  const password = process.env.LESSEN_PASSWORD;
  if (!email || !password) {
    console.error("Set LESSEN_EMAIL and LESSEN_PASSWORD first.");
    process.exit(1);
  }

  const cookies = {};

  console.log("1) Loading the login page to get a fresh CSRF token...");
  const getRes = await fetch(`${BASE_URL}/Account/Login`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  // Node's fetch exposes multiple Set-Cookie headers via getSetCookie()
  // on newer Node versions; fall back to a single header otherwise.
  const setCookieHeaders =
    typeof getRes.headers.getSetCookie === "function"
      ? getRes.headers.getSetCookie()
      : [getRes.headers.get("set-cookie")].filter(Boolean);

  const csrfCookie = extractCookieValue(setCookieHeaders, "__RequestVerificationToken");
  if (csrfCookie) {
    cookies["__RequestVerificationToken"] = csrfCookie;
    console.log("   ✓ Got __RequestVerificationToken cookie");
  } else {
    console.log("   ⚠ No __RequestVerificationToken cookie found in response — continuing anyway");
  }

  const html = await getRes.text();
  const tokenMatch = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  const formToken = tokenMatch ? tokenMatch[1] : null;

  if (!formToken) {
    console.error("   ❌ Couldn't find the hidden __RequestVerificationToken field in the page HTML.");
    console.error("   The login page markup may have changed — paste me the new HTML.");
    process.exit(1);
  }
  console.log("   ✓ Got hidden form token");

  console.log("\n2) Submitting login...");
  const body = new URLSearchParams({
    UserName: email,
    Password: password,
    RememberMe: "true",
    utcOffset: "420", // Arizona is UTC-7 = 420 minutes behind, no DST
    isSupportDST: "false",
    __RequestVerificationToken: formToken,
  });

  const postRes = await fetch(`${BASE_URL}/Account/Login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: buildCookieHeader(cookies),
      "User-Agent": "Mozilla/5.0",
      Referer: `${BASE_URL}/Account/Login`,
      Origin: BASE_URL,
    },
    body: body.toString(),
  });

  console.log(`   Status: ${postRes.status}`);
  const postSetCookies =
    typeof postRes.headers.getSetCookie === "function"
      ? postRes.headers.getSetCookie()
      : [postRes.headers.get("set-cookie")].filter(Boolean);

  const authCookie = extractCookieValue(postSetCookies, ".AspNet.ApplicationCookie");

  if (!authCookie) {
    console.error("\n   ❌ No .AspNet.ApplicationCookie came back — login likely failed.");
    console.error("   Response body:", (await postRes.text()).slice(0, 500));
    console.error("\n   Common causes: wrong utcOffset/isSupportDST format, wrong credentials,");
    console.error("   or the CSRF token/cookie pairing didn't validate.");
    process.exit(1);
  }

  console.log("   ✓ Got .AspNet.ApplicationCookie — login appears to have succeeded!");
  cookies[".AspNet.ApplicationCookie"] = authCookie;

  // Carry forward any other cookies the server set too (harmless extras)
  for (const raw of postSetCookies) {
    const [pair] = raw.split(";");
    const [k, v] = pair.split("=");
    if (k && v && !cookies[k]) cookies[k] = v;
  }

  console.log("\n3) Confirming the session actually works (GetUserInfoForMenu)...");
  const checkRes = await fetch(`${BASE_URL}/Resource/GetUserInfoForMenu`, {
    headers: {
      Cookie: buildCookieHeader(cookies),
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!checkRes.ok) {
    console.error(`   ❌ Authenticated request failed (HTTP ${checkRes.status}) — session cookie may not be valid.`);
    process.exit(1);
  }

  const userInfo = await checkRes.json();
  console.log("   ✓ Authenticated successfully!");
  console.log("   User info:", JSON.stringify(userInfo, null, 2));

  console.log("\n✅ Plain-HTTP login works. Paste this output back and I'll rebuild the integration around it.");
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
