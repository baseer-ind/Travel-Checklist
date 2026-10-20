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
- Stop auto-seeding a trip into new accounts (done 2026-10-16; the specific hard-coded packing list was later removed from the product entirely, see below).
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

## 2026-10-16 — Signed-in v2 Home + Trip; hard-coded packing list removed

**Signed-in Home + Trip rebuilt in v2.** `view === "app"` now renders the v2 Home or Trip (a new `appView` sub-state: `home` | `trip`) on the shared centred frame, replacing the v1 welcome/trip rendering (that dead code was deleted).
- **Home** is the signed-in hub: an empty state for a new account ("Where to next?"), else the next-trip card (soonest upcoming → undated → past), departure-day surfacing on the travel day / day before, the other trips, and "Plan a trip" (still the v1 New-trip modal for now — that screen converts later).
- **Trip** mirrors the guest Trip with the signed-in extras: private toggle + share + rename + delete, per-item private toggle and remove, essentials (progress + a named missing list, never a score), list tabs/tools, quick-add and finish — reusing the existing signed-in actions (`setState`, `toggleHidden`, `addItem`, `finish`, …) and sync.
- The v1 sidebar is hidden on these screens; a v2 **overflow sheet** (menu button) carries the nav the sidebar used to: Together, groups, account, admin, open-shared, log out. A "🏠 Home" entry was added to the v1 sidebar footer so the still-v1 screens (account/admin/group) can return to the v2 Home.

**"% ready" → "% packed" applied on the Trip screen.** The v2 Trip shows "X of Y packed" with a **"Z% packed"** label on the progress bar — progress, not a readiness verdict. (The group screen keeps its v1 bare "%" until it converts.)

**The old hard-coded religious-trip packing list was removed entirely.** Deleted the big single-destination constant and its template branch, its option in the v1 New-trip modal, and a brief pilgrimage opt-in. No profile is left empty: the pilgrimage/religious profile keeps its own generic starters (Essentials, Modesty & prayer, Long journey, Documents); the universal fallback (documents, packing basics, departure day) is unchanged. The `api.test.js` sample-data fixture was renamed `sampleTrip()`, and test trip names and group examples were made neutral. The product definition's one market example was updated too, so the destination name no longer appears anywhere in the repo.

**Fixes found on the way.**
- *Offline boot for an empty account.* With the auto-seed gone, a signed-in account with no trips couldn't boot offline — `bootOffline` required `local.trips.length` and otherwise showed an error. It now boots any valid session straight into the v2 Home (empty state included) and reconciles when the network returns.
- *Header overflow at 320px.* The compact app header (back · brand · status · menu) overflowed in transient save states ("● Unsaved…"); the status span is now shrinkable with ellipsis so the row holds at 320px.

**Tests.** API `sampleTrip()` rename kept the 36 API tests green. Browser tests updated for the new flow (a new account lands on the empty Home; trips are created through the modal and opened from Home cards; packing uses the v2 checkbox) and added: the pilgrimage profile still offers starter lists, and the denser signed-in Trip item row holds the a11y floor (≥44/48px, ≥14px, no h-scroll) at 320px.

`npm test`: 36. `npm run test:browser`: 14.

## 2026-10-16 — Signed-in New-trip is the v2 flow; v1 modal removed

