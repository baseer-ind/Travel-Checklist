# Status

Checked against the code on 2026-10-15, not against the product definition. Section C of `PRODUCT_DEFINITION.md`, feature by feature.

Legend: **built** (in code and exercised by a test or read end to end) · **partly built** · **not built** · **unverified** (code exists, nothing has run it).

`npm test`: 36 passed, 0 failed. `npm run test:browser`: 12 passed (Playwright/Chromium at 320–1280px). Node 22, file store.

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
| Readiness | Never a score | partly resolved | The v2 Together/Member screens label progress **"% packed"** (packed of packed+to-go), which is progress, not a readiness verdict. The v1 trip and group screens still show a bare `pct + "%"`; relabel them when those screens are rebuilt in v2. |
| Offline (signed in) | Boot and use with no network | **built** (browser-tested) | `public/db.js` (IndexedDB) + local-first boot in `app.js`: trips load from the device before the network, an offline reload keeps everything, offline edits persist and sync on reconnect without being overwritten. Verified by `tests/browser.test.js` at 375 px. |
| Offline (no account) | Full use with no account | **built** (Journey 1, browser-tested) | Guest-first entry (online and offline). Welcome → New trip (name, dates, profile → starter lists) → Trip (lists, tick, skip, quick add), Design_1 styling, stored under the "guest" owner in IndexedDB, nothing sent anywhere. Signing in (v1) is one tap away. Verified by the 6-tap offline guest walk in `tests/browser.test.js`. |
| Home (guest) | Next trip + departure-day surfacing | **built** (browser-tested) | Home leads with the soonest trip (countdown, progress, open its most urgent list); on the travel day / day before it surfaces the departure list; other trips listed below. |
| Trips list (guest) | All trips; duplicate; archive | **built** (browser-tested) | Duplicate copies lists/items with states reset to to-do (flags/quantities kept); archive hides from Home with a reopenable Archived section. |
| Together (guest state) + migration | Connect-a-family entry; guest→account migration | **built** (browser-tested) | v2 Together tab shows the no-account state (create an account to pack together). On sign-in/sign-up, guest trips move into the account — nothing lost, private/notes/quantity flags preserved, synced to the server, guest store cleared. |
| Together (signed in) + Member | Family view, member read-only view, in v2 | **built** (browser-tested) | Signed-in `renderFamily`/`renderMember` rebuilt in v2 on the shared frame: connect-code card, member cards with avatars + **"% packed"** + `you` badge + activity feed, and a read-only member view (packed/skip/to-do marks, "% packed" per trip). Privacy holds — private items never reach the member view. Back navigation returns to the trips app / Together. |
| Desktop shell | Centred frame on wide screens | **built** (browser-tested) | The v1 desktop grid no longer leaks into v2 (was pinning content left); `.v2-wrap` centres, the tab bar is constrained to the frame column, and a `--canvas` backdrop frames it. Verified centred with no h-scroll at 768px and 1280px. Also fixed a palette bug where `style.css` overrode the Design_1 `--ink`/`--bg` tokens on every v2 screen (now scoped to `body:not(.v2)`). |
| Remaining v2 screens | Group/Admin/Settings/Item sheet/Templates; signed-in Home/Trip in v2 | not built | The signed-in Home/Trip and the Group/Admin/Settings/Item-sheet/Templates screens still use the v1 UI; rebuilding them is the remaining piece. |
| Sync | Offline edits reach the server; conflicts keep a recovered copy | **built** (browser-tested) | `public/sync.js`: per-trip push with revision compare-and-set against `/api/trips`; a rejected (409) push keeps the local version as a recovered copy, then takes the server's; then pulls new/advanced trips and removes trips deleted elsewhere. Two-device conflict verified in `tests/browser.test.js`. |
| Offline | Install to home screen | partly built | Manifest and 192/512/maskable icons exist. No install hint. Name is still "Family Travel Checklist". |
| Offline | Shell cache | **built** (browser-tested) | `sw.js` cache-first shell, including the self-hosted font. A new version waits (no `skipWaiting`), shows an "Updated" toast, activates cleanly and the app still boots offline afterwards — verified in `tests/browser.test.js`. |
| Security | CSP no longer needs `'unsafe-inline'` scripts | **built** | SW registration moved out of inline HTML; `script-src 'self'`, `font-src 'self'`, no Google Fonts hosts. (Inline style *attributes* still need `style-src 'unsafe-inline'`.) |
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
- **IDs are now random strings** (`nid()` in `app.js`); the server accepts strings and legacy integers. The old per-user counter collided across devices. Verified by the browser test.
- **Server data cap is 900 KB per user** (`MAX_DATA_BYTES`). Section I's 50 MB local budget can't sync through it.
- **CSP allows `'unsafe-inline'` scripts** because `index.html` registers the service worker inline. It exists but is weaker than "CSP" suggests.
- **Notifications** are requested from the group screen. Section I says only from the departure list.
- **Tests:** the README mentions browser and stress tests; only `tests/api.test.js` exists. No Playwright, no stress run, no real Vercel/Upstash deployment has been tested.
