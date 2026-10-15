# Baggo – Your Travel Checklist

Offline-first "pack together" PWA. Plain JS front end, Node serverless API on Vercel, Upstash Redis. No framework, no build step, no npm dependencies at runtime.

## Source of truth, in this order
1. `docs/PRODUCT_DEFINITION.md` — Stage 1 product definition. Its "Decisions" table is fixed; do not reinterpret it.
2. The approved Claude Design screens (link in `docs/DESIGN.md` once added). Implement them as designed; do not restyle.
3. This file.

## What exists and must keep working
- `lib/app.js`, `lib/groups.js`, `lib/shared.js`, `lib/security.js`, `lib/store.js` — the API: login, data sync, family, groups, share codes, admin, privacy filter.
- `tests/api.test.js` — 34 API tests. `npm test` must stay green after every change. Add tests for every new endpoint and for every privacy rule.
- `public/` — the current (v1, pastel) front end. It is the live baseline for the family until v2 replaces it screen by screen.

## Hard rules
- Local-first: every edit is written to IndexedDB and shown on screen before any network call. The app must work with no account and no network.
- Private items, lists and trips never appear in any family, group, admin, share or feed response. Hiding is never announced. Test it.
- Never state a visa, entry, health or plug rule. "Check:" items link out; the app gives no answer.
- No readiness score. Show progress and a named list of what is missing.
- No dark theme. Light background, saturated accents, each accent bound to one meaning (packed, not needed, private, together).
- Minimum text 14 px, touch targets 44 px, reduced-motion turns off all animation, no horizontal scroll from 320 px.
- Keep the stack: no React, no bundler, no new runtime dependency without a written reason in `docs/DECISIONS.md`.
- Vercel: `api/index.js` is the only function; `vercel.json` routes `/api/*` to it. Keep CSP headers.

## Commands
```
npm run dev     # http://localhost:3000, admin / change-me-admin, family code "family"
npm test        # API tests against the file store
```

## Working method
- One journey at a time, in the order of section G of the product definition: 1 (first tick, no account), 2, 3, 5, 6, then 4 (family).
- Each journey: implement, add tests, walk it in a browser at 375 px and offline, then record status in `docs/STATUS.md`.
- Record every decision that changes the product definition in `docs/DECISIONS.md` with the date and reason.
- Never mark something tested unless it was run.