The signed-in "Plan a trip" is now the v2 New-trip screen (a new `appView` value `new`), replacing the v1 `openModal` dialog — the last create-path still on v1.
- Same three fields as the guest flow: **trip name**, **dates** (departure / return + "I don't know my dates yet"), and **who's going** (the four profiles) → the chosen profile's **ready-made starter lists**, pre-ticked and individually droppable. **Nothing is created until Create** (no auto-create); Create builds the trip, syncs (`touch`), and opens it.
- The field rendering and the trip builder are now **shared** between guest and signed-in: `tripFormFields(wrap, form, rerender)` draws the fields and `buildTripFromForm(form)` builds the trip. `renderGNew` (guest) and `renderNewTripV2` (signed-in) are thin wrappers that add their own header, Back and Create handler; `gCreateTrip` and `ntCreate` differ only in persistence (guest store vs server sync) and navigation.
- Dead v1 code removed with the modal: `newTrip()`, `mkTrip()` and the `STARTER` constant (the v1 modal's "empty / starter" templates). `mkList`/`mkLeaveList` stay (still used by list creation and the leave-list backfill).

**Tests.** The signed-in `createTrip` browser helper now drives the v2 screen (name + optional profile → Create) instead of the modal. Added a test: a signed-in user opens New-trip, **nothing is created just by opening it**, picking a profile adds its ready-made lists, Create lands on the Trip, and the screen holds the a11y floor at 320px.

`npm test`: 36. `npm run test:browser`: 15.

## 2026-10-16 — Service-worker cache staleness (guest screens shipped looking pink on the live site)

**Symptom.** After the PR #10 palette/frame fix merged and deployed, the live site still showed the guest screens (Welcome, Home, Trip, Together) in the old v1 pink, left-pinned on desktop — while a fresh browser and the browser tests showed the correct Design_1 look.

**Root cause — not the code.** The guest screens already set `body.className = "v2"` (via `gShell`) and render correctly in the current code (proven by a new test and a direct DOM check: body background `#EFEAE1` canvas, `.v2-wrap` centred, no h-scroll at 1280/768px). The fault was the **service worker**: `sw.js` is **cache-first** for the shell, with a **static cache name** and **unchanging asset URLs** (`/app.js?v=1`, `/style.css?v=1`, …). When PRs #5–#11 changed those assets, the cache name was not bumped, so **returning users kept being served the old cached pink `app.js`/CSS** forever; only first-time visitors (and tests) got the new files.

**Fix — two parts.**
1. *Bust the current stale cache:* bump `CACHE` `baggo-shell-v5` → `v6`. The new SW (a byte change) installs, re-precaches the shell and, on activate, deletes the old cache; the update flow swaps it in (SKIP_WAITING → `controllerchange` → reload). This frees returning users from the old pink bundle once.
2. *Stop it recurring:* switch the shell fetch handler from **cache-first to network-first**. Same-origin shell requests now go to the network first (subresources with `cache:"no-cache"` to force revalidation even behind an immutable CDN header; navigations re-fetch plainly, their HTML already `no-cache`), and every ok response is re-cached as the offline copy. So a returning visitor online always gets the current `app.js`/CSS **with no cache-name bump**, and offline still serves the precached shell. `CACHE` now only needs bumping when the SHELL list or the SW logic itself changes. The update-toast flow is unchanged (it fires on `sw.js` changes).

**Guards.** Two browser tests: (1) the **guest Welcome** screen is centred on the canvas (not `#fdf8fb` pink) at 768px and 1280px — the earlier centring test only exercised a post-sign-in guest screen, so an entry-screen regression wasn't caught; (2) **network-first** — after a visitor's SW is installed, a shell asset (`tokens.css`) is changed on the server with no `sw.js`/cache-name change, and the returning visitor's next online load reflects it (the cache name is asserted unchanged), while offline still boots.

**Not changed: the v1 sign-in and shared-list screens.** `renderAuth` and `renderSharedGuest` set `body.className = "guest"` and are still the v1 (pink) screens. Flipping them to `"guest v2"` was considered and rejected: their CSS uses v1-only tokens (`--card`, `--peach`, `--lavender`, `--sky`) defined only under `body:not(.v2)`, so under `.v2` the sign-in card and its primary button lose their backgrounds (verified by screenshot). Those two screens need a proper v2 rebuild, not a class flip; they stay v1 until then.

`npm test`: 36. `npm run test:browser`: 16.

## 2026-10-18 — Public signup (family-code gate removed)

Account creation no longer requires the global `FAMILY_CODE`. Signup is **open by default**, controlled by a new env `SIGNUP_OPEN` (`signupEnabled = SIGNUP_OPEN !== "false"`), reported by `/api/config`, `/api/health` (`signupOpen`) and `/api/me` — no longer derived from `FAMILY_CODE`.
- `POST /api/signup` accepts `{ username, password, code? }`. **Blank code → a solo account** (`circle: null`). A **non-empty code must name an existing family** — the admin's `FAMILY_CODE` or one a user generated (checked via `store.get("circlename:" + circleOf(code))`); a wrong code returns **400** ("That family code isn't right — leave it blank to sign up without one") so it never silently drops them. All existing protections kept (uniqueness, password rules, `noteFail`/lockout, same-origin).
- `FAMILY_CODE` remains valid as an **optional** join code (the admin's family), just not a signup gate.
- Client: the Log in / Create account toggle always shows; the family-code field is **optional** ("Family code — optional (you can also join a family later)"); fine print is public-appropriate.

## 2026-10-18 — New-trip: "Start blank" vs "Ready-made list" + trip templates

The "Who's going?" **profiles** step is replaced, after name and dates, by a two-way **"Start your lists"** choice: **Start blank** (one empty "Packing" list) or **Use a ready-made list** (reveals a template picker; selecting one reveals its lists with tick-to-include — "nothing is added without you"). `tripFormFields` / `buildTripFromForm` generalised: `f.mode` (`blank`|`ready`), `f.template`, `f.pick`; the trip's `profile` field records the chosen template id.
- `PROFILES` / `STARTERS` / `UNIVERSAL` removed; a final `TEMPLATES` set added (Summer, Winter, Beach/holiday, Business, Weekend, Family, Pilgrimage). No template states a visa/health/entry fact — the "Check:" link-out rule is upheld (no such items exist in the new data).
- **Every built trip carries the universal "Before you leave" list.** `normalize()` already backfills this list on load (`migrated = true`), so building it in at creation keeps new trips **born-normalized**. This also fixed a real two-device bug: a blank/template trip lacking the leave list made a pulling device run the migration and **auto-save on pull**, which could clobber a concurrent edit (caught by the two-device-conflict browser test once blank became the default). Trips are now born with the list, so a pull never mutates-then-saves.

## 2026-10-18 — Flush stale clients (SW cache bump)

`public/sw.js` cache bumped `baggo-shell-v8` → `v9` so every installed client re-precaches the new build on next open (the update-toast flow swaps it in). Confirmed the shell fetch handler is **network-first** (since the #13 change), so a stale cached `app.js` — the likely cause of a "new-trip form only asks a name" report — can't recur for an online returning visitor.

## 2026-10-18 — Users can generate & share their own family code

Any user can create their own family with a generated, guaranteed-unique code.
- `POST /api/family/create`: reserves a unique code by looping `store.setnx("circlename:" + circleOf(S.randomCode(6)))` (setnx fails if taken), moves the user out of any existing circle, joins the new one, and returns `{ ...familyView(fresh), code }`.
- `familyView` now includes the circle's plaintext `code` (from `circlename:`), so a member can display and share it. **Privacy is unchanged** — member summaries still pass through the `visible()` filter; private items/lists/trips never appear. The code is the family's own shared invite code.
- Client: the connect screen offers **Create a family** (`famCreate`) and **Join a family** (existing code input + `famConnect`); the connected view shows the code prominently (`fmtCode`) with **Copy code** (clipboard + "Code copied") and **Share** (`navigator.share`, else copy). Copy/Share use the **raw** code (what joins); only the on-screen display is hyphenated.

`npm test`: 41. `npm run test:browser`: 21.

## 2026-10-19 — Transport dimension on trips (+ Add to calendar)

A trip can now record how you're travelling.
- **`TRANSPORT` data** (public/app.js, near `TEMPLATES`): plane / train / road / bus / ship. Each mode has an `addon` (one extra packing list) and `travel` (travel-day reminder lines). The lines are **logistics only** — no visa/health/entry facts.
- **New-trip form** (shared guest + signed-in): an optional **"Departure time"** input beside the dates (`f.departTime`), and a **"Traveling by?"** radio step after the start-lists section (shown for both blank and ready modes; `f.transport`, toggleable/optional).
- **`buildTripFromForm`**: when a mode is chosen it appends the mode's add-on packing list and a **"Travel day"** list (`kind:"transport"`, items are the mode's `travel[]` lines, emoji ⏰), keeps the universal "Before you leave" list, and sets `trip.transport` and `trip.departAt` (the departure date + time combined into a local `YYYY-MM-DDTHH:MM`). `lib/shared.js` whitelists `transport`, `departAt`, and the new `transport` list kind so signed-in trips keep them.
- **Add to calendar** (Trip screen, when `departAt` is set, next to the countdown): `addToCalendar(trip)` builds a `.ics` (floating-local `VEVENT` "Leave for <trip>", `DTEND` +1h, a `VALARM` `TRIGGER:-PT3H`) and downloads it via a Blob URL — **no network, works offline** — plus a Google Calendar template-URL fallback link. Clearing a trip's date also clears `departAt`.

`npm test`: 41. `npm run test:browser`: 22 (adds: Plane appends Air-travel + Travel-day lists, sets transport/departAt, and the .ics carries the time + a -PT3H VALARM).

## 2026-10-19 — Landing screen + guided first-trip survey

**Landing (renderGWelcome).** The no-account entry screen is now a proper landing: the Baggo mark + "Forget Forgetting" lockup, one plain line ("Your travel packing companion — never leave a thing behind"), two actions — **Start packing** (guest → the guided survey) and **Create account** — and a 3-item "why" strip (ready-made lists / pack together / works offline). This in-app screen *is* the landing; no separate site. Tokens unchanged.

**Also folded in here (from the superseded #18):** the Design-5 tagline styling — `.tag` is now ink, title case, no uppercase, near-zero tracking, ~45% of the lockup wordmark — and the manifest/meta **description** → "Your travel packing companion — never leave a thing behind." (#20 had swapped only the tagline *text*; these were still missing.)

**Guided survey = the first trip as a short, skippable stepper** (`renderSurvey`), invoked by "Start packing". Four steps, one question each, Back/Next, progress dots: (1) What kind of trip? → TEMPLATES, (2) Who's going? (optional) → sets `travellers`, (3) Traveling by? (optional) → TRANSPORT, (4) name + dates + departure time. It **reuses `buildTripFromForm`** (via `gCreateTrip`), so it produces the same trip as the one-page form for equivalent answers. Last answers (template/transport/travellers) persist to `localStorage` ("baggo.survey") and pre-fill next time. **"Skip, start blank"** on every step yields a blank trip ("My trip": one empty Packing list + Before you leave) — entry is never gated.

**The one-page form stays** for the fast path: the guest Home's "Plan another trip" and the signed-in "Plan a trip" still use `tripFormFields`. The stepper is only the guest landing's first-trip flow.

`npm test`: 41. `npm run test:browser`: 23 (adds: guided survey == one-page form for equivalent answers, and Skip yields a blank trip; guest tests re-pointed through the survey; one-page template/transport tests run on the signed-in form).

## 2026-10-19 — Emergency contacts (private) + privacy policy update

Users can store **emergency contacts** — `{ name, phone, relation }` — as their own private data.
- **Model.** Stored as a top-level `S.contacts` array on the user document (not inside a trip), so it's reachable globally from Settings and from a "Set up emergency contacts" prompt on the trip's "Before you leave" list. `lib/shared.js` `sanitizeData` whitelists `contacts` (≤50, string-limited); everything else is unchanged. (Interpretation note: the spec said "a special list kind 'emergency'"; a dedicated top-level section was cleaner than a per-trip list and makes the privacy guarantee *structural* — see below.)
- **Privacy — structural, not just filtered.** `visible()` only ever emits `trips`, so `contacts` are **never** part of any family / group / admin / share / feed response. The owner sees them via their own `/api/data`; no other surface can. A test asserts a family member and the admin cannot see another user's contacts.
- **UI.** An Emergency-contacts screen (guest + signed-in): add / edit / delete; **Share** (`navigator.share`, else clipboard + toast); **Wallet card** (a print-only `#walletCard` + a `@media print` stylesheet — `window.print`, offline). Reached from Settings and from the "Before you leave" prompt.
- **Export & delete.** The JSON export now includes `contacts`; deleting the account removes them with the rest of `data:<key>` (covered by the delete test).
- **Legal.** `public/privacy.html` "What we collect" and `public/terms.html` "Your content" now state that Baggo stores emergency contacts (names + phone numbers) as private, user-owned data, shared only when the user chooses, removable via export/delete. (No separate `.md` sources exist for these pages — the HTML files are the source; their bodies are still placeholder pending the real legal copy.)

**Conflict to resolve (flagged, not edited):** `docs/PRODUCT_DEFINITION.md` §(Privacy) lists "Never collected: … phone … contacts". This feature intentionally stores phone numbers/contacts, so that fixed line is now inaccurate. Per CLAUDE.md the Decisions table is fixed, so I did not edit it — the owner should reconcile that line with this feature.

`npm test`: 42 (adds the contacts privacy test; delete test now also stores + checks a contact). `npm run test:browser`: 24 (adds add/share/delete + export-includes-contacts, with a11y).

## 2026-10-19 — Share & save sheet, QR, and delight features

A reusable **Share & save** bottom sheet plus several share/offline helpers, all local-first (no network, no new runtime dependency).

- **Share helpers (one block in public/app.js).** `shareText(title,text)` (uses `navigator.share`, else clipboard + "Copied" toast); `shareWhatsApp(text)` → opens `https://wa.me/?text=…`; `formatTripText(trip)` → "🧳 <name> — packing list" then each visible list with `✅`/`☐` items (the private "Before you leave" list and hidden items/lists are left out); `copyTripList`, `shareProgress` ("I'm <pct>% packed for <trip> with Baggo 🧳" + app URL), `emailTrip` (`mailto:`), `printTripList` (a print-only `#printSheet` + the existing `@media print` rules → `window.print`, so "Save as PDF" is the browser's own dialog).
- **Share & save sheet** (`openShareSheet`), opened from the Trip screen (guest + signed-in) and the family screen. Trip rows: WhatsApp / system share / copy / share progress / add to calendar (reuses the transport work, only when `departAt` is set) / email / print / **Copy this trip** / **Save as my template**. Family rows: a **QR** of the join link + copy / share code.
- **QR — vendored static generator.** `public/vendor/qr.js` exposes `window.BaggoQR.{matrix,canvas}` (byte mode, EC level L, versions 1–5, Reed–Solomon over GF(256), 8-mask penalty selection, format-info BCH). **Reason for vendoring (per CLAUDE.md "no new runtime dependency"):** rendering a QR in-browser with no network and no npm package needs a generator in the page; this is a single self-contained MIT file in `public/`, loaded by `index.html` and cached in the SW shell (`baggo-shell-v10`). It is **not** an npm/runtime dependency. Its output was verified **scannable** by decoding it with an external reference decoder (jsQR) across 400+ random inputs during development; the api test locks the verified matrices by golden hash so encoding/masking/format-placement can't regress unnoticed. (A format-info placement bug — bits placed LSB-first instead of MSB-first — was found and fixed this way before shipping.)
- **`?family=<code>` links.** The QR/Share encode `location.origin + "/?family=<code>"`. On boot a signed-in user with that param lands straight on Together with the code pre-filled; guests (no account yet) stay on Home. Mirrors the existing `?code=` / `?group=` handling.
- **Confetti at 100%.** `celebrateIfComplete` fires a short canvas burst + "All packed! 🎉" once a trip crosses into fully packed (guarded so it fires only on the transition, re-armed if you unpack). **Disabled under `prefers-reduced-motion`** (`reducedMotion()` gate), as is the sheet's slide-up animation.
- **Haptics.** `buzz(ms)` calls `navigator.vibrate` when supported; a 10 ms tick on packing an item. Skipped under reduced motion and where unsupported.
- **Copy this trip.** `cloneTrip` deep-copies a trip's lists into a fresh trip — new `nid()` ids throughout, every item reset to `todo`, name "<name> (copy)", dates/`departAt`/`packedAt` cleared. Offered from the Share & save sheet (Trip screen) and from a **"Copy a trip"** button in each Home's "Plan another trip" area (one trip copies directly; several open a chooser).
- **Save as my template.** `saveAsTemplate` stores a trip's list structure in `S.myTemplates` (local-first, private). The new-trip template picker shows a **"Your templates"** section when any exist. `lib/shared.js` `sanitizeData` whitelists `myTemplates` (≤30, string-limited, same shape as `TEMPLATES`). Like `contacts`, it is a top-level field that `visible()` never emits, so saved templates are **never** in any family / group / admin / share / feed response. Included in the JSON export; removed with the account on delete.
- **Contacts reach-out.** Each emergency contact now has tap-to-call (`tel:`) and message (`sms:`) links and a **"Save to phone"** `.vcf` vCard download (per contact + "Save all"), all offline data downloads.
- **Directions.** On a transport trip, a **Directions** button opens `https://www.google.com/maps/dir/?api=1&destination=<the station/airport the user types>` — a plain maps link, no SDK, no key.

`npm test`: 44 (adds: saved templates round-trip through the data endpoint and stay private to the owner; the vendored QR generator matches the scannable golden matrices). `npm run test:browser`: 25 (adds: Share & save → WhatsApp text from `formatTripText`, Copy this trip clones with fresh ids and all-todo items, and `window.BaggoQR` renders a square canvas in-page).

## 2026-10-20 — Desktop/responsive website layout (left rail) from the approved Design_6 handoff

Implemented the approved desktop design (Claude Design "Design_6" handoff, `Baggo.dc.html`) as responsive CSS + light markup over the existing codebase. The mobile layout (<768px, bottom tab bar) is unchanged; wider viewports become a two-column website.

- **Breakpoints** (map the prototype's three device frames to real widths): **<768px** phone — untouched (bottom tab bar / hamburger). **768–1023px** — website layout with an **icon-only** rail (86px). **≥1024px** — rail gains **labels** (248px) and the content column widens (max 760px → 1100px). This matches the user's "full website feel on desktop, mobile on mobile."
- **Left rail** (`buildRail` in `public/app.js`): Baggo mark + wordmark, the current mode's primary nav, a spacer, and an account block — a pure presentation of each shell's **existing** navigation (no new screens/features, reuses the same handlers). Guest rail = Home / Trips / Together + "Sign in". Signed-in rail = Home / Together / Settings / Admin (admins only) + an **account button that opens the existing overflow menu**, so groups, shared lists and log out stay reachable on desktop. Decision: the signed-in shell has no standalone "Trips" screen (Home already lists trips), so the rail omits it rather than inventing one.
- **Whole-app scope** (per the user's choice): both the guest and signed-in shells get the rail, injected once in `gShell`. The no-account **Welcome and the first-run guided survey keep their centred narrow hero** (no rail) — the rail is gated by `railApplies()` and the website layout is scoped to a `.has-rail` class on `<main>`, so those onboarding screens are unaffected (and their existing centred-frame test still passes).
- **Wide grids**: trip-card lists (Home "other trips", guest Trips) and the family members list flow into `repeat(auto-fill, minmax(min(100%,300px),1fr))` grids at ≥768px (per the prototype's `togGrid`/`listGrid`). The wrappers are `display:contents` (trip lists) / an identical flex column (members) on phones, so the **mobile layout is byte-for-byte unchanged**.
- **No new colours / no restyle**: the rail uses existing tokens — `--surface` (#F7F4EF) rail, `--line` (#E6E1D8) divider, `--canvas` (#EFEAE1) active/hover, `--together*` for the badge. Two new nav icons (gear/shield) were added to the icon set for Settings/Admin; no existing component's styling changed. The mobile bottom tab bar, brand and hamburger are hidden (not removed) via `@media (min-width:768px)` under `.has-rail`.

`npm test`: 44 (unchanged). `npm run test:browser`: 26 (the "desktop shell" test now asserts the rail replaces the tab bar and the content widens at 1280/768 and reverts on mobile; a new test locks the signed-in rail's Home/Together/Settings/Admin + account menu; the guest-Welcome-centred test is unchanged and still green).
