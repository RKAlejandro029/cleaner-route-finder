# Cleaner Route Finder (V1)

A read-only route analysis tool: given a date and a new, unassigned cleaning
address, it recommends which existing cleaner/team route can absorb the
property with the least additional driving.

It never reads from or writes to Launch27 — you manually export a CSV from
Launch27 and upload it here for a single working session.

## What this is NOT

No login, no database, no CRM, no scheduling, no Launch27 API integration,
no automatic assignment. Refresh the page and everything resets — that's
intentional (see the build spec in the project for the full rationale).

## Local setup

```bash
npm install
cp .env.example .env.local
# edit .env.local and add your OpenRouteService key
npm run dev
```

Open http://localhost:3000.

## Getting an OpenRouteService API key

1. Sign up free at https://openrouteservice.org/dev/#/signup
2. Create a token (the free tier is plenty for this tool)
3. Put it in `.env.local` as `OPENROUTESERVICE_API_KEY`

The key is only ever read server-side, inside `app/api/geocode` and
`app/api/route`. The browser calls those two endpoints and never sees the
key.

## Deploying to Vercel

1. Push this project to a GitHub repo
2. Import it in Vercel
3. Add the `OPENROUTESERVICE_API_KEY` environment variable in the Vercel
   project settings (Production + Preview)
4. Deploy — no other configuration is needed (no database, no Docker, no
   extra services)

## Using it

1. Upload the Launch27 CSV export (columns: Date, Time, Address, City,
   State, Postal Code, Teams Assigned, Duration, Booking ID, Booking
   Status)
2. Pick a date
3. Type or select a new Arizona address
4. Click **Find Best Cleaner**
5. Review the best-fit route and alternatives, drag the yellow marker if
   needed, and optionally **Add to Temporary Route** to keep evaluating
   more new properties against the same day

Nothing is ever sent to Launch27. The recommendation is informational only
— you make the actual assignment inside Launch27 yourself.

## Project structure

```
app/
  page.tsx              main UI + state orchestration
  api/geocode/route.ts   server-side geocode + autocomplete (holds ORS key)
  api/route/route.ts     server-side road routing (holds ORS key)
components/              CsvUploader, DateSelector, AddressSearch, RouteMap,
                          BestFitCard, CleanerResults
lib/
  csv/                   CSV parsing, validation, status filtering, team parsing
  data-source/            BookingDataSource abstraction (CSV now, Launch27 later)
  routing/                RoutingProvider abstraction (client + ORS implementations)
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
