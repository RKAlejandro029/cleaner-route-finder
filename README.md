# Cleaner Route Finder (V1)

A read-only route analysis tool: given a date and a new, unassigned cleaning
address, it recommends which existing cleaner/team route can absorb the
property with the least additional driving.

It reads your live schedule directly from the Launch27/Automaid API — no
CSV export needed. It never writes to Launch27: no bookings are created,
edited, or assigned through this app.

## What this is NOT

No login for you (the app logs in with a dedicated staff account), no
database, no CRM, no scheduling, no automatic assignment. Refresh the page
and everything resets except the schedule itself, which reloads from
Launch27 fresh.

## Local setup

```bash
npm install
cp .env.example .env.local
# edit .env.local — add your Launch27 staff credentials and at least
# OPENROUTESERVICE_API_KEY
npm run dev
```

Open http://localhost:3000, pick a date, click **Load Day**.

## Launch27 setup

You need OFFICE STAFF credentials for this — not a customer login. The
app calls `POST /login`, and the response's `type` field must be
`Tenant::Admin` or `Tenant::Staff`; anything else (e.g. `Tenant::Customer`)
will be rejected before it ever reaches `/staff/bookings`.

```
LAUNCH27_SUBDOMAIN=leblanccleaning   # from https://leblanccleaning.launch27.com
LAUNCH27_EMAIL=staff@example.com
LAUNCH27_PASSWORD=your_staff_password
```

**2FA note:** if this staff account has two-factor authentication turned
on, `POST /login` will ask for a 6-digit OTP on top of the password. Since
this app logs in automatically with no human to type a fresh code each
time, a real TOTP-based 2FA won't work here — you'll need either a
dedicated service account with 2FA off, or to disable 2FA on this specific
account.

**What gets skipped automatically:** Launch27's API already returns
latitude/longitude on every booking's address, so this app skips
geocoding those addresses entirely — only the new property you type in
each search needs to be geocoded. This meaningfully cuts your daily
OpenRouteService/GraphHopper usage compared to the old CSV flow.

**Loading:** the app fetches exactly one date at a time — you pick a date
and click **Load Day**, and only that day's bookings are requested from
Launch27 (via `from=X&to=X`, the only query shape confirmed to reliably
filter by date; Launch27's own `?date=` parameter has been observed to
return unrelated results). This keeps every Launch27 API call small and
avoids pulling a wide date range you may not need.

## Routing provider fallback chain

Every geocode/autocomplete/route request tries providers in this order,
falling through automatically on error or quota exhaustion:

1. **OpenRouteService** (primary) — free, no card required
2. **GraphHopper** (fallback) — free tier, no card required
3. **Mapbox** (last resort) — free tier, requires a card on file

Only `OPENROUTESERVICE_API_KEY` is required to run the app. Adding
`GRAPHHOPPER_API_KEY` and/or `MAPBOX_ACCESS_TOKEN` is optional but
recommended once you're using this daily. Any provider missing its key is
simply skipped, so the app works fine with just one, two, or all three
configured.

The map display (OpenFreeMap) is unrelated to this chain — it's just
tiles/roads for the visual background and doesn't count against any of
these quotas.

## Getting an OpenRouteService API key

1. Sign up free at https://openrouteservice.org/dev/#/signup
2. Create a token (the free tier is plenty for this tool)
3. Put it in `.env.local` as `OPENROUTESERVICE_API_KEY`

## Getting a GraphHopper API key (optional, recommended)

1. Sign up free at https://www.graphhopper.com/dashboard/#/register
2. Create an API key from the dashboard
3. Put it in `.env.local` as `GRAPHHOPPER_API_KEY`

## Getting a Mapbox access token (optional)

1. Sign up at https://account.mapbox.com/auth/signup/ (may require a
   card, even for the free tier — this has changed over time, check at
   signup)
2. Copy your default public token, or create a new one
3. Put it in `.env.local` as `MAPBOX_ACCESS_TOKEN`

All keys/credentials are only ever read server-side, inside `app/api/*`
routes. The browser never sees any of them.

## Deploying to Vercel

1. Push this project to a GitHub repo
2. Import it in Vercel
3. Add the `OPENROUTESERVICE_API_KEY` environment variable in the Vercel
   project settings (Production + Preview)
4. Deploy — no other configuration is needed (no database, no Docker, no
   extra services)

## Using it

1. Pick a date and click **Load Day** (fetches just that day from Launch27)
2. Type or select a new Arizona address
3. Click **Find Best Cleaner**
4. Review the best-fit route and alternatives, drag the new-property marker if
   needed, and optionally **Add to Temporary Route** to keep evaluating
   more new properties against the same day

Nothing is ever sent to Launch27. The recommendation is informational only
— you make the actual assignment inside Launch27 yourself.

## Project structure

```
app/
  page.tsx                      main UI + state orchestration
  api/geocode/route.ts           server-side geocode + autocomplete (fallback chain)
  api/route/route.ts             server-side road routing (fallback chain)
  api/launch27/bookings/route.ts server-side Launch27 proxy (holds staff credentials)
components/                      DayLoader, AddressSearch, RouteMap,
                                  BestFitCard, CleanerResults
lib/
  launch27/                      Launch27 API client, timezone-aware booking mapping
  csv/                           CSV parsing (kept as an unused fallback path — see below)
  data-source/                   BookingDataSource abstraction (Launch27 now, CSV available)
  routing/                       RoutingProvider abstraction (client + 3-provider fallback chain)
  route-analysis/         route building, ordering, the insertion algorithm, colors
types/                    Booking, CleanerRoute, Recommendation, etc.
```

