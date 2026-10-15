# Travel Checklist PWA — Stage 1 Product Definition

Oct 16, 2026 · @Baseer

## Decisions that shape everything below

The product is a public, offline-first **pack-together** app: any list, any trip, no account needed to start, and the only real moat is packing with other people. These five decisions override the master prompt where they conflict.

| # | Decision | Why | What it overrides |
| --- | --- | --- | --- |
| 1 | Lists are generic. A trip holds any number of named lists of any kind (packing, documents, home, shopping, to-do, departure day, custom). Templates are just saved lists. | The user asked for any kind of list. It also makes the engine simple: templates in, lists out. | The prompt's eleven fixed packing categories become starter templates, not structure. |
| 2 | Local-first. Everything works with no account; an account only adds sync, family and groups. | The prompt requires no forced registration and offline creation. The current app requires login before anything works, so this is a rebuild of the data layer, not an add-on. | The current server-only storage model. |
| 3 | Pack-together is the headline, not the engine. Family view, group lists, private items, admin readiness view stay and get promoted. | This is the one thing Apple Notes, Google Keep and every packing app lack. The "intelligent engine" is a commodity. | The prompt's emphasis on the checklist engine as the core. |
| 4 | Four traveller profiles at launch: family, pilgrimage or religious, solo domestic, solo international. | Ten segments means ten template sets to maintain before a single user exists. Profiles only change which templates are suggested, so more can be added later without code. | The prompt's ten segments. |
| 5 | No destination intelligence at launch. Visa, passport validity, health and plug rules appear as "verify on the official site" items with a link field the user fills. | No live data source, and the prompt forbids fabricating rules. Modular so a verified source can be plugged in later. | Sections B, G and I of the prompt collapse into template items. |

Stage 2 (design) and Stage 3 (build) should treat the table above as fixed unless a comment here changes it.

## A. Vision, name and target users

**Vision:** the place a household or group gets ready for a trip together, so nothing is forgotten and nobody has to ask "did you pack the charger?" over WhatsApp.

**Why not Notes, Keep or Notion:** those are blank pages. This app knows what a trip is: dates drive a countdown and reminders, lists come pre-filled from a profile, progress is visible per person, private items stay private, and last trip's list becomes next trip's template in one tap.

**Why people come back:** every new trip starts from their own last trip, and the family or group is already connected. Retention comes from the group, not from features.

### Name options

All names below were checked only for sense, not for trademark or domain availability; that check is an open question in section L.

| Name | Angle | Risk |
| --- | --- | --- |
| **Packt** | Short, verb-like, "packed" said fast. | Packt Publishing owns the mark in tech books; likely blocked. |
| **Tayyar** ("ready" in Urdu and Arabic) | Fits pilgrimage and South Asian family users; one word, meaning "ready". | Meaningless to a Western user without the tagline "Ready, together". |
| **Packlist** | Says exactly what it is. | Generic; hard to own and hard to search. |
| **Baggo** | Playful, pastel-friendly, easy to say in any language. | Sounds like a game; weak on trust. |
| **Readyset** | "Ready, set, go" for trips; neutral worldwide. | Several existing apps use "ReadySet". |
| **Tagalong** | Says group travel. | Describes a person, not the task. |

