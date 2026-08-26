import crypto from "crypto";

/**
 * Runs SERVER-SIDE ONLY. Authenticates as a Google service account using
 * the standard JWT-bearer OAuth2 flow, without pulling in the heavy
 * `googleapis` SDK — just Node's built-in crypto module plus fetch.
 *
 * Requires a Google Cloud service account with the Sheets API enabled,
 * and the target spreadsheet shared with that service account's email
 * (as an Editor) — service accounts don't have their own Drive storage,
 * they only get access to sheets explicitly shared with them.
 */

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getConfig() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!email || !rawKey || !spreadsheetId) {
    throw new Error(
      "Google Sheets isn't configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_SHEETS_ID."
    );
  }

  // Private keys stored in env vars usually have literal "\n" instead of
  // real newlines (since env vars can't hold multi-line values cleanly).
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  return { email, privateKey, spreadsheetId };
}

async function fetchAccessToken(): Promise<{ accessToken: string; expiresAt: number }> {
  const { email, privateKey } = getConfig();

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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    // Refresh a little early to avoid edge-of-expiry failures
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }
  cachedToken = await fetchAccessToken();
  return cachedToken.accessToken;
}

export function getSpreadsheetId(): string {
  return getConfig().spreadsheetId;
}
