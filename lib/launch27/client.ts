import { Booking } from "@/types/booking";
import { Launch27LoginResponse, Launch27Settings, Launch27StaffBooking } from "./types";
import { mapLaunch27Booking } from "./mapBooking";

/**
 * Runs SERVER-SIDE ONLY. Never import this from a client component — it
 * reads staff credentials from environment variables and holds a bearer
 * token in memory.
 *
 * Token/timezone are cached at module scope. On Vercel this cache lives
 * for the lifetime of a warm serverless instance — it will re-fetch after
 * a cold start, which is fine at this request volume. We don't know the
 * JWT's actual expiry (not documented), so we also re-login automatically
 * if any request comes back 401.
 */

let cachedBearer: string | null = null;
let cachedTimezone: string | null = null;

function getConfig() {
  const subdomain = process.env.LAUNCH27_SUBDOMAIN;
  const email = process.env.LAUNCH27_EMAIL;
  const password = process.env.LAUNCH27_PASSWORD;
  const otp = process.env.LAUNCH27_OTP; // optional, only if 2FA is on

  if (!subdomain || !email || !password) {
    throw new Error(
      "Launch27 isn't configured. Set LAUNCH27_SUBDOMAIN, LAUNCH27_EMAIL, and LAUNCH27_PASSWORD."
    );
  }

  return {
    subdomain,
    email,
    password,
    otp,
    baseUrl: `https://${subdomain}.launch27.com/v1`,
  };
}

async function login(): Promise<string> {
  const { email, password, otp, baseUrl } = getConfig();

  const body: Record<string, string> = { email, password };
  if (otp) body.token = otp;

  const res = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Launch27 login failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data: Launch27LoginResponse = await res.json();

  if (data.type !== "Tenant::Admin" && data.type !== "Tenant::Staff") {
    throw new Error(
      `Launch27 login succeeded but user type is "${data.type}" — office-staff credentials are required for /staff/bookings.`
    );
  }

  cachedBearer = data.bearer;
  return data.bearer;
}

async function getTimezone(bearer: string): Promise<string> {
  if (cachedTimezone) return cachedTimezone;

  const { baseUrl } = getConfig();
  const res = await fetch(`${baseUrl}/settings`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });

  if (!res.ok) {
    // Fall back to a safe default rather than failing the whole load —
    // Arizona has no DST, so this is a reasonable fallback for this app,
    // but the real tenant timezone should always be fetched successfully.
    return "America/Phoenix";
  }

  const data: Launch27Settings = await res.json();
  cachedTimezone = data.timezone;
  return data.timezone;
}

async function fetchStaffBookingsPage(
  bearer: string,
  from: string,
  to: string,
  offset: number
): Promise<Launch27StaffBooking[]> {
  const { baseUrl } = getConfig();
  const url = `${baseUrl}/staff/bookings?from=${from}&to=${to}&limit=100&offset=${offset}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
  });

  if (res.status === 401) {
    // Token likely expired — force a fresh login and retry once.
    cachedBearer = null;
    const freshBearer = await login();
    const retryRes = await fetch(url, {
      headers: { Authorization: `Bearer ${freshBearer}` },
    });
    if (!retryRes.ok) {
      throw new Error(`Launch27 staff bookings request failed (${retryRes.status}) after re-login.`);
    }
    return retryRes.json();
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Launch27 staff bookings request failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Fetches and normalizes all bookings in [from, to] (YYYY-MM-DD, inclusive),
 * paginating through Launch27's 100-per-request limit automatically.
 * Cancelled/inactive bookings and any without usable coordinates are
 * dropped before returning.
 */
export async function fetchLaunch27Bookings(from: string, to: string): Promise<Booking[]> {
  const bearer = cachedBearer ?? (await login());
  const timezone = await getTimezone(bearer);

  const allRaw: Launch27StaffBooking[] = [];
  let offset = 0;
  const PAGE_SIZE = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await fetchStaffBookingsPage(cachedBearer ?? bearer, from, to, offset);
    allRaw.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    // Safety valve — never loop more than ~20 pages (2,000 bookings) for
    // one request, in case something upstream misbehaves.
    if (offset > 2000) break;
  }

  const bookings: Booking[] = [];
  for (const raw of allRaw) {
    if (raw.active === false) continue; // cancelled — exclude entirely
    const mapped = mapLaunch27Booking(raw, timezone);
    bookings.push(...mapped);
  }

  return bookings;
}
