# Decisions

Every decision that changes or interprets `PRODUCT_DEFINITION.md`, newest last.

## 2026-10-15 — Stage 3 starts from the v1 family app

Stage 3 started from the v1 family app; local-first rewrite of the client data layer; API kept as contract.

## 2026-10-15 — Claude Design export is not the approved design

The Claude Design export "Travel Checklist PWA Design" (prototype + design system) was checked against sections D, E and F before Stage 3. It was made without the product definition and does not match it:

- D: five tabs (Home, Trip, Packing, Documents, Templates) instead of three (Home, Trips, Together).
- E: covers about 6 of 14 screens; no Welcome, Trips (all), Together, Member, Group list, Admin or Settings; no sync badge states.
- F: warm paper, dark ink and one orange accent, not four accents bound to packed / not needed / private / together. Shows a readiness percentage, which CLAUDE.md forbids.
- Data model: fixed packing categories plus dated tasks and documents, instead of generic lists.

Its link is therefore **not** added to `docs/DESIGN.md`. Stage 2 needs a redesign against the product definition. Until then, data-layer work (which has no visual surface) proceeds; screen work waits.

## 2026-10-15 — Offline architecture approved

`docs/PWA_AND_OFFLINE_ARCHITECTURE.md` approved, with one addition: a test proving the per-trip endpoints can't leak private items into any family, admin, share or feed response.

## 2026-10-15 — Conflicts are per trip, last write wins, with a recovered copy

Family members only view each other's trips and group lists are server-side, so a trip conflict is always one person on two devices. Per-trip last write wins, with the losing version kept 7 days and restorable, is enough. `PRODUCT_DEFINITION.md` section H updated to say so.

## 2026-10-15 — Server limits: 300 KB per trip, 100 trips per user

Replaces v1's 900 KB per-user cap, which couldn't hold what the 50 MB local budget allows. Listed in `STATUS.md` for Stage 4.

## 2026-10-15 — Sign-out wipes the device

Signing out removes that person's trips, templates and recovered copies from the device, so a shared family phone doesn't expose one person's private items to the next. If unsynced changes exist, the app warns once with "Sync first" or "Sign out anyway". There is no third option.

## 2026-10-15 — No localStorage fallback for iOS eviction

Changes section L. Safari's 7-day eviction clears localStorage along with IndexedDB, so a fallback copy there protects nothing. The defences are install to home screen, sign-in and export. `PRODUCT_DEFINITION.md` section L updated.

## 2026-10-15 — Playwright as a dev-only dependency

Needed for browser walks at 375 px with the network off. Run with `npm run test:browser`. `npm test` stays Node-only with no install. No runtime dependency is added.

## 2026-10-15 — Journey 1 waits for the Stage 2 redesign

The data layer is built and tested against the v1 screens. Journey 1 screens are built only after the new Stage 2 design is approved.

## 2026-10-15 — v2 changes (not v1 fixes)

The live v1 app keeps these until v2 replaces it:

- Remove the readiness percentage from the trip and group screens.
- Stop adding "Trip to Qadian" to new accounts; make it a starter template the user picks.
- Finish the Baggo rename: page title, manifest name and short name, login screen.

## 2026-10-16 — Stage 2 "Design_1" (warm paper) approved

Approved design: `Travel_Checklist_PWA_Design_1.zip` (Baggo prototype + Baggo System + component files), designed with the product definition attached. Linked in `docs/DESIGN.md`; tokens extracted to `public/tokens.css`. Section F of the definition is now warm paper, so the paper base is on-spec (no longer flagged). It passes D (3 tabs), E (14 screens) and F (four accents, no dark theme).

## 2026-10-16 — Server background is white, warm paper is the surface

The user's token note called `#F7F4EF` the "paper" base. The approved design system maps it to `--surface` (the one warm off-white) and uses `#FFFFFF` as `--bg`, matching Section F's "pure white with one warm off-white surface". `tokens.css` follows the design system's mapping.

