# Design

**Stage 2 — "Design_1" (warm paper), approved 16 Oct 2026.** Warm off-white paper surface on a white background, dark ink, Plus Jakarta Sans, four accents each bound to one meaning (Packed / Not needed / Private / Together); covers the 3-tab IA and the 14 screens with their states. Source: Claude Design export `Travel_Checklist_PWA_Design_1.zip` (Baggo prototype + Baggo System + component files), designed with `PRODUCT_DEFINITION.md` attached.

Tokens are extracted to `public/tokens.css`. Components use those variables only, never raw hex.

## Checked against the definition
- **D (navigation):** 3 tabs — Home, Trips, Together (Together appears only once a code exists). Pass.
- **E (screens):** Welcome, Home, New trip, Trip, List, Item sheet, Departure day, Templates, Trips (all), Together, Member, Group list, Admin, Settings — all present (New trip and Item sheet are a modal and a bottom sheet). Pass.
- **F (visual):** warm paper + white, four accents each one meaning, 12/999/8 radii, one shadow, no dark theme. Pass. (Section F in the definition is now warm paper; the paper base is on-spec.)

Gaps found are logged in `docs/DECISIONS.md` (2026-10-16), the main one being "% ready" wording that must become "% packed" to satisfy the no-readiness-score rule.

## Component files in the export (build these as the shared set)
`BaggoTripCard`, `BaggoListRow`, `BaggoItemRow`, `BaggoProgress`, `BaggoSyncBadge`, `BaggoCountdown`.
