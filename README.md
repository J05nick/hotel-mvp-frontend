# hotel-mvp-frontend

Live room calendar for a hotel that sells rooms in **30-minute blocks**. Staff see, at a glance
and in real time, which rooms are free, held, booked or being cleaned, and the board updates
itself the moment something changes.

**Stack:** Next.js 16 (App Router, React Server Components, Cache Components) · React 19 ·
TypeScript (strict) · Tailwind CSS 4 · zod · Vitest + Testing Library.

The API lives in its own repository, **hotel-mvp-backend**, which exposes the REST and
WebSocket endpoints this app consumes.

![Room calendar](docs/calendar.png)

> **Reading this to review it?** Jump to [Review guide](#9-review-guide-for-humans-and-ai-reviewers):
> a reading order, a claim → evidence table and the known limitations.

## Contents

1. [Functional overview](#1-functional-overview)
2. [Architecture](#2-architecture)
3. [How data flows](#3-how-data-flows)
4. [Contracts with the backend](#4-contracts-with-the-backend)
5. [Configuration](#5-configuration)
6. [Getting started](#6-getting-started)
7. [Development workflow](#7-development-workflow)
8. [Docker and deployment](#8-docker-and-deployment)
9. [Review guide for humans and AI reviewers](#9-review-guide-for-humans-and-ai-reviewers)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Functional overview

### What the user sees

One page (`/`) showing **one day** of the hotel:

* a **row per room** with number, name, capacity and a **status badge**;
* a **24-hour timeline** (one tick per hour) where each booking is a coloured block placed by
  its start and end time; a red line marks "now";
* a **summary** (`2 available · 0 occupied · 1 cleaning · 1 maintenance`);
* a **connection badge**: `Live`, `Connecting…`, `Reconnecting…` or `Offline`;
* **day navigation**: previous day, today, next day (`?date=YYYY-MM-DD`).

### Visual language

| Room status | Badge | Booking status | Block |
|---|---|---|---|
| `available` | green | `pending` ("On hold", 5-minute cart) | amber, dashed border |
| `occupied` | red | `confirmed` | indigo |
| `cleaning` | blue | `checked_in` | green |
| `maintenance` | grey | `completed` | grey |

Cancelled and expired bookings are not drawn: they release their time. Status is always
conveyed by text as well as colour; very short blocks show only their start time (the full
range is in the tooltip and the accessible name). Light and dark themes follow the system.

### Behaviours

| # | Behaviour |
|---|---|
| F-1 | The first paint already contains every room and booking (rendered on the server): no spinner, no client fetch. |
| F-2 | Changes appear **without reloading**: a hold being created, confirmed, cancelled, completed or expiring; a room changing status. |
| F-3 | Only the affected room's row updates; the rest of the board is untouched. |
| F-4 | If the connection drops, the badge says `Reconnecting…`, the socket retries with backoff, and on return the board reloads its snapshot so changes made while offline show up. |
| F-5 | A hold whose 5-minute deadline has passed disappears from the board even before the server announces the expiry. |
| F-6 | A "day" is the hotel's local day (`HOTEL_TIMEZONE`), including 23- and 25-hour days when clocks change. |
| F-7 | An invalid `?date` falls back to today instead of an error page. |
| F-8 | If the API is unreachable the route's error page offers "Try again". |

### Typical scenario

1. A guest places a hold on room 101, 14:00-15:00 -> an amber dashed block appears in row 101.
2. The guest confirms -> the block turns indigo.
3. The stay ends and the backend flags the room -> badge `Cleaning`, summary counts change.
4. Staff mark the room clean (backend API) -> badge `Available`.

### Out of scope (for now)

Creating or editing bookings from the UI, marking rooms clean from the UI, authentication,
multi-day views, guest details (the API deliberately never sends them).

---

## 2. Architecture

[Feature-Sliced Design](https://feature-sliced.design/). `app/` is Next.js's routing layer and
stays thin; everything else lives in `src/`, in layers that may only import from layers
**below** them. ESLint enforces it (`eslint.config.mjs`), including "slices are used only
through their public API" (`index.ts`, or `server.ts` for code that must never reach a client bundle).

```
app/                          routes only: layout, page, error boundary, /api/health
src/
  shared/                     no business knowledge
    api/api-client.ts         fetchJson: timeout, never cached, zod validation, one ApiError type
    config/server-env.ts      runtime env validated with zod (server-only)
    lib/use-websocket.ts      reconnecting WebSocket hook
    lib/use-now.ts            SSR-safe ticking clock
    lib/zoned-time.ts         time-zone aware days, formatting
  entities/
    room/                     status model + <RoomStatusBadge>
    booking/                  status model, forward-only rank, <BookingBlock>
  features/
    live-calendar/            snapshot + live events: schemas, reducer, <CalendarProvider>
      server.ts               server-only entry: getCalendarSnapshot
  widgets/
    calendar-board/           the board: time axis, room rows, connection badge, timeline maths
  views/                      FSD "pages" layer, renamed because Next reserves `pages/`
    calendar/                 <CalendarView> (Server Component), day navigation, skeleton
tests/                        shared test helpers: fake WebSocket, fixtures
```

### Rendering model

Cache Components is enabled, so a route is a **static shell** plus **dynamic parts that stream
in**. The title and a skeleton are prerendered; `<CalendarView>` depends on the request (query
string, environment, wall clock), so it runs inside `<Suspense>`. The build reports `/` as
*Partial Prerender*.

| Piece | Runs on | Why |
|---|---|---|
| `app/page.tsx`, header, skeleton | build time | static shell, instant |
| `CalendarView`, `DayNavigation` | server, per request | reads env + API, no client fetch |
| `CalendarProvider`, `CalendarBoard`, `ConnectionBadge` | browser | live updates need state and a socket |

---

## 3. How data flows

```
 Server (per request)                                  Browser
 ────────────────────                                  ───────
 <CalendarView> (RSC)
   read ?date, env, clock
   GET /api/v1/calendar ───► snapshot ───► <CalendarProvider initial=…>
                                             │  useReducer(calendarReducer)
                                             │  useWebSocket(WS_URL) ◄── ws /ws/events
                                             ▼
                                          <CalendarBoard>   one memoised <RoomRow> per room
```

### Reducer rules (`features/live-calendar/model/calendar-state.ts`, pure and unit-tested)

| Incoming event | Effect |
|---|---|
| `booking.hold_created` / `confirmed` / `completed` | upsert the booking in its room, sorted by start |
| `booking.cancelled` / `expired` | remove the booking |
| `room.status_changed` | set the room's status (newest `occurred_at` wins) |
| booking for a room not shown, or outside the visible day | ignored |
| late event that would move a booking backwards (e.g. `hold_created` after `confirmed`) | ignored |
| duplicate of an applied event | no change, **same object identity** (no re-render) |
| malformed / unknown / future-version frame | dropped before reaching the reducer |
| `system.resync`, or any reconnection | `router.refresh()`: the Server Component re-reads the snapshot and the provider adopts it |

### Connection states (`useWebSocket`)

`connecting` -> `open` -> (drop) `reconnecting` -> `open` ... or `closed` when disabled.
Reconnection uses exponential backoff (`500 ms * 2^n`, capped at 15 s) **with jitter**, retries
immediately when the browser fires `online`, resets after a successful open, and is cancelled
on unmount. Handlers are held in refs, so passing inline callbacks never recreates the socket.
`CalendarProvider` uses two React contexts (data, connection) so a connection flap does not
re-render the board.

### Time

Instants travel as ISO-8601 and are formatted in `HOTEL_TIMEZONE` on **both** server and
client, so hydration matches. "Now" is `null` during SSR (`useNow`) and becomes real right
after mount.

---

## 4. Contracts with the backend

Both are validated with zod at the boundary; anything that does not match is rejected
(REST) or dropped (WebSocket). Definitions: `src/features/live-calendar/model/snapshot.ts`
and `live-events.ts`.

* **REST** `GET {API_BASE_URL}/api/v1/calendar?from=<ISO>&to=<ISO>` -> `{generated_at, start,
  end, rooms: [{id, number, name, capacity, price_per_block_cents, status, bookings: [{id,
  status, start, end, hold_expires_at}]}]}`. Errors: `{error, detail}` -> `ApiError`.
* **WebSocket** `WS_URL`, envelope `{v: 1, type, occurred_at, room_id, data}` with types
  `booking.hold_created | confirmed | cancelled | completed | expired`,
  `room.status_changed`, `system.connected`, `system.resync`. Full catalogue in the backend README.

If the backend changes either contract, the schemas fail loudly (see the "invalid_response"
test) instead of rendering wrong data.

---

## 5. Configuration

12-Factor: server-side variables read **at request time**, so one build runs anywhere.
Copy `.env.example` to `.env.local` for development. Nothing is inlined at build time.

| Variable | Default | Purpose |
|---|---|---|
| `API_BASE_URL` | `http://localhost:8000` | Where the Next.js **server** calls the REST API (in Docker: the service name or host address). |
| `WS_URL` | `ws://localhost:8000/ws/events` | Where the **browser** opens the WebSocket: the API's *public* address. Must start with `ws://` or `wss://`. |
| `HOTEL_TIMEZONE` | `UTC` | IANA zone defining the hotel's day (e.g. `America/Bogota`). |

An invalid value fails fast with a message naming the variable. The backend's `CORS_ORIGINS`
must include this app's origin, because the WebSocket handshake is checked against it.

---

## 6. Getting started

### Prerequisites

Node.js **22 LTS** (>= 20.9, see `.nvmrc`) and npm. A running backend with demo rooms.

### Full stack

```bash
# 1. backend (repository hotel-mvp-backend)
make up && make seed            # API on http://localhost:8000, demo rooms loaded

# 2. this repository
cp .env.example .env.local      # defaults already point at localhost:8000
npm install
npm run dev                     # http://localhost:3000
```

Then create activity with the backend API (see its README, "Try it"): holds, confirmations
and room changes show up on the board immediately.

---

## 7. Development workflow

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on `:3000` |
| `npm run check` | lint + typecheck + tests (what CI should run) |
| `npm run lint` | ESLint, including the FSD import rules |
| `npm run typecheck` | `next typegen && tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm test` / `npm run test:watch` | Vitest, single run / watch |
| `npm run build` / `npm start` | Production build / server |

Conventions: strict TypeScript, no `any`; business logic in pure functions with colocated
tests; a new slice exposes only `index.ts` (and `server.ts` if it has server-only code).

### Tests (143 cases in 14 files; parametrised cases counted individually)

| Area | File | Cases |
|---|---|---|
| Time zones, DST days, a zone whose midnight does not exist | `shared/lib/zoned-time.test.ts` | 21 |
| `useWebSocket`: backoff, jitter, reconnect flag, cleanup, `online` | `shared/lib/use-websocket.test.tsx` | 13 |
| `useNow`: SSR `null`, ticking, no render loop, shared timer | `shared/lib/use-now.test.tsx` | 5 |
| API client and runtime env | `shared/api/…`, `shared/config/…` | 7 + 5 |
| WebSocket message parsing | `features/live-calendar/model/live-events.test.ts` | 21 |
| Reducer rules (table above) | `features/live-calendar/model/calendar-state.test.ts` | 23 |
| Snapshot fetch and conversion | `features/live-calendar/api/get-calendar.test.ts` | 2 |
| Board end to end with a fake WebSocket | `widgets/calendar-board/ui/calendar-board.test.tsx` | 16 |
| Timeline maths, booking block | `widgets/…/timeline.test.ts`, `entities/…/booking-block.test.tsx` | 8 + 4 |
| Server Component: window per time zone, `?date`, failures | `views/calendar/ui/calendar-view.test.tsx` | 8 |
| `?date` resolution, health route | `views/calendar/lib/…`, `app/api/health/…` | 9 + 1 |

---

## 8. Docker and deployment

```bash
docker compose up --build     # web on http://localhost:3000; the backend must already be running
```

* Multi-stage `Dockerfile`: `npm ci`, `next build`, then a minimal runtime from the
  `standalone` output, running as a **non-root** user.
* The image needs **no build-time configuration**; pass `API_BASE_URL`, `WS_URL` and
  `HOTEL_TIMEZONE` at runtime (see `docker-compose.yml`).
* `GET /api/health` is a liveness probe. It deliberately does **not** call the backend: if the API
  is down the page shows an error state, but restarting this container would not help.
* From a container the host's backend is reached via `host.docker.internal` (already mapped in
  the compose file); `WS_URL` is used by the *browser*, so it stays `localhost`.

---

## 9. Review guide for humans and AI reviewers

### Suggested reading order (about 15 minutes)

1. This README, sections 1-4.
2. `src/features/live-calendar/model/live-events.ts` and `snapshot.ts`: the contracts.
3. `src/features/live-calendar/model/calendar-state.ts`: the reducer (all rules, pure).
4. `src/shared/lib/use-websocket.ts`: reconnection.
5. `src/features/live-calendar/model/calendar-provider.tsx`: wiring and resync.
6. `src/views/calendar/ui/calendar-view.tsx`: the Server Component.
7. `src/widgets/calendar-board/`: presentation.
8. The matching tests in section 7.

### Claim -> evidence

| Claim | Where | Evidence (test) |
|---|---|---|
| First paint needs no client round trip | `calendar-view.tsx` | `calendar-view.test.tsx` · "fetches today's calendar on the server and renders it without any client round trip" |
| The hotel's day respects its time zone and DST | `zoned-time.ts` | `zoned-time.test.ts` · DST and Santiago cases; `calendar-view.test.tsx` · "defines the day in the hotel's time zone" |
| Live events update the right row only | `calendar-state.ts`, `room-row.tsx` | "does not re-render rooms that did not change"; "updates only the affected room and keeps the others by reference" |
| A late event cannot move a booking backwards | `calendar-state.ts` | "never moves a booking backwards (late hold_created after confirmed)" |
| Out-of-order room events resolve to the newest | `calendar-state.ts` | "lets the newest event win when events arrive out of order" |
| Reconnection backs off with jitter and never leaks | `use-websocket.ts` | "reconnects with exponential backoff, capped…", "applies jitter…", "closes the socket and cancels pending retries on unmount" |
| Missed events are recovered after an outage | `calendar-provider.tsx` | "reloads the snapshot after a reconnection, but not on the first connection" |
| Hostile or broken frames cannot crash or corrupt the UI | `live-events.ts` | `live-events.test.ts` (malformed, unknown type, future version, bad timestamps) |
| No hydration mismatch from the clock | `use-now.ts` | "renders null on the server so hydration matches, then the real time" |
| The FSD layering is enforced, not just documented | `eslint.config.mjs` | verified by hand: a deliberate upward import and a deep import both fail `npm run lint` |

### Verification status

* Ran and passing: `npm run check` (ESLint, `tsc --noEmit`, 143 tests) and `next build`
  (route `/` reported as Partial Prerender), also from a clean checkout without `.next`.
* The **whole stack was exercised manually in a real browser (Chromium)** against the real
  backend: live hold/confirm/cancel, room cleaning, a refused overlapping booking, the backend
  killed and restarted with a change made while offline, day navigation, dark mode and a
  390 px viewport, with no console errors or hydration warnings. That script is **not part of
  this repository** (no browser E2E suite or CI workflow yet).
* `docker compose config` validates, **but the image was not built or run** (no Docker daemon in
  the authoring environment): treat the Dockerfile as unexercised until you build it.
* `npm audit --omit=dev`: 0 vulnerabilities. `npm audit` reports 5 "high" findings, all in the
  dev-only lint toolchain (`eslint-config-next` → `fast-glob`); the only automatic fix is a
  breaking downgrade, so it was not applied.

### Known limitations and open decisions

* **Read-only UI.** No booking or cleaning actions yet (the backend endpoints exist).
* **One day at a time**; no week view, no search or filters.
* **No authentication.** The calendar is public occupancy data; add auth before exposing staff actions.
* **No browser E2E / CI workflow** in the repository.
* **`WS_URL` is public configuration** and the socket is unauthenticated (the backend restricts it by `Origin`).
* **Back-to-back stays** show no cleaning gap between them (a backend product rule).
* **Next 16 specifics worth knowing:** `error.tsx` receives `retry` (not `reset`); route types
  (`PageProps`, `LayoutProps`) come from `next typegen`, which is why `typecheck` runs it first;
  `AGENTS.md` is generated by Next and tells coding agents to read the docs bundled in
  `node_modules/next/dist/docs/`.

---

## 10. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| "The calendar is not available" error page | Backend unreachable from the Next.js **server**: check `API_BASE_URL`; the page recovers with "Try again". |
| Board renders but the badge stays `Connecting…` / `Reconnecting…` | The **browser** cannot reach `WS_URL`, or the page's origin is missing from the backend's `CORS_ORIGINS` (the socket closes with `1008`). |
| Calendar is empty | The backend has no rooms: `make seed` in the backend repository. |
| Times look shifted | `HOTEL_TIMEZONE` is not the hotel's zone; the API stores UTC. |
| `Invalid environment configuration` on start | A variable has a bad value; the message names it. |
| `tsc` cannot find `PageProps` / `LayoutProps` | Run `npx next typegen` (or `npm run typecheck`, which does). |
