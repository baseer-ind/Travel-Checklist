# Status

Checked against the code on 2026-10-15, not against the product definition. Section C of `PRODUCT_DEFINITION.md`, feature by feature.

Legend: **built** (in code and exercised by a test or read end to end) · **partly built** · **not built** · **unverified** (code exists, nothing has run it).

`npm test`: 34 passed, 0 failed (Node 22, file store). The app has not been opened in a browser yet in Stage 3.

## Section C features

| Area | Feature | Status | Evidence / gap |
| --- | --- | --- | --- |
| Trips | Create with name | built | `newTrip()` in `public/app.js` |
| Trips | Dates | partly built | One `travelDate` only. No end date, so trip length (generation rule 4) can't be computed. |
| Trips | Optional destination, profile, travellers | not built | Not in the data model; `sanitizeData` would drop them. |
| Trips | Countdown | built | `buildCountdown()`; ticks every second, days/hours/mins/secs. |
| Trips | Archive | not built | |
| Trips | Duplicate as new trip | not built | |
| Trips | Private trip | built | `hidden` flag; filtered by `visible()`; tested. |
| Lists | Any number per trip; add, rename, delete | built | |
| Lists | Reorder | not built | No order field, no UI. |
| Lists | Kinds | partly built | Only `kind: "leave"` exists; everything else is an emoji guessed from the name. |
| Lists | Private list | built | `hidden` on list; tested via `visible()`. |
| Items | Packed / not needed / remove | built | `state: todo/packed/skip`. |
| Items | Private flag | built | Tested in 5 privacy tests. |
| Items | Quantity, note, link, must-not-forget | not built | `sanitizeData` whitelists `id, emoji, name, state, hidden`; any new field is silently stripped on save. |
| Templates | Starter templates per profile | partly built | Two hard-coded lists (`STARTER`, `QADIAN`), no profiles. |
| Templates | Save any list as template | not built | |
| Templates | Copy from a past trip | not built | |
| Departure day | Dedicated list | partly built | "Before you leave" list (`kind: "leave"`), never shared. |
| Departure day | Surfaces on Home on the day and day before | not built | There is no Home screen. |
| Readiness | Progress and "what is still missing" | built | `finish()` lists unticked items by list; missing-essentials panel. |
| Readiness | Never a score | **conflicts** | Trip and group screens show a percentage (`pct + "%"`). CLAUDE.md forbids a readiness score. |
| Offline | Full use with no account and no network | **not built** | No IndexedDB or localStorage. Data lives in memory and on the server. Opening the app offline: `GET /api/me` fails and the boot shows "Can't load right now". Edits made while offline are lost if the tab closes. |
| Offline | Install to home screen | partly built | Manifest and 192/512/maskable icons exist. No install hint. Name is still "Family Travel Checklist". |
| Offline | Shell cache | built (unverified offline) | `sw.js` network-first shell cache; never tested with the network off. Google Fonts aren't cached. |
| Account | Name + password, sync across devices | built | Required before anything works. |
| Account | Conflict rule | not built | `PUT /api/data` overwrites with no revision check: last write wins for the user's whole data, not per trip. |
| Family | Code, members' shared lists, activity feed, private hidden | built | Tested. |
| Groups | Shared list, "packed by" | built | Server-side ops; online only. Tested in one combined test. |
| Admin | Who is ready, reset, add, delete members | built | Tested. |
| Export | Download all my data as JSON | not built | |
| Export | Delete account and data (self-service) | not built | Only the admin can delete a person. |

## Limits Stage 4 must test

| Limit | Value | Expected behaviour |
| --- | --- | --- |
| Server size per trip | 300 KB (serialised JSON) | `PUT` above it returns 413; the trip stays saved on the device |
| Trips per user on the server | 100 | Creating trip 101 is refused with a clear message |
| Local budget | 50 MB | Warning at 80% (40 MB); new items refused past 50 MB; export still works |
| Recovered copies | Kept 7 days | Pruned after 7 days |

## Other findings

- **Not renamed to Baggo.** Only `package.json`, `CLAUDE.md` and the docs say Baggo. `index.html` title, `manifest.webmanifest` name and the login screen still say "Family Travel Checklist". The cookie is `tc_session`, the cache is `ftc-shell-v1`.
- **New accounts get a trip added silently.** `afterLogin()` creates "Trip to Qadian" for an empty account. Generation rule 1 says nothing is added silently.
- **IDs are per-user integers** (`S.next++`). Two devices creating items offline will produce the same IDs. Blocks local-first; see the architecture plan.
- **Server data cap is 900 KB per user** (`MAX_DATA_BYTES`). Section I's 50 MB local budget can't sync through it.
- **CSP allows `'unsafe-inline'` scripts** because `index.html` registers the service worker inline. It exists but is weaker than "CSP" suggests.
- **Notifications** are requested from the group screen. Section I says only from the departure list.
- **Tests:** the README mentions browser and stress tests; only `tests/api.test.js` exists. No Playwright, no stress run, no real Vercel/Upstash deployment has been tested.
