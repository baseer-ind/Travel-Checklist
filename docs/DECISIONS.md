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
