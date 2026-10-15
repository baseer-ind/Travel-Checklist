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
