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

## 2026-10-16 — Service worker rework and self-hosted font

- **No `skipWaiting` on install.** A new version waits; the page shows an "Updated to the latest version." toast, tells the worker to activate, then reloads after a short delay so the new assets load cleanly. Verified by a browser test (update activates, old cache cleaned, app still boots offline afterwards).
- **Fonts are self-hosted.** Plus Jakarta Sans (one latin variable woff2) lives in `public/fonts/`, declared in `public/fonts.css`, precached by the SW. The Google Fonts `<link>`s are gone, so the app has no cross-origin font dependency and works offline.
- **v1 shell adopts the design font.** `style.css` dropped Fredoka/Nunito for Plus Jakarta Sans. This is a small restyle of the *v1* shell (not the approved design) and the only way to remove the Google Fonts dependency without hosting two more families; it also moves v1 toward the approved look. v2 screens use the same font via `tokens.css`.
- **CSP hardened.** The inline SW-registration script moved into `app.js`, so `script-src` is now `'self'` (no `'unsafe-inline'`); `font-src 'self'`; Google Fonts hosts removed. Inline *style attributes* still require `style-src 'unsafe-inline'` — unchanged, and out of scope here.
- `server.js` gained an optional `PUBLIC_DIR` (tests serve a temp copy to simulate a deploy); harmless in production.

## 2026-10-16 — Guest-first entry (Journey 1)

Confirmed with the user: when there is no account, the app opens into the Design_1 **guest** experience (online and offline); a "Sign in" link reaches the existing v1 login for family/groups/admin, and signed-in users still get v1 until those screens are rebuilt. This satisfies the "works with no account" hard rule and matches "replace screen by screen".