**Decided (16 Oct 2026): Baggo – Your Travel Checklist.** Note: a US company, [BAGGO, Inc.](https://trademarkdir.com/owner/baggo-inc), holds BAGGO marks for a bag-toss game. Games and software are different trademark classes, but check the software class and the .app or .com domain before public launch; this stays an open question in section L.

### Target users at launch

| Profile | Who | What they need most | Starter templates |
| --- | --- | --- | --- |
| Family | One organiser (often a parent) plus 2 to 8 members on their own phones. | See who is ready; stop duplicate packing; kids' lists. | Family packing, kids, documents, home, departure day. |
| Pilgrimage or religious group | Jamaat, Umrah or Hajj group, church or temple trip; 5 to 50 people, one coordinator. | Shared group list (who brings what), modesty and prayer items, long bus or train days. | Qadian, Umrah, group travel, long-journey comfort. |
| Solo domestic | Weekend or work trip within the country. | Fast start, reuse last trip. | Weekend, work trip, train or flight. |
| Solo international | First or occasional international traveller. | Document and money checklist, "verify this" prompts. | International documents, money, digital readiness. |

Deferred profiles: business frequent flyer, adventure or outdoor, student abroad, senior or accessibility, backpacker. They are template packs added later without code changes.

## B. The ten traveller problems that matter most

Ordered by how often they happen multiplied by how much they hurt. The MVP must solve 1 to 7; 8 to 10 get a template item and nothing more.

1. Forgetting one essential (charger, medicine, ID) because the list was in someone's head.
2. Not knowing whether the other people on the trip are ready, and nagging them to find out.
3. Two people packing the same shared item, or nobody packing it.
4. Starting from zero every trip instead of from last time.
5. Losing the list because it lived in a chat thread, a paper note or a phone that died.
6. Departure-morning panic: no single "before you walk out" check.
7. Not knowing how many days are left, so packing starts the night before.
8. Not checking passport validity, visa or entry rules early enough (international only).
9. Cards blocked abroad, no cash, no backup payment.
10. Home left unsecured: gas, taps, plants, deliveries.

Not on the list on purpose: itinerary planning, bookings, maps, currency conversion, weather. Other apps do those; a link field on an item is enough.

## C. MVP scope and deferred features

The MVP is what one person can use alone offline in under a minute, plus what makes a group use it together. Everything else waits for evidence.

### In the MVP

| Area | Feature | Status today |
| --- | --- | --- |
| Trips | Create a trip with name, dates, optional destination and profile; countdown; archive; duplicate as new trip | Partly built (name, date, countdown) |
| Lists | Any number of named lists per trip; add, rename, reorder, delete; list kinds are just icons | Built |
| Items | Packed, not needed, remove; quantity; note; link; must-not-forget flag; private flag | Built except quantity, note, link, flag |
| Templates | Starter templates per profile; save any list as a template; copy from a past trip | Only one hard-coded list today |
| Departure day | A dedicated list that surfaces on the home screen on the travel date and the day before | Partly built ("Before you leave") |
| Readiness | Per-trip progress and a plain "what is still missing" summary; never a score | Built |
| Offline | Full use with no account and no network; local storage; install to home screen | Shell only today |
| Account (optional) | Name plus password; sync across devices; conflict rule | Built, but required |
| Family | Family code; see members' shared lists and progress; activity feed; private items hidden | Built |
| Groups | Shared list where everyone packs together, "packed by" | Built |
| Admin | Coordinator view: who is ready, reset passwords, add members | Built |
| Export | Download all my data as JSON; delete account and data | Not built |

### Deferred, with the reason

| Feature | Reason to wait |
| --- | --- |
| Verified visa, entry, health and plug data | No data source; fabrication is forbidden. Modular slot reserved. |
| Push notifications | Unreliable on iOS web; countdown and in-app reminders cover 80% of the need. |
| Hand luggage vs checked split | Add as an item tag once users ask; a second list works today. |
| Budget, currency, expenses | Different product; a link field covers bookings. |
| During-trip and homecoming lists | Just templates; ship after launch when the template engine exists. |
| Multiple languages | Design for it (no text in images, RTL-safe layout) but ship English first; Urdu and Hindi next. |
| Google or Apple sign-in | Name plus password is enough for a family; add if public sign-ups stall. |
| Readiness score | Creates false confidence; use a missing-items summary instead. |
| Paid tier | Nothing to charge for until groups prove retention. |

## D. Information architecture and navigation

Three bottom tabs, not five: **Home**, **Trips**, **Together**. Documents and Settings do not earn a tab. Documents are just a list inside a trip, and Settings is reached from the avatar on Home. The master prompt's five-tab layout was tested against the journeys in section G and failed two of them: a first-time user needs no Documents tab, and an offline user needs nothing in Settings.

Rules the navigation must keep:

- Any item is reachable in two taps from Home: Home shows the next trip, tap a list, tick.
- Trip creation is one screen with three fields (name, dates, who is going); everything else is behind "More details".
- No confirmation dialogs except delete trip and delete account.
- Together is hidden until the user has an account or a family or group code; the tab then appears in place, nothing moves.

_Navigation map (diagram lives in the Stage 1 doc on claude.ai)._ Home → next trip, countdown, still-missing summary, avatar → Settings (account, export, delete). Trips → new trip (3 fields), trip screen → list → item, templates, archived trips. Together → family → a member's shared lists, groups → shared group list, admin (coordinator), activity feed.

Home is the accented tab because it is where a returning user lands; the Together tab appears only once a family or group code exists.

## E. Screen inventory

Fourteen screens. Stage 2 designs every one of them in the five states that apply (loading, empty, error, success, offline); the table says which states matter for each.

| # | Screen | Primary action | States that matter |
| --- | --- | --- | --- |
| 1 | Welcome (first open, no data) | Create a trip or try the sample trip | Empty only |
| 2 | Home | Open the next trip's most urgent list | Empty, offline, departure day |
| 3 | New trip | Save with name, dates, who is going | Validation (dates), profile picker |
| 4 | Trip | Tick items; switch lists | Empty trip, all packed, date passed, private trip |
| 5 | List | Add item; tick, skip, remove, private | Empty list, filter to "still needed" |
| 6 | Item sheet (bottom sheet) | Edit name, quantity, note, link, must-not-forget, private | Validation |
| 7 | Departure day | Walk a short final list on the day | Appears on Home on the day and the day before |
| 8 | Templates | Pick a starter list or save a list as template | Empty (no saved templates), profile filter |
| 9 | Trips (all) | Open, duplicate, archive | Empty, archived section |
| 10 | Together (family) | See who is ready; open a member | No code yet, loading, offline (cached), empty family |
| 11 | Member's lists (read-only) | Read | Nothing shared, offline cached |
| 12 | Group list | Tick together; add; see "packed by" | Empty, left group, offline (read-only) |
| 13 | Admin | Readiness table; add, reset, delete people | Empty, error |
| 14 | Settings | Account, sync status, export JSON, delete everything | No account, sync error, offline |

Shared components: trip card, list chip row, item row, progress bar, countdown, sync badge, bottom sheet, toast, empty state. Stage 2 should design these once and reuse them, not design 14 screens from scratch.

## F. Visual direction

Recommendation: **Direction 2, "Bright Luggage"**. It keeps the light, saturated look the current app already has and the user prefers, drops the pastel softness that reads as a children's app, and gives the design system enough contrast to pass accessibility without a dark theme.

**Resolved (16 Oct 2026), "Design_1" (warm paper):** white background, one warm off-white surface `#F7F4EF`, warm borders, dark ink; four accents — Packed `#0E7C66`, Not needed `#B45309`, Private `#6D28D9`, Together `#D83A4E` — each bound to one meaning and always paired with an icon or word. Blue `#1361D1` is focus and links only, not a fifth meaning. Tokens are in `public/tokens.css`; the approved design is noted in `docs/DESIGN.md`.

|  | 1. Pastel Postcard (current) | 2. Bright Luggage (chosen) | 3. Boarding Pass |
| --- | --- | --- | --- |
| Feel | Soft, friendly, family | Confident, playful, clear | Precise, airline-like, grown-up |
| Background | Off-white with pastel radial glows | Pure white with one warm off-white surface | Light grey, paper texture |
| Accent | Peach, mint, lavender, butter, rose; low saturation | Four saturated accents (coral, teal, amber, violet) on white; one per meaning | Navy plus one orange; monochrome otherwise |
| Type | Fredoka plus Nunito | One variable sans (e.g. Plus Jakarta or Manrope) at 14/16/20/28 | Condensed grotesk, uppercase labels |
| Shape | 20 to 26 px radii everywhere | 12 px cards, 999 px chips, 8 px buttons | 4 px, hairline rules |
| Strength | Already built; warm | Readable at a glance; contrast passes; colour carries meaning (packed, skipped, private, group) | Distinctive; trustworthy for documents |
| Weakness | Contrast fails on pastel-on-pastel; feels made for kids; too many radii | Needs discipline so four accents do not become rainbow noise | Cold for families; dark theme temptation; uppercase hurts Urdu and Hindi later |

Tokens (now fixed in `public/tokens.css`): four accent colours each mapped to exactly one meaning (Packed `#0E7C66`, Not needed `#B45309`, Private `#6D28D9`, Together `#D83A4E`), plus a focus/link blue `#1361D1`; 4 px spacing scale, radii 12 card / 999 chip / 8 button, one shadow, minimum text 14 px, touch targets 44 px, motion under 200 ms and off under reduced-motion. No dark theme at launch; the system must not depend on one.

## G. End-to-end journeys

Six journeys, each with the step count Stage 3 must hit and Stage 4 must measure. The master prompt's nine journeys are folded in: updating dates and recovering a session are steps inside these, not journeys of their own.

| # | Journey | Steps (target) | Must be true at the end |
| --- | --- | --- | --- |
| 1 | First open to first tick, no account | Open, New trip, name + date, tap profile, tap a starter list, tick: 6 taps, under 60 s | A trip with lists exists on this device; nothing was sent anywhere |
| 2 | Returning user continues packing | Open, tap next trip on Home, tick: 2 taps | Progress and countdown are right after a reload and after 24 h |
| 3 | Pack a bag the night before | Open Trip, filter "still needed", tick through, tap "Everything packed" | Missing items are named by list; must-not-forget items are listed first |
| 4 | Connect a family and see who is ready | Together, enter code, see members and progress, open one member: 4 taps | Private items are absent everywhere; the feed shows only shared changes |
| 5 | Reuse last trip | Trips, duplicate, change name and dates: 3 taps | All items copied as "not packed"; private flags and must-not-forget flags kept |
| 6 | Departure day | Open on the day; Home shows the departure list first; walk it | Items not ticked are named; the list disappears from Home after the date |

Two cross-cutting journeys run inside all six: offline (every step above works with the network off and syncs when it returns) and interrupted session (close the app mid-edit; reopen; nothing is lost).

## H. List model, generation and persistence rules

A trip is a container of lists; a list is a named, typed set of items; a template is a list saved without a trip. That is the whole model, and the "engine" is three rules on top of it.

### Data model

| Object | Fields | Notes |
| --- | --- | --- |
| Trip | id, name, start date, end date, destination (free text), profile, travellers (count), archived, private, created, updated | Destination is text; no geocoding at launch |
| List | id, trip id, name, kind, icon, order, private | Kind is a tag from: packing, documents, home, money, digital, departure, during trip, custom. Kinds only pick an icon and a filter; the user can name a list anything |
| Item | id, list id, name, emoji, state (todo, packed, skip), quantity, note, link, must not forget, private, order | Exactly what exists today plus quantity, note, link, must-not-forget |
| Template | id, name, kind, profile tags, items (name, emoji, quantity) | Starter templates ship in the app; user templates are saved lists |
| Group list | id, group id, name, items with "packed by" | Shared between members; stays server-side as today |

### Generation rules

1. On New trip, the chosen profile suggests templates; the user ticks which to add. Nothing is added silently. A trip with no profile gets the three universal templates: documents, packing basics, departure day.
2. Changing dates or profile after creation suggests additions only. It never removes anything. Suggestions the user dismissed are remembered per trip and not re-offered.
3. Adding a template to a trip that already has an item with the same name (case-insensitive) skips that item; no duplicates.
4. Trip length changes quantities on items that declare one (socks, underwear): quantity = days, capped at 7 with a note "wash mid-trip".
5. Any list can be saved as a template; saving strips states, notes and private flags.
6. Duplicating a trip copies lists and items with all states reset to todo; flags and quantities kept.
7. "Verify" items (visa, passport validity, entry rules, plug type, vaccinations) are plain items with a link field and the prefix "Check:"; the app never states a rule.

### Persistence rules

- Every change is written locally first (IndexedDB) and applied to the screen before any network call.
- A signed-in device syncs the whole trip document with a revision number. Last write wins per trip, never per item, and the losing version is kept for 7 days as "recovered copy" in Settings, where the user can put it back. Family members only view each other's trips, so a conflict is always one person on two devices.
- Lists and items never leave the device unless the trip is shared, the user is signed in, or the user exports.
- Hiding something (private) never produces an activity event; this rule exists in the code today and stays.

## I. Offline-first PWA architecture

The device is the source of truth; the server is a sync and sharing service. This inverts today's build, where the server owns the data and the device only caches the shell. The stack stays what it is (plain JS front end, Node on Vercel, Upstash Redis) because nothing here needs a framework or a second database.

_Architecture (diagram lives in the Stage 1 doc on claude.ai)._ Phone: Screens → Local store (IndexedDB) → Sync queue (signed in only) ⇄ API; Service worker caches the shell and templates, never API data. Server (optional): API in lib/app.js (login, sync, family, groups, admin, privacy filter) → Upstash Redis; Shared views (family, groups, admin) are read online with the last copy cached.

Solid arrows always work; dashed arrows need a network and an account.

| Concern | Rule |
| --- | --- |
| Install | Web manifest, 192 and 512 icons, maskable icon; "Add to home screen" hint shown once after the first tick, never on first open |
| Caching | Shell and templates cached at install; new version activates on next open with a one-line "Updated" toast; API responses are never cached by the worker |
| Offline edits | All edits are local; the sync badge shows Saved on this phone, Syncing, Synced, or Could not sync with a retry button |
| Conflicts | Per-trip revision; the server rejects a stale revision, the client fetches, keeps the local version as "recovered copy" and re-applies its edits only if the user confirms |
| Storage limits | Warn at 80% of a 50 MB local budget; refuse new items past it; export always works. Server: 300 KB per trip, 100 trips per user |
| Clearing browser data | Loses everything not synced; Settings says so in one sentence and offers export |
| Permissions | Notifications are asked for only from the departure list, with the reason; denial changes nothing else |
| Not promised | Background sync and push on iOS; the app says reminders work while it is open |

## J. Privacy, accessibility and security

The app stores no identity documents, no payment details and no email; a public product that asks for less than a notes app is easier to trust and cheaper to defend.

### Data inventory

| Data | Where | Leaves the device when | Deleted by |
| --- | --- | --- | --- |
| Trips, lists, items, templates | IndexedDB on the device | Signed in (sync) or shared | Settings: delete everything |
| Name and password hash | Server (scrypt, salted; built) | At sign-up | Settings: delete account, or admin |
| Family and group membership, activity feed | Server | On join | Leave, or delete account |
| Private items | Device, and server if synced; filtered out of every shared response (built and tested) | Sync only | With the trip |
| Destination, dates, notes, links | Device, and server if synced | Sync or share | With the trip |
| Never collected | Email, phone, location, passport or ID numbers, card numbers, contacts, analytics beyond a daily anonymous open count |  |  |

Users are told in one sentence at sign-up what family and admin can see, as today. Private items are hidden, not encrypted; the doc says so in plain words in Settings.

### Security requirements (carried from the current build)

- scrypt password hashing, HMAC-signed HttpOnly cookies, same-origin check on writes, 8-try lock-out, size caps on every payload, CSP and frame-ancestors none. All exist and are tested.
- New: rate limit on the share-code and group-join endpoints per account (exists), export endpoint returns only the caller's data, delete is a hard delete within 24 h.

### Accessibility requirements

- Text minimum 14 px; contrast 4.5:1 for text and 3:1 for the four accent meanings on white, each also carried by an icon or word, never colour alone.
- Touch targets 44 by 44; the item row's three actions get 48.
- Full keyboard path: tab order follows reading order, visible focus ring, Escape closes sheets, Enter adds an item.
- Every control has a name; progress and sync badge are live regions; the countdown is not a live region (it would announce every second).
- Reduced motion turns off every animation; the app is fully usable with none.
- Layout holds from 320 px wide; no horizontal scroll; RTL-safe flex layouts so Urdu and Arabic can be added later without redesign.

## K. Acceptance criteria

Stage 4 signs off against these numbers, measured, not asserted. Anything not measured is reported as unverified.

| Area | Criterion | How it is measured |
| --- | --- | --- |
| Speed | First open to interactive under 2 s on a mid-range Android over 4G; repeat open under 1 s | Lighthouse mobile, three runs, median |
| First value | A new user reaches the first tick in 6 taps and under 60 s with no account | Timed walkthrough by someone who has never seen the app |
| Offline | Journeys 1, 2, 3, 5 and 6 complete with the network off; changes sync within 10 s of reconnecting | DevTools offline toggle and airplane mode on a real phone |
| Persistence | No data lost after reload, after closing the browser, and after 24 h | Scripted check plus manual |
| Install | Installable on Android Chrome and iOS Safari; icon and name correct; opens standalone | Manual on both |
| Privacy | Zero private items in any family, group, admin, share or feed response | Automated tests (exist today; must stay green) plus a manual check |
| Accessibility | Lighthouse accessibility 95 or above; axe reports zero serious issues; full keyboard walk of journeys 1 and 3; VoiceOver walk of journey 2 | Tool run plus manual |
| Layout | No horizontal scroll at 320, 375, 768 and 1280 px | Manual |
| Reliability | API tests green; zero 5xx under a 2,000-request stress run | Existing suite plus a stress script |
| Honesty | Every "Check:" item links out and states no rule; no exchange rates, no visa claims anywhere in copy | Copy review |

## L. Risks, assumptions and open questions

The biggest risk is not technical: a public product needs people to invite their family, and nothing here proves they will. Launch to real groups before building anything in the deferred list.

### Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Nobody invites their family; the moat is never used | High | Launch with three real groups (one family, one pilgrimage group, one friends trip) before public release; measure invites per trip |
| Local-first rewrite breaks the working family and admin features | Medium | Keep lib/app.js and its 34 tests as the contract; the rewrite touches the client data layer only |
| iOS Safari evicts IndexedDB after 7 days of non-use | Medium | Install to home screen (installed web apps are not subject to the 7-day rule), sign-in nudge after the first trip is complete, export reminder. No localStorage fallback: Safari evicts it with IndexedDB |
| Four accents become visual noise | Medium | Each accent is bound to one meaning in the design system; Stage 2 reviews every screen against that table |
| Name is trademarked or the domain is taken | Medium | Check before Stage 2 |
| Free tiers (Vercel Hobby, Upstash) are for personal use; a public product may breach terms or limits | High | Move to a paid Vercel plan at public launch; budget the cost before launch |
| Users expect visa and rule answers the app refuses to give | Medium | Copy makes the "Check:" pattern obvious; links go to official sites the user enters |

### Assumptions

- English first; Urdu and Hindi within three months of launch.
- One organiser per family or group; most members only tick.
- Trips are 1 to 30 days; longer trips use the same model with capped quantities.
- The current pastel app ships to the family now and serves as the live baseline while this product is built.

### Open questions

- [ ] Name is Baggo. Still open: software-class trademark clearance against BAGGO, Inc. and domain availability
- [ ] Does "Together" need admin at all for public users, or only for a coordinator who created the family?
- [ ] Should a trip be shareable by link without any account (view only)? The share code exists today; keep it?
- [ ] Which three real groups test the beta, and by when?
- [ ] Paid plan and cost ceiling at public launch?
- [ ] Starter template content: who writes the pilgrimage and international packs, and are they reviewed by someone who has done the trip?
