# PWA and offline architecture (approved 2026-10-15, not built)

Goal: the device is the source of truth. The server becomes an optional sync and sharing service. The API in `lib/` stays the contract, but it needs the four changes marked **API change**, each with tests.

## 1. Local store (IndexedDB)

Database `baggo`, version 1, with these object stores:

| Store | Key | Holds |
| --- | --- | --- |
| `trips` | `id` | The whole trip document: trip fields, its lists and items. Also `rev` (last server revision seen), `dirty` (unsynced local edits) and `updated`. |
| `templates` | `id` | User templates. Starter templates ship as a static JSON file in the shell, not in IndexedDB. |
| `recovered` | `id` | Losing versions after a conflict: `{ trip, reason, at }`. Pruned after 7 days. |
| `meta` | key | `deviceId`, signed-in user, last sync time. |

The trip is the unit everywhere: it is read, written, synced and conflicted as a whole. This matches the per-trip revision in section H and keeps the store small: about 100 lines of plain JS in `public/db.js`, with no library.

**Write path (every edit):** change the in-memory trip, render, then `put` the trip in one IndexedDB transaction and set `dirty = true`, then schedule a sync. The network is never on the path to the screen. If the IndexedDB write fails (quota, private mode), the app shows a persistent "Not saved on this phone" banner and offers export.

**Boot:** read IndexedDB, then render. `GET /api/me` runs afterwards in the background. Today the boot waits for `/api/me`, which is why v1 shows an error when opened offline.

**IDs:** new objects get random string IDs (`crypto.randomUUID()`, shortened to 12 characters). Per-user integers (`S.next++`) collide as soon as two devices create items offline. Existing integer IDs are kept as they are. **API change:** `sanitizeData` and `/api/share/:tripId` must accept string IDs as well as integers.

## 2. Data model additions

Following section H, these fields are added: trip `end`, `destination`, `profile`, `travellers`, `archived`, `updated`; list `order` and kind tags; item `quantity`, `note`, `link`, `mustNotForget`, `order`. **API change:** `sanitizeData` whitelists them with size caps. Today it silently strips any field it doesn't know, so syncing them would drop them.

`visible()` must keep dropping private trips, lists and items, along with the departure (`leave`) list, from every family, admin, share and feed response. A private item's note and link go with it. Every new field gets a test asserting this. The per-trip endpoints get their own test proving they can't leak private items through any of those responses.

## 3. Sync (signed-in devices only)

**API change:** per-trip endpoints. `/api/data` stays as it is for the v1 front end until v2 replaces it.

- `GET /api/trips` returns `[{ id, rev, updated }]`, an index for cheap polling.
- `GET /api/trips/:id` returns the full trip.
- `PUT /api/trips/:id { baseRev, trip }` succeeds only if the server's `rev` equals `baseRev`; it then saves and returns the new `rev`. If not, it answers `409 { trip }` with the server's copy.
- `DELETE /api/trips/:id { baseRev }` deletes a trip on the same compare-and-set rule.

Server storage moves from one JSON blob per user (`data:<user>`) to a Redis hash `trips:<user>` with one field per trip. The compare-and-set is a short Lua `EVAL` on Upstash; the file store does it in-process. `loadVisible()` assembles the old shape from the hash, so the family, admin, share and feed code above it doesn't change and the 34 tests keep guarding it. This also fixes a race v1 has: two devices of the same user both read, change and then write one blob, and one write is lost.

**Client loop:** sync runs when there are dirty trips (1 s after the last edit), on the `online` event, when the app becomes visible, and every 30 s while visible. Each pass:
1. push every dirty trip with its `baseRev`;
2. pull the index and fetch trips whose `rev` changed;
3. handle each 409.

The sync badge has four states (section I): *Saved on this phone* (no account), *Syncing*, *Synced*, and *Could not sync* with a Retry button.

**Conflict (409):** as section I says, the server version replaces the local one on screen and the local version goes to `recovered`. A one-line prompt offers "Put my changes back"; accepting pushes the recovered copy with the new `baseRev`. Conflicts only happen between one person's own devices, because family members read each other's trips but never write them, and group lists are server-side and online-only. This is rare enough that the prompt is acceptable.

**Guest to account:** at sign-up or log-in, every local trip is marked dirty with `baseRev = 0` and pushed. Random IDs mean guest trips and server trips are joined, never merged.

**Sign-out** wipes that person's trips, templates and recovered copies from the device. If any trip is dirty, it warns once with two choices, "Sync first" or "Sign out anyway", and nothing else.

## 4. Service worker

- Precache the shell, the starter templates JSON, the icons and **self-hosted fonts**. Cross-origin Google Fonts aren't cached today, so the app opens offline with fallback fonts.
- Cache-first for the shell, using a versioned cache name. A new worker waits; on the next open it activates and the app shows a one-line "Updated" toast (section I). The v1 behaviour of `skipWaiting()` on install goes.
- `/api/*` is never cached (unchanged).
- Move the inline service-worker registration out of `index.html` into `app.js`, so the CSP can drop `script-src 'unsafe-inline'`.
- Manifest: name "Baggo", short name "Baggo", theme colour from Stage 2.

## 5. Storage limits and eviction

- `navigator.storage.estimate()` drives the 80% warning against the 50 MB budget. Past the budget, new items are refused and export always works.
- Server limits: 300 KB per trip and 100 trips per user, replacing the 900 KB per-user `MAX_DATA_BYTES`.
- Call `navigator.storage.persist()` after the first tick (Chrome grants it to installed or engaged sites).
- **iOS eviction:** there is no localStorage fallback, because Safari's 7-day rule clears localStorage along with IndexedDB. The defences are installing to the home screen (installed web apps are exempt), signing in, and export. The install hint and export reminder carry that weight.

## 6. Tests and tools

- API (existing runner, no dependency): compare-and-set 200/409, delete with stale rev, string IDs, hash-backed `loadVisible`, privacy on every new field, share codes with string trip IDs, per-trip size cap.
- Client data layer: `db.js` and `sync.js` sit behind a small storage interface, so the sync logic is tested in Node against an in-memory adapter (no `fake-indexeddb`).
- Browser walks (375 px, offline): Playwright, as a **dev** dependency only, run by `npm run test:browser`. `npm test` stays Node-only with no install, so it runs anywhere.

## Order of work

1. IndexedDB store (`db.js`); v1 screens boot from it and write to it first.
2. Random string IDs (client, `sanitizeData`, share route).
3. Per-trip endpoints with the revision check, the hash-backed store and size caps, plus tests. **Stop and report here.**
4. Sync queue (`sync.js`), badge, recovered copies, sign-out wipe.
5. Service worker.
6. Export and self-service delete.

Journey 1 screens wait for the new Stage 2 design. Until then, the data layer is built and tested against the v1 screens.