## Extending later

- Swap `CsvBookingDataSource` for a `Launch27BookingDataSource` behind the
  same `BookingDataSource` interface — nothing else needs to change.
- Swap `OpenRouteServiceProvider` for another routing backend behind the
  same `RoutingProvider` interface.
- Improve `lib/route-analysis/routeOrdering.ts` with a smarter/road-based
  ordering strategy without touching the insertion algorithm.

## Google Sheets route cache (optional, recommended)

Without this, every time a date is loaded, the app re-fetches full-day
road-network geometry for every team from scratch — even if that day's
schedule hasn't changed since the last time anyone loaded it. This cache
fixes that: it stores each team's route (keyed by date + a fingerprint of
that day's booking IDs) in a Google Sheet, and reuses it automatically
whenever the fingerprint still matches. If a job is added, removed, or
reassigned, the fingerprint changes and that team re-routes fresh.

This only caches the *baseline day routes* shown on the map — "Find Best
Cleaner" searches always run fresh, since a new address is different
every time and isn't worth caching.

### Setup

1. In Google Cloud Console, create a project (or use an existing one) and
   enable the **Google Sheets API**
2. Create a **Service Account** (IAM & Admin → Service Accounts), then
   create and download a JSON key for it
3. From that downloaded JSON:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
4. Create a new Google Sheet. Add a tab named **exactly** `RouteCache`
   (case-sensitive)
5. Share that Sheet with the service account's email as an **Editor** —
   service accounts don't have their own Drive storage, they only see
   sheets explicitly shared with them
6. Copy the spreadsheet ID from its URL —
   `https://docs.google.com/spreadsheets/d/THIS_PART/edit` — into
   `GOOGLE_SHEETS_ID`

### Testing it before deploying

Run `test-google-sheets.js` (a standalone script, no relation to the
Next.js app) locally with those three env vars set, to confirm auth and
read/write work before relying on it:

```bash
node test-google-sheets.js
```

**A note on the private key in Vercel:** service account private keys are
multi-line PEM strings. When pasting into Vercel's environment variable
UI, either paste it with real newlines (Vercel's textarea supports this)
or with literal `\n` — the app handles both automatically.

**If Sheets is unreachable or misconfigured**, the app doesn't break —
it just treats every lookup as a cache miss and routes fresh, same as if
this feature weren't configured at all.

## Individual cleaner routes, not team routes

Each route is now per INDIVIDUAL cleaner, not per team. If a job has two
people assigned (e.g. "Gabriel Baldonado & Payton Limon"), that stop
appears on BOTH of their separate routes — since both of them physically
go there — rather than being combined into one shared "team" route. This
happens in `lib/launch27/mapBooking.ts`, which produces one Booking row
per assigned cleaner per job.

## Layout

The date picker, address search, and results (Best Fit + alternatives)
all live in a left-hand sidebar. The map fills the remaining space to the
right. On narrow/mobile screens the sidebar stacks above the map instead.

## Isolating one cleaner on the map

The left sidebar lists every cleaner working that day. Click one to show
only their route on the map (everyone else fades out); click the same
one again to bring everyone back. This is purely a map-display filter —
"Find Best Cleaner" always evaluates every cleaner regardless of what's
currently isolated on the map.

## Map colors

The route palette and the new-property marker deliberately avoid yellow/
orange/amber tones, since those colors are already used for roads and
highways on the base map and would be easy to mistake for a road rather
than a route.


## Lessen dispatch pins (optional)

Shows unscheduled/problem dispatch tasks from Lessen (Pending Vendor
Acceptance, Missed Check In, Return Trip Needed, etc.) as toggleable pins
on the map, alongside your scheduled Launch27 routes. Click a pin to
prefill its address into the search bar, then run Find Best Cleaner
against it exactly like any other new property.

**This works exactly like the Launch27 integration** — no browser
automation, no scheduled sync, no GitHub Actions. Lessen's login turned
out to be a plain HTTP form post (ASP.NET anti-forgery token + a session
cookie), so `app/api/lessen/tasks` logs in server-side on demand, caches
the session cookie in memory, and fetches tasks live — the same pattern
as `lib/launch27/client.ts`.

The only thing cached in Google Sheets is **geocoding results** (address
→ lat/lng), in a `LessenGeocodeCache` tab, purely to avoid re-geocoding
the same address every time you check a box. The task data itself is
always fetched fresh.

### Setup

1. Add `LESSEN_EMAIL` and `LESSEN_PASSWORD` to your `.env.local` and to
   Vercel's environment variables — same place as your other credentials
2. Add a new tab to your existing Google Sheet named exactly
   `LessenGeocodeCache` (same sheet as the route cache — no new
   spreadsheet needed)
3. That's it — no GitHub secrets, no scheduled workflow, no Playwright
   install step

### A note on `utcOffset` / `isSupportDST`

Lessen's login form includes two hidden fields that its own JavaScript
fills in before submitting (`utcOffset`, `isSupportDST`). Since this app
runs from Arizona, `lib/lessen/client.ts` hardcodes these to `420` and
`false` (Arizona is UTC-7 with no daylight saving) — confirmed working
against a real login. If you ever need this from a different timezone,
these are the two values to change.

### Testing locally

```bash
LESSEN_EMAIL=you@example.com LESSEN_PASSWORD=yourpassword node test-lessen-login.js
```

This standalone script (not part of the Next.js app — just a one-off
verification tool) confirms the login flow still works before you deploy.
