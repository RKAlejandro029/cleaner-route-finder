/**
 * Standalone test script for the Google Sheets cache — run this LOCALLY
 * before relying on it inside the app.
 *
 * Usage:
 *   node test-google-sheets.js
 *
 * Set these environment variables first:
 *   GOOGLE_SHEETS_ID                  the spreadsheet ID (from its URL)
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL       e.g. xxx@yyy.iam.gserviceaccount.com
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY the full private key from the
 *                                      service account's downloaded JSON,
 *                                      including the BEGIN/END lines
 *
 * Setup steps (do this first, in Google Cloud Console):
 *   1. Create a project (or use an existing one)
 *   2. Enable the "Google Sheets API"
 *   3. Create a Service Account (IAM & Admin -> Service Accounts)
 *   4. Create a JSON key for it and download it
 *   5. Copy "client_email" -> GOOGLE_SERVICE_ACCOUNT_EMAIL
 *      Copy "private_key"  -> GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 *   6. Create a Google Sheet, add a tab named exactly "RouteCache"
 *   7. Share that Sheet with the service account's email as an EDITOR
 *      (service accounts have no Drive storage of their own — they only
 *      see sheets explicitly shared with them)
 *   8. Copy the spreadsheet ID from its URL:
 *      https://docs.google.com/spreadsheets/d/THIS_PART_IS_THE_ID/edit
 *
 * This script writes ONE test row to the RouteCache tab and reads it
 * back. Safe to run repeatedly — it just overwrites its own test row.
 */

const crypto = require("crypto");

const CONFIG = {
  spreadsheetId: process.env.GOOGLE_SHEETS_ID || "",
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
  privateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").includes("\\n")
    ? (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n")
    : process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "",
};

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken() {
  console.log("\n1) Authenticating as service account", CONFIG.email, "...");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: CONFIG.email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(CONFIG.privateKey));
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Token response wasn't JSON (status ${res.status}): ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(data)}`);
  }

  console.log("   ✓ Got access token");
  return data.access_token;
}

async function writeTestRow(token) {
  console.log("\n2) Writing a test row to the RouteCache tab...");

  const range = "RouteCache!A2:G2";
  const values = [
    [
      "2099-01-01",
      "test-team",
      "test-fingerprint",
      "1234",
      "567",
      JSON.stringify([{ lat: 33.4, lng: -111.7 }]),
      new Date().toISOString(),
    ],
  ];

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/${encodeURIComponent(
    range
  )}?valueInputOption=RAW`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Write failed (${res.status}): ${text.slice(0, 500)}`);
  }
  console.log("   ✓ Write succeeded");
}

async function readItBack(token) {
  console.log("\n3) Reading the RouteCache tab back...");

  const range = "RouteCache!A2:G2";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/${encodeURIComponent(
    range
  )}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Read response wasn't JSON (status ${res.status}): ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    throw new Error(`Read failed (${res.status}): ${JSON.stringify(data)}`);
  }

  console.log("   ✓ Read succeeded. Row contents:");
  console.log("  ", data.values?.[0]);
}

async function main() {
  try {
    if (!CONFIG.spreadsheetId || !CONFIG.email || !CONFIG.privateKey) {
      throw new Error(
        "Set GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY first."
      );
    }
    const token = await getAccessToken();
    await writeTestRow(token);
    await readItBack(token);
    console.log("\n✅ Test complete. Google Sheets caching is ready to use.\n");
  } catch (err) {
    console.error("\n❌ Test failed:", err.message);
    console.error(
      "\nCommon causes:\n" +
        "  - The sheet isn't shared with the service account email as an Editor\n" +
        "  - There's no tab named exactly \"RouteCache\" in the spreadsheet\n" +
        "  - The Sheets API isn't enabled on the Google Cloud project\n" +
        "  - The private key wasn't pasted correctly (should include BEGIN/END lines)\n"
    );
    process.exit(1);
  }
}

main();
