import { LessenUserInfo, LessenRawTask } from "./types";

/**
 * Runs SERVER-SIDE ONLY. Logs into Lessen with plain HTTP requests — no
 * browser/Playwright needed, confirmed working against the real login
 * flow (standard ASP.NET anti-forgery token + a session cookie, not a
 * JWT). The session cookie is cached at module scope, same pattern as
 * lib/launch27/client.ts, and refreshed automatically if a request comes
 * back unauthenticated.
 */

const BASE_URL = "https://affiliate-one.lessen.com";
const PAGE_SIZE = 100;
const TASK_TYPE_IDS = [39, 49, 45, 46, 50, 95, 92];

const TASK_TYPE_LABELS: Record<number, string> = {
  39: "Pending Vendor Acceptance",
  49: "Pending Schedule",
  45: "Missed Check In",
  46: "Missed Check Out",
  50: "Return Trip Needed",
  95: "Reschedule for Weather",
  92: "Deferred",
};

let cachedCookieHeader: string | null = null;
let cachedAffiliateId: string | null = null;

function getConfig() {
  const email = process.env.LESSEN_EMAIL;
  const password = process.env.LESSEN_PASSWORD;
  if (!email || !password) {
    throw new Error("Lessen isn't configured. Set LESSEN_EMAIL and LESSEN_PASSWORD.");
  }
  return { email, password };
}

function extractCookieValue(setCookieHeaders: string[], name: string): string | null {
  for (const raw of setCookieHeaders) {
    const match = raw.match(new RegExp(`${name}=([^;]+)`));
    if (match && match[1]) return match[1];
  }
  return null;
}

function getSetCookies(res: Response): string[] {
  const anyHeaders = res.headers as any;
  if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie();
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

async function login(): Promise<string> {
  const { email, password } = getConfig();

  const getRes = await fetch(`${BASE_URL}/Account/Login`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const csrfCookie = extractCookieValue(getSetCookies(getRes), "__RequestVerificationToken");
  const html = await getRes.text();
  const tokenMatch = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  const formToken = tokenMatch ? tokenMatch[1] : null;

  if (!formToken) {
    throw new Error("Lessen login page markup changed — couldn't find the CSRF token field.");
  }

  const body = new URLSearchParams({
    UserName: email,
    Password: password,
    RememberMe: "true",
    utcOffset: "420", // Arizona: UTC-7, no DST
    isSupportDST: "false",
    __RequestVerificationToken: formToken,
  });

  const postRes = await fetch(`${BASE_URL}/Account/Login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: csrfCookie ? `__RequestVerificationToken=${csrfCookie}` : "",
      "User-Agent": "Mozilla/5.0",
      Referer: `${BASE_URL}/Account/Login`,
      Origin: BASE_URL,
    },
    body: body.toString(),
  });

  const setCookies = getSetCookies(postRes);
  const authCookie = extractCookieValue(setCookies, ".AspNet.ApplicationCookie");

  if (!authCookie) {
    throw new Error(`Lessen login failed (HTTP ${postRes.status}) — no session cookie returned.`);
  }

  const cookieMap: Record<string, string> = {
    ".AspNet.ApplicationCookie": authCookie,
  };
  for (const raw of setCookies) {
    const pair = raw.split(";")[0];
    if (!pair) continue;
    const [k, v] = pair.split("=");
    if (k && v && !cookieMap[k]) cookieMap[k] = v;
  }

  cachedCookieHeader = Object.entries(cookieMap)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  const userInfo = await fetchUserInfo(cachedCookieHeader);
  cachedAffiliateId = userInfo.affiliateId;

  return cachedCookieHeader;
}

async function fetchUserInfo(cookieHeader: string): Promise<LessenUserInfo> {
  const res = await fetch(`${BASE_URL}/Resource/GetUserInfoForMenu`, {
    headers: { Cookie: cookieHeader, "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Lessen GetUserInfoForMenu failed (${res.status})`);
  const data = await res.json();
  return { userId: data.userId, userName: data.userName, affiliateId: data.affiliateId };
}

async function authenticatedFetch(path: string, init: RequestInit): Promise<Response> {
  if (!cachedCookieHeader) await login();

  const doFetch = () =>
    fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Cookie: cachedCookieHeader!,
        "User-Agent": "Mozilla/5.0",
      },
    });

  let res = await doFetch();

  if (res.status === 401 || res.status === 403 || res.redirected) {
    cachedCookieHeader = null;
    await login();
    res = await doFetch();
  }

  return res;
}

async function getTaskTypeNames(affiliateId: string): Promise<Record<number, string>> {
  try {
    const res = await authenticatedFetch("/TaskManager/GetFilterConditionsV2", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ affiliateId, TaskTypeIds: TASK_TYPE_IDS }),
    });
    if (!res.ok) return TASK_TYPE_LABELS;
    const data = await res.json();
    const map: Record<number, string> = { ...TASK_TYPE_LABELS };
    for (const t of data.taskTypeGroup ?? []) map[t.id] = t.name;
    return map;
  } catch {
    return TASK_TYPE_LABELS;
  }
}

async function fetchAllRawTasks(affiliateId: string): Promise<LessenRawTask[]> {
  const all: LessenRawTask[] = [];
  let page = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await authenticatedFetch("/TaskManager/GetTaskInfoPageListV2", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        page,
        pageSize: PAGE_SIZE,
        orderBy: "",
        asc: false,
        affiliateId,
        flag: -1,
        TaskTypeIds: TASK_TYPE_IDS,
      }),
    });

    if (!res.ok) throw new Error(`Lessen GetTaskInfoPageListV2 failed (${res.status})`);

    const data = await res.json();
    const items: LessenRawTask[] = data.Items ?? [];
    all.push(...items);

    if (all.length >= data.TotalItemsCount || items.length === 0) break;
    page += 1;
    if (page > 20) break; // safety valve, mirrors Launch27 client's pagination cap
  }

  return all;
}

export type NormalizedLessenTask = {
  taskTypeId: number;
  taskTypeName: string;
  woId: string;
  taskId: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  clientName: string;
  serviceCodeName: string;
  scheduleStartTime: string;
  scheduleEndTime: string;
  technicianName: string;
  overDueTime: string;
};

/** Fetches every Lessen task live (all configured task types) and normalizes field names. */
export async function fetchLessenTasks(): Promise<NormalizedLessenTask[]> {
  if (!cachedCookieHeader) await login();
  const affiliateId = cachedAffiliateId!;

  const typeNameMap = await getTaskTypeNames(affiliateId);
  const raw = await fetchAllRawTasks(affiliateId);

  return raw
    .filter((t) => t.Address)
    .map((t) => ({
      taskTypeId: t.TaskTypeId,
      taskTypeName: typeNameMap[t.TaskTypeId] ?? `Type ${t.TaskTypeId}`,
      woId: String(t.WOId),
      taskId: String(t.TaskId),
      address: t.Address,
      city: t.City ?? "",
      state: t.State ?? "",
      zipCode: t.ZipCode ?? "",
      clientName: t.ClientName ?? "",
      serviceCodeName: t.ServiceCodeName ?? "",
      scheduleStartTime: t.ScheduleStartTime ?? "",
      scheduleEndTime: t.ScheduleEndTime ?? "",
      technicianName: t.TechnicianName ?? "",
      overDueTime: t.OverDueTime ?? "",
    }));
}
