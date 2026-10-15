# Paste this as the first message in Claude Code

You are implementing Baggo – Your Travel Checklist (Stage 3 of a four-stage plan). Read, in order: `CLAUDE.md`, `docs/PRODUCT_DEFINITION.md`, `docs/DESIGN.md`. Then:

1. Run `npm test` and confirm 34 passing. Run `npm run dev` and open http://localhost:3000 to see the v1 app. Do not change `lib/` behaviour in this step.
2. Write `docs/STATUS.md` with every feature from section C of the product definition and its true status (built, partly built, not built, unverified), checked against the code, not the doc.
3. Write `docs/DECISIONS.md` with one entry: date, "Stage 3 started from the v1 family app; local-first rewrite of the client data layer; API kept as contract."
4. Plan the local-first client data layer (IndexedDB store, sync queue, per-trip revision, recovered copy) in `docs/PWA_AND_OFFLINE_ARCHITECTURE.md`. Keep it under two pages. Stop and show me the plan before writing code.
5. After I approve: implement Journey 1 from section G (first open to first tick, no account, 6 taps, offline). Add tests. Walk it in a browser at 375 px with the network off. Report what you actually ran.

Rules: never mark anything tested that was not executed; never restyle the approved design; never remove a working v1 feature without an entry in DECISIONS.md; `npm test` stays green on every commit.