## 2026-10-16 — Design gaps vs definition (resolve when building screens)

Logged here rather than copied into code (CLAUDE.md: the no-readiness-score hard rule overrides the "implement as designed" rule where they conflict):

- **"% ready" is a readiness score.** The Together/Member views label each person `"{pct}% ready"`, and a group load-error says "Showing the last synced readiness". The definition bans a readiness score and the wording "ready to travel". When these screens are built, the number stays (it's progress) but the label becomes **"% packed"**, and the error reads "last synced progress". Not a restyle; a copy change the hard rule requires.
- **A fifth colour, `--focus` `#1361D1` (blue), is used for the focus ring and links.** The definition names four *accent meanings*; a focus/link colour outside those four is fine and expected (focus must be visible and distinct). Kept, documented as non-meaning, not counted against the four-accent rule.
- No other D/E/F gaps found. New trip is a modal and Item sheet is a bottom sheet (not tab screens), as the definition expects.

## 2026-10-16 — Local-first store and boot (data layer, part 2)

`public/db.js` is the IndexedDB store: one record per trip (keyed `owner|tripId`), plus templates, recovered copies and a small meta record, with a cached public session so the app can boot with no network. All reads/writes are wrapped so a blocked IndexedDB (private windows, cleared data) degrades to no-op and the app still runs.

- `app.js` boots local-first: cached trips render before the network; every edit is written to IndexedDB before the debounced network save.
- IDs are random strings (`nid()`), replacing the per-user counter that collided across devices.
- **Reconnect rule for now:** if the device has unsynced local edits, local wins and is pushed via `/api/data`; the server never overwrites unsynced edits. Per-trip conflict handling with recovered copies arrives with the sync queue (next step).
- **Sign-out wipes the device** for that user (trips, templates, cached session); if there are unsynced edits and no network, it warns once before wiping.
- Verified by `tests/browser.test.js` (Playwright, 375 px): sign-up → create/tick → offline reload keeps data → offline edit survives a second offline reload → back online, edits sync. `npm test` (Node API) stays at 36/36 and installs nothing.

Still pending (next step): the per-trip `/api/trips` sync queue with revisions and recovered copies, and the service-worker rework (fonts, "Updated" toast). No-account guest mode is Journey-1 screen work.

## 2026-10-16 — Per-trip sync queue with recovered copies (data layer, part 3)

`public/sync.js` reconciles the device with the server one trip at a time, completing the "nothing is lost" guarantee:

- **Push:** each changed trip is `PUT /api/trips/:id` with the revision last seen. The engine detects a changed trip by comparing a content signature (server-managed `rev`/`updated` stripped) against the last-synced signature, so no mutation site needs instrumenting.
- **Conflict (409):** the local version is saved as a **recovered copy** (IndexedDB, pruned after 7 days), then the server's copy replaces it locally and a one-line note is shown. Conflicts only arise between one person's own devices (family members only read each other's trips), as the definition states.
- **Pull:** trips new on the server are fetched; trips advanced on the server with no local edit fast-forward; trips deleted elsewhere are removed locally when there's no unsynced local edit.
- **Deletes** made on the device are `DELETE`d with the last-seen revision.
- `app.js` now syncs through this engine (replacing the whole-document `/api/data` client path); `/api/data` stays on the server for the privacy/family/admin tests. `onApply` runs `normalize(S)` so a pulled-in trip on a fresh device gets a valid current-trip selection.

Verified by `tests/browser.test.js` (Playwright, 375 px): the existing offline/local-first walks plus a **two-device conflict** — device A's edit wins, device B's stale edit is rejected and kept as a recovered copy, and the server holds only the winner's edit. `npm test` (Node API): 36/36. `npm run test:browser`: 5/5.

Next: service-worker rework (self-hosted fonts, "Updated" toast, drop `'unsafe-inline'`); then screens on Design_1. No-account guest mode remains Journey-1 screen work.