- New files: `public/v2.css` (Design_1 components on `tokens.css`); guest flow added to `app.js`.
- Screens: **Welcome** (plan a trip / try a sample), **New trip** (one screen: name, dates, who's-going profile → starter lists pre-ticked, nothing added without you), **Trip** (list tabs, item rows with tick + "not needed" + quick add, progress). A minimal Home/Trips bottom bar; Together is not shown (no code, guest).
- Starter lists per profile (family / pilgrimage / solo-domestic / solo-international) and three universals for no profile, per section A. International documents use "Check:" items (visa, vaccinations) — the app states no rule.
- Storage: guest trips under the `"guest"` owner in IndexedDB; **no network at all** in the guest flow (the boot `/api/me` is the only call, and it's skipped offline). No server account is created.
- Boot: no user → `enterGuest()`; offline with no session → `enterGuest()` (first-open offline now shows the guest Welcome, not the old "Can't load" error).

Verified by `tests/browser.test.js`: a 6-tap, fully-offline walk (plan → profile → create → tick) that asserts **0 data-bearing API calls**, a trip with lists and a packed item stored under `"guest"`, and survival of an offline reload. `npm test`: 36. `npm run test:browser`: 7.

Not yet built: the rest of the v2 screens (full Home, Trips list, Together/family, Member, Group, Admin, Settings, Item sheet, Templates, Departure-day surfacing), guest→account migration on sign-in, and applying the "% ready" → "% packed" relabel when the Together/Member screens are built.

## 2026-10-16 — Shell accessibility enforced by tokens

Before building more v2 screens: touch targets and the text floor are driven by `tokens.css` so all 14 screens inherit them.

- `--tap: 44px` and `--tap-row-action: 48px` drive every interactive minimum in `v2.css` (buttons, links, inputs, tabs, choice/checkline rows, and the item-row tick/skip at 48px). Icon buttons are a full 44×44.
- Text floor: `--fs-meta` and `--fs-micro` raised to **14px** (was 13/12), so no visible v2 text is below the 14px minimum. The design's smaller mono labels are overridden by the CLAUDE.md hard rule (same precedence as the "% ready" decision).
- Fixed a real 320px overflow: the New-trip date inputs now shrink (`min-width:0`) and the two-date grid wraps (`auto-fit minmax`).
- `tests/browser.test.js` gains a shared `a11y(page)` check — ≥44/48px targets, ≥14px text, no horizontal scroll — run at **320px** on each guest screen (Welcome, New trip, Trip). It will be reused on every future v2 screen.

`npm test`: 36. `npm run test:browser`: 8.

## 2026-10-16 — Guest Home + Trips list

- **Home** leads with the next trip (soonest upcoming, then undated, then past), its countdown and progress, and a button into its most urgent list. On the travel day or the day before it surfaces the departure ("Before you leave") list first. Other active trips are listed below.
- **Trips** lists all active trips with **Duplicate** (copies lists and items with every state reset to to-do; must-not-forget and quantity kept — generation rule 6) and **Archive** (hides from Home; a reopenable "Archived" section). 
- A bottom tab bar (Home · Trips) carries the IA; Together stays hidden for guests (no code yet).
- Verified by a browser test: Home next-trip card, duplicate resets states, archive hides from Home and is reopenable.

### First-run reload — fixed (2026-10-16)
A first-ever visit used to reload once right after the SW installed, because `activate` called `self.clients.claim()` and taking over a page that loaded without a controller makes the browser reload it — landing a guest mid-create on Home. Fixed by **removing `clients.claim()`** from `sw.js` (old-cache cleanup kept): the worker now controls the next navigation instead, so there is no mid-task reload. Updates are unaffected — `registerSW` drives them via SKIP_WAITING + `controllerchange` once the page is controlled. The Journey-1 browser test runs with the SW **enabled** and asserts exactly one navigation (the initial load) through create-and-tick; the SW-update test establishes the controller with one reload before shipping v2.

`npm test`: 36. `npm run test:browser`: 9.

## 2026-10-16 — Together (guest state) + guest→account migration

**Migration (the data-safety core).** On sign-in or sign-up, `afterLogin` loads the `"guest"` store and moves any guest trips into the account: it rebuilds `S` from the account's own stored data (not carried-over guest memory), adds guest trips not already present, persists locally, pushes them to the server via the sync engine (they are new to the account's sync meta, so they sync as normal), then **clears the guest store** so nothing is duplicated. All fields are carried as-is, including `hidden` (private), `note`, `qty` and `mnf`. A one-line toast confirms ("added to your account"). A subtle bug was fixed in the process: the in-memory guest `S` used to ride into the account silently (trip kept, but un-counted and the guest store left un-wiped); `afterLogin` now resets `S` from the account and migrates from the guest *store* explicitly.

**Together screen.** The v2 guest tab bar now has three tabs (Home · Trips · Together). Together shows the section-E "no code yet" state for a guest — pack-together explainer and "Create an account" / "Sign in" — since family needs an account. The signed-in family view (members, who's ready, activity) remains the existing **v1** screen; rebuilding it in v2 is part of the larger signed-in v1→v2 work.

**Test** (`tests/browser.test.js`): guest creates a trip (with one item marked private in the store), opens Together → creates an account; then the trip is on the server with **all** items (nothing lost) and the private flag preserved; a second family member's `/api/family` view shows the trip but **not** the private item; and the guest store is empty afterwards.

`npm test`: 36. `npm run test:browser`: 10.

### Still ahead
The signed-in experience is still v1 (visual split during the build, to be removed before public launch per the user's directive). Remaining v2 screens: signed-in Home/Trip/Together, Member, Group list, Admin, Settings, Item sheet, Templates, plus applying "% ready" → "% packed" when the Together/Member v2 screens are built.

## 2026-10-16 — Desktop shell fix + signed-in v2 Together/Member

**Shared frame, now web-friendly.** The v1 desktop grid (`.app { grid-template-columns: 300px 1fr }` at ≥880px) was still applying in v2/guest mode, reserving an empty sidebar column and pinning `.v2-wrap` off-centre. Fixed centrally so every v2 screen inherits it:
- `.app` is forced to `display:block` under `body.v2`/`body.guest` (the v1 sidebar/scrim/menu are also hidden there), so `.v2-wrap`'s `max-width:560px; margin:0 auto` actually centres.
- The fixed bottom tab bar is constrained to the same 560px column (`margin:0 auto` + side borders), not full-bleed.
- **New token `--canvas: #EFEAE1`** — a warm backdrop *behind* the centred frame on wide screens. The frame (`.v2-wrap`) is an explicit white (`--bg`) sheet on that canvas, so the centred app reads as intentional on desktop; on phones the frame fills the viewport and the canvas never shows. This adds one surface the Stage-2 palette didn't name (it specified white page + one warm paper surface); it is used only as the out-of-frame desktop backdrop, never as a content surface, so the "white background, one warm paper surface" rule still holds inside the app.

**Palette bug fixed (was affecting every v2 screen).** `style.css` redefined `--ink` and `--bg` on `:root` with v1 pastel values (`#3b3552`, `#fdf8fb`) and loads *after* `tokens.css`, so it silently overrode the Design_1 tokens — every v2 screen had been rendering on v1 pink with v1 purple ink, not the intended white/near-black. The v1 pastel palette is now scoped to `body:not(.v2)`, so v1 screens (and the v1 shared-list guest view, `body.guest`) keep their pastels while v2 gets the correct tokens.

**Signed-in Together (v2).** Replaces v1 `renderFamily`. Uses the shared v2 frame (brand bar + Back to trips; the v1 sidebar is hidden while on this screen). Not connected → an inline v2 connect-code card (no modal). Connected → member cards (initials avatar in one of five accent colours, name, `you` badge, trip count + last-active, and **"X% packed"**), a recent-activity feed, and tools (use a different code / leave).

**Signed-in Member (v2).** Replaces v1 `renderMember`. Read-only trips → lists → items with a packed-check / skip-cross / hollow-dot state mark and **"X% packed"** per trip. Back to Together. The server's privacy filter still removes private items before they reach this view.

**"% ready" → "% packed" applied here.** Per the long-standing decision, the member cards and member trips show **"% packed"** — literal progress (packed of packed+to-go; skipped items excluded), never "ready". This is progress, not a readiness score, so it satisfies the no-score hard rule (the rule forbids a readiness *verdict*, not showing how much is packed).

**Tests** (`tests/browser.test.js`):
- *desktop shell* — at **768px and 1280px**: content is centred (equal gutters, not left-pinned), the frame is capped at its max-width, the tab bar aligns to the frame column, and there is no horizontal scroll.
- *signed-in Together/Member* — two family members; a member card shows "% packed" and never "ready"; the own card has the `you` badge; opening a member shows read-only lists with the shared item visible, the **private item hidden**, and **no packing controls**; a11y (≥44/48px targets, ≥14px text, no h-scroll) holds on both screens.

`npm test`: 36. `npm run test:browser`: 12.
