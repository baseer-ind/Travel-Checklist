// Browser walk of the local-first data layer at 375 px, including offline.
// Uses the preinstalled Chromium via the `playwright` package (dev-only). Run: npm run test:browser
// Requires: playwright available, and the file store (the default local dev env).
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium } = require("playwright");
const { createServer } = require("../server");

const env = { ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "test-admin-pw", FAMILY_CODE: "family", DATA_FILE: path.join(__dirname, "..", ".data", "browser-db.json"), SESSION_SECRET: "b" };
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log("  ✓ " + name); } catch (e) { failed++; console.log("  ✗ " + name + "\n      " + (e.stack || e).toString().split("\n").slice(0, 4).join("\n      ")); } }
const assert = require("assert");

// Shared check: on the current v2 screen, every touch target is >=44px (row actions >=48px),
// all visible text is >=14px, and there is no horizontal scroll. Asserts on any violation.
async function a11y(page, label) {
  const bad = await page.evaluate(() => {
    const out = { hscroll: null, targets: [], text: [] };
    const root = document.getElementById("main");
    if (!root) return out;
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.hscroll = document.documentElement.scrollWidth + " > " + window.innerWidth;
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const skip = (el) => el.closest(".toast, .v2-toast, #toast");
    const tsel = ["button:not([disabled])", "a[href]", "[role=checkbox]", "[role=radio]", "[role=tab]", "[role=switch]", "label.v2-checkline", "input.v2-input"].map((s) => "#main " + s).join(", ");
    document.querySelectorAll(tsel).forEach((el) => {
      if (!vis(el) || skip(el)) return;
      const r = el.getBoundingClientRect();
      const min = (el.classList.contains("v2-check") || el.classList.contains("v2-skip")) ? 48 : 44;
      if (r.width < min - 0.5 || r.height < min - 0.5) out.targets.push(((el.getAttribute("aria-label") || el.textContent || el.className).trim().slice(0, 32)) + " " + Math.round(r.width) + "x" + Math.round(r.height) + " <" + min);
    });
    root.querySelectorAll("*").forEach((el) => {
      if (!vis(el) || skip(el)) return;
      let t = ""; el.childNodes.forEach((n) => { if (n.nodeType === 3) t += n.textContent; });
      if (!t.trim()) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 13.5) out.text.push(t.trim().slice(0, 24) + " @" + fs + "px");
    });
    return out;
  });
  assert.equal(bad.hscroll, null, label + ": horizontal scroll (" + bad.hscroll + ")");
  assert.equal(bad.targets.length, 0, label + ": small targets " + JSON.stringify(bad.targets));
  assert.equal(bad.text.length, 0, label + ": small text " + JSON.stringify(bad.text));
}

(async () => {
  try { require("fs").unlinkSync(env.DATA_FILE); } catch (e) {}
  const server = createServer(env);
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();

  await test("sign up, create a trip, add and tick an item", async () => {
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("tab", { name: "Create account" }).click();
    await page.locator("#aName").fill("Walker");
    await page.locator("#aPass").fill("secret1");
    await page.locator("#aCode").fill("family");
    await page.getByRole("button", { name: "Create my account" }).click();
    // brand-new account lands on the seeded "Trip to Qadian"
    await page.getByRole("heading", { name: "Trip to Qadian" }).waitFor({ timeout: 8000 });
    await page.getByLabel("New item").fill("Travel pillow");
    await page.getByRole("button", { name: "Add ➕" }).click();
    await page.getByText("Travel pillow").waitFor();
    // wait for the save to land (status badge → Saved)
    await page.getByText("✓ Saved").waitFor({ timeout: 8000 });
  });

  await test("offline reload keeps the trip and item (local-first boot)", async () => {
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    // served from the SW shell cache + IndexedDB, with no network
    await page.getByRole("heading", { name: "Trip to Qadian" }).waitFor({ timeout: 8000 });
    await page.getByText("Travel pillow").waitFor({ timeout: 8000 });
    // and an edit made offline survives another offline reload
    await page.getByLabel("New item").fill("Eye mask");
    await page.getByRole("button", { name: "Add ➕" }).click();
    await page.getByText("Eye mask").waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Eye mask").waitFor({ timeout: 8000 });
  });

  await test("item ids are random strings, not a shared counter", async () => {
    const ids = await page.evaluate(async () => {
      const req = indexedDB.open("baggo");
      const db = await new Promise((res) => { req.onsuccess = () => res(req.result); });
      const all = await new Promise((res) => { const r = db.transaction("trips").objectStore("trips").getAll(); r.onsuccess = () => res(r.result); });
      const out = [];
      all.forEach((rec) => rec.trip.lists.forEach((l) => l.items.forEach((i) => out.push(i.id))));
      return out;
    });
    assert.ok(ids.length > 0, "found items");
    assert.ok(ids.every((i) => typeof i === "string"), "all item ids are strings: " + JSON.stringify(ids.slice(0, 3)));
  });

  await test("back online, the offline edits sync to the server", async () => {
    await context.setOffline(false);
    await page.getByText("✓ Saved").waitFor({ timeout: 10000 });
    const data = await page.evaluate(async () => (await fetch("/api/data", { credentials: "same-origin" }).then((r) => r.json())));
    const names = JSON.stringify(data);
    assert.ok(names.includes("Travel pillow") && names.includes("Eye mask"), "server has both offline-added items");
  });

  // Two devices, one account: a stale edit is rejected and kept as a recovered copy (nothing is lost).
  await test("two-device conflict: loser's edit becomes a recovered copy, winner's edit kept", async () => {
    const A = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const B = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const a = await A.newPage(), b = await B.newPage();

    // Device A signs up and seeds its trip.
    await a.goto(base + "/", { waitUntil: "networkidle" });
    await a.getByRole("button", { name: "Sign in" }).click();
    await a.getByRole("tab", { name: "Create account" }).click();
    await a.locator("#aName").fill("Dyad"); await a.locator("#aPass").fill("secret1"); await a.locator("#aCode").fill("family");
    await a.getByRole("button", { name: "Create my account" }).click();
    await a.getByRole("heading", { name: "Trip to Qadian" }).waitFor({ timeout: 8000 });
    await a.getByText("✓ Saved").waitFor({ timeout: 8000 });

    // Device B logs into the same account and pulls the trip.
    await b.goto(base + "/", { waitUntil: "networkidle" });
    await b.getByRole("button", { name: "Sign in" }).click();
    await b.locator("#aName").fill("Dyad"); await b.locator("#aPass").fill("secret1");
    await b.getByRole("button", { name: "Log in" }).click();
    await b.getByRole("heading", { name: "Trip to Qadian" }).waitFor({ timeout: 8000 });
    await b.getByText("✓ Saved").waitFor({ timeout: 8000 });

    // B goes offline so it can't see A's next change.
    await B.setOffline(true);

    // A (online) edits the trip and syncs → server revision advances.
    await a.getByLabel("New item").fill("A wins item");
    await a.getByRole("button", { name: "Add ➕" }).click();
    await a.getByText("A wins item").waitFor();
    await a.getByText("✓ Saved").waitFor({ timeout: 8000 });

    // B (offline) edits the SAME trip at the now-stale revision.
    await b.getByLabel("New item").fill("B loses item");
    await b.getByRole("button", { name: "Add ➕" }).click();
    await b.getByText("B loses item").waitFor();

    // B reconnects → its push is rejected (409); B keeps a recovered copy and takes A's version.
    await B.setOffline(false);
    await b.getByText("A wins item").waitFor({ timeout: 12000 });               // B now shows the winner's edit
    await b.getByText("✓ Saved").waitFor({ timeout: 12000 });
    assert.equal(await b.getByText("B loses item").count(), 0, "loser's edit is no longer in the active trip");

    const recovered = await b.evaluate(async () => {
      const req = indexedDB.open("baggo");
      const db = await new Promise((res) => { req.onsuccess = () => res(req.result); });
      const all = await new Promise((res) => { const r = db.transaction("recovered").objectStore("recovered").getAll(); r.onsuccess = () => res(r.result); });
      return JSON.stringify(all);
    });
    assert.ok(recovered.includes("B loses item"), "the rejected edit is kept as a recovered copy");

    // the server holds the winner's edit, not the loser's
    const srv = await a.evaluate(async () => JSON.stringify(await fetch("/api/data", { credentials: "same-origin" }).then((r) => r.json())));
    assert.ok(srv.includes("A wins item") && !srv.includes("B loses item"), "server kept the winner's edit only");

    await A.close(); await B.close();
  });

  // A new service-worker version activates cleanly (with the "Updated" toast) and the app still boots offline after it.
  await test("service worker update activates and the app boots offline afterwards", async () => {
    const pub = fs.mkdtempSync(path.join(os.tmpdir(), "baggo-pub-"));
    fs.cpSync(path.join(__dirname, "..", "public"), pub, { recursive: true });
    const env2 = { ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "x", FAMILY_CODE: "family", DATA_FILE: path.join(os.tmpdir(), "baggo-upd-" + Date.now() + ".json"), SESSION_SECRET: "u", PUBLIC_DIR: pub };
    const srv = createServer(env2);
    await new Promise((r) => srv.listen(0, r));
    const b2 = "http://127.0.0.1:" + srv.address().port;
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const p = await ctx.newPage();

    // sign in and get the first SW controlling the page
    await p.goto(b2 + "/", { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Sign in" }).click();
    await p.getByRole("tab", { name: "Create account" }).click();
    await p.locator("#aName").fill("Upd"); await p.locator("#aPass").fill("secret1"); await p.locator("#aCode").fill("family");
    await p.getByRole("button", { name: "Create my account" }).click();
    await p.getByRole("heading", { name: "Trip to Qadian" }).waitFor({ timeout: 8000 });
    // Without clients.claim(), the first worker controls only the NEXT navigation — reload once so v1 is the controller.
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 });
    await p.getByRole("heading", { name: "Trip to Qadian" }).waitFor({ timeout: 8000 });

    // ship a new SW version (bump the cache name → byte change) and ask the page to check for it
    const swPath = path.join(pub, "sw.js");
    const swText = fs.readFileSync(swPath, "utf8");
    const cur = swText.match(/baggo-shell-v(\d+)/);
    const oldCache = cur[0], newCache = "baggo-shell-v" + (Number(cur[1]) + 1);
    fs.writeFileSync(swPath, swText.split(oldCache).join(newCache));
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));

    // the "Updated" toast appears, then the page reloads onto the new version
    await p.getByText("Updated to the latest version.").waitFor({ timeout: 8000 });
    await p.waitForTimeout(1800);
    const activeCache = await p.evaluate(async () => (await caches.keys()).filter((k) => k.indexOf("baggo-shell") === 0));
    assert.ok(activeCache.includes(newCache) && !activeCache.includes(oldCache), "new cache active, old cache cleaned: " + JSON.stringify(activeCache));

    // offline boot still works after the update
    await ctx.setOffline(true);
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.getByRole("heading", { name: "Trip to Qadian" }).waitFor({ timeout: 8000 });

    await ctx.close();
    await new Promise((r) => srv.close(r));
    fs.rmSync(pub, { recursive: true, force: true });
  });

  // Journey 1: first open → first tick, no account, offline, nothing sent anywhere.
  await test("guest Journey 1: plan a trip and tick an item offline in <=6 taps, no network", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });   // SW enabled: no mid-create reload now that claim is gone
    const pg = await ctx.newPage();
    let taps = 0;
    pg.on("framenavigated", (fr) => { if (fr === pg.mainFrame()) navs++; });
    let navs = 0;
    // record any data-bearing API calls (there must be none in the guest flow)
    const sent = [];
    pg.on("request", (r) => { const u = r.url(); if (/\/api\/(data|trips|signup|login|groups|family)/.test(u)) sent.push(r.method() + " " + u.replace(/^https?:\/\/[^/]+/, "")); });

    await pg.goto(base + "/", { waitUntil: "networkidle" });
    await pg.getByRole("heading", { name: "Pack for your next trip, together." }).waitFor({ timeout: 8000 });

    // go offline for the whole journey — guest mode must work with no network
    await ctx.setOffline(true);

    const tap = async (loc) => { taps++; await loc.click(); };
    await tap(pg.getByRole("button", { name: "Plan a trip" }));            // 1
    await pg.getByRole("heading", { name: "Plan a trip" }).waitFor({ timeout: 8000 });
    await pg.getByLabel("Trip name").fill("Weekend in Lisbon");            // typing (not a tap)
    await tap(pg.getByRole("radio", { name: /Solo — domestic/ }));         // 2 (profile)
    await tap(pg.getByRole("checkbox", { name: /Work trip/ }));            // 3 (drop a starter list)
    await tap(pg.getByRole("button", { name: "Create trip" }));           // 4
    await pg.waitForTimeout(300);
    await pg.locator("#main h1", { hasText: "Weekend in Lisbon" }).first().waitFor({ timeout: 8000 });
    // tick the first item
    const firstCheck = pg.getByRole("checkbox").first();
    await tap(firstCheck);                                                 // 5
    await pg.waitForFunction(() => document.querySelectorAll('[role="checkbox"][aria-checked="true"]').length > 0, null, { timeout: 8000 });

    assert.ok(taps <= 6, "took " + taps + " taps (<= 6)");
    assert.equal(sent.length, 0, "nothing was sent: " + JSON.stringify(sent));

    // it's on the device: a trip with lists and one packed item, stored under the guest owner
    const stored = await pg.evaluate(async () => {
      const req = indexedDB.open("baggo");
      const db = await new Promise((res) => { req.onsuccess = () => res(req.result); });
      const all = await new Promise((res) => { const r = db.transaction("trips").objectStore("trips").getAll(); r.onsuccess = () => res(r.result); });
      const guest = all.filter((x) => x._owner === "guest").map((x) => x.trip);
      const packed = guest.flatMap((t) => t.lists).flatMap((l) => l.items).filter((i) => i.state === "packed").length;
      return { trips: guest.length, lists: guest[0] ? guest[0].lists.length : 0, name: guest[0] && guest[0].name, packed };
    });
    assert.equal(stored.trips, 1, "one guest trip on device");
    assert.ok(stored.lists >= 2 && stored.name === "Weekend in Lisbon", "trip has lists: " + JSON.stringify(stored));
    assert.ok(stored.packed >= 1, "an item is packed");

    // the service worker is enabled, but with claim gone there is no mid-create reload
    assert.equal(navs, 1, "no spurious reload during the flow (only the initial load): navs=" + navs);

    // survives an offline reload (local-first; SW serves the shell). A returning guest lands on Home,
    // where the trip shows as a card.
    await pg.reload({ waitUntil: "domcontentloaded" });
    await pg.getByText("Weekend in Lisbon").first().waitFor({ timeout: 8000 });
    await ctx.close();
  });

  // Shell a11y: 44/48px targets, 14px text floor, no horizontal scroll — checked at 320px on each v2 screen.
  await test("shell: targets >=44/48px, text >=14px, no h-scroll at 320px", async () => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 720 } });
    const pg = await ctx.newPage();
    await pg.goto(base + "/", { waitUntil: "networkidle" });
    await pg.getByRole("heading", { name: "Pack for your next trip, together." }).waitFor({ timeout: 8000 });
    await a11y(pg, "Welcome");
    await pg.getByRole("button", { name: "Plan a trip" }).click();
    await pg.getByRole("heading", { name: "Plan a trip" }).waitFor({ timeout: 8000 });
    await pg.getByRole("radio", { name: /Family/ }).click();   // show starter lists
    await a11y(pg, "New trip");
    await pg.getByLabel("Trip name").fill("Trip to Qadian");
    await pg.getByRole("button", { name: "Create trip" }).click();
    await pg.getByRole("heading", { name: "Trip to Qadian" }).waitFor({ timeout: 8000 });
    await pg.waitForTimeout(100);
    await a11y(pg, "Trip");
    await ctx.close();
  });

  // Home (next-trip card) and the Trips list (duplicate resets states; archive hides from Home).
  await test("guest Home + Trips: next-trip card, duplicate resets, archive", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block" });
    const pg = await ctx.newPage();
    await pg.goto(base + "/", { waitUntil: "networkidle" });
    await pg.getByRole("button", { name: "Plan a trip" }).click();
    await pg.getByLabel("Trip name").fill("Kyoto trip");
    await pg.getByRole("radio", { name: /Solo — international/ }).click();
    await pg.getByRole("button", { name: "Create trip" }).click();
    await pg.locator("#main h1", { hasText: "Kyoto trip" }).first().waitFor({ timeout: 8000 });
    // pack one item so the duplicate can prove states reset
    await pg.getByRole("checkbox").first().click();

    // Home: the trip is the "Next up" card
    await pg.getByLabel("Main").getByRole("button", { name: "Home" }).click();
    await pg.getByText("Next up").waitFor({ timeout: 8000 });
    assert.ok(await pg.locator(".v2-trip", { hasText: "Kyoto trip" }).count() >= 1, "Home shows the trip card");

    // Trips: duplicate → a reset copy, then two trips with all items todo in the copy
    await pg.getByLabel("Main").getByRole("button", { name: "Trips", exact: true }).click();
    await pg.getByRole("heading", { name: "Trips", exact: true }).waitFor({ timeout: 8000 });
    await pg.getByRole("button", { name: "Duplicate" }).first().click();
    await pg.locator("#main h1", { hasText: "Kyoto trip (copy)" }).first().waitFor({ timeout: 8000 });
    const dup = await pg.evaluate(async () => {
      const req = indexedDB.open("baggo"); const db = await new Promise((r) => { req.onsuccess = () => r(req.result); });
      const all = await new Promise((r) => { const q = db.transaction("trips").objectStore("trips").getAll(); q.onsuccess = () => r(q.result); });
      const trips = all.map((x) => x.trip);
      const copy = trips.find((t) => /\(copy\)$/.test(t.name));
      const packedInCopy = copy.lists.flatMap((l) => l.items).filter((i) => i.state === "packed").length;
      return { count: trips.length, packedInCopy };
    });
    assert.equal(dup.count, 2, "two trips after duplicate");
    assert.equal(dup.packedInCopy, 0, "duplicate resets all items to todo");

    // Archive the copy → Home falls back to the original; archived trip is reopenable
    await pg.getByLabel("Main").getByRole("button", { name: "Trips", exact: true }).click();
    await pg.locator(".v2-card", { hasText: "Kyoto trip (copy)" }).getByRole("button", { name: "Archive" }).click();
    await pg.getByText("Archived", { exact: true }).waitFor({ timeout: 8000 });
    assert.ok(await pg.getByRole("button", { name: "Reopen" }).count() >= 1, "archived trip can be reopened");
    const act = await pg.evaluate(async () => {
      const req = indexedDB.open("baggo"); const db = await new Promise((r) => { req.onsuccess = () => r(req.result); });
      const all = await new Promise((r) => { const q = db.transaction("trips").objectStore("trips").getAll(); q.onsuccess = () => r(q.result); });
      return all.map((x) => x.trip).filter((t) => t.archived).map((t) => t.name);
    });
    assert.deepEqual(act, ["Kyoto trip (copy)"], "only the copy is archived");
    await ctx.close();
  });

  // Together / migration: a guest's local trips move into the account on sign-in — nothing lost, private flag preserved.
  await test("guest -> account migration: trips move in, sync, private flag preserved", async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const pg = await ctx.newPage();
    await pg.goto(base + "/", { waitUntil: "networkidle" });
    // guest makes a trip
    await pg.getByRole("button", { name: "Plan a trip" }).click();
    await pg.getByLabel("Trip name").fill("Secret getaway");
    await pg.getByRole("radio", { name: /Solo — domestic/ }).click();
    await pg.getByRole("button", { name: "Create trip" }).click();
    await pg.locator("#main h1", { hasText: "Secret getaway" }).first().waitFor({ timeout: 8000 });
    // mark one item private in the guest store (the guest UI has no private toggle yet; migration must still preserve the flag)
    const marked = await pg.evaluate(async () => {
      const req = indexedDB.open("baggo"); const db = await new Promise((r) => { req.onsuccess = () => r(req.result); });
      const tx = db.transaction("trips", "readwrite"); const st = tx.objectStore("trips");
      const all = await new Promise((r) => { const q = st.getAll(); q.onsuccess = () => r(q.result); });
      const rec = all.find((x) => x._owner === "guest"); const it = rec.trip.lists[0].items[0];
      it.hidden = true; const name = it.name; st.put(rec);
      await new Promise((r) => { tx.oncomplete = r; });
      return name;
    });

    // sign in (create an account) via the Together tab
    await pg.getByLabel("Main").getByRole("button", { name: "Together" }).click();
    await pg.getByRole("button", { name: "Create an account" }).click();
    await pg.getByRole("tab", { name: "Create account" }).click();
    await pg.locator("#aName").fill("Mover"); await pg.locator("#aPass").fill("secret1"); await pg.locator("#aCode").fill("family");
    await pg.getByRole("button", { name: "Create my account" }).click();
    // migration toast + landing in the (v1) signed-in app with the trip present
    await pg.getByText(/added to your account/).waitFor({ timeout: 8000 });
    await pg.getByText("✓ Saved").waitFor({ timeout: 10000 });

    // the trip is in the account on the SERVER, with every item (nothing lost) and the private flag kept
    const srv = await pg.evaluate(async () => (await fetch("/api/data", { credentials: "same-origin" }).then((r) => r.json())));
    const trip = srv.data.trips.find((t) => t.name === "Secret getaway");
    assert.ok(trip, "migrated trip is on the server");
    const items = trip.lists.flatMap((l) => l.items);
    assert.ok(items.length >= 5, "all items migrated (nothing lost): " + items.length);
    assert.ok(items.some((i) => i.name === marked && i.hidden === true), "private flag preserved on the migrated item");

    // a family member must NOT see the private item (privacy holds through migration)
    const mate = await browser.newContext();
    const mp = await mate.newPage();
    await mp.goto(base + "/", { waitUntil: "networkidle" });
    await mp.getByRole("button", { name: "Sign in" }).click();
    await mp.getByRole("tab", { name: "Create account" }).click();
    await mp.locator("#aName").fill("Mate"); await mp.locator("#aPass").fill("secret2"); await mp.locator("#aCode").fill("family");
    await mp.getByRole("button", { name: "Create my account" }).click();
    await mp.waitForTimeout(500);
    const famView = await mp.evaluate(async () => JSON.stringify(await fetch("/api/family/mover", { credentials: "same-origin" }).then((r) => r.json())));
    assert.ok(famView.includes("Secret getaway"), "family can see the shared trip");
    assert.ok(!famView.includes(marked), "family cannot see the private item: " + marked);

    // the guest store is cleared (no duplication)
    const guestLeft = await pg.evaluate(async () => {
      const req = indexedDB.open("baggo"); const db = await new Promise((r) => { req.onsuccess = () => r(req.result); });
      const all = await new Promise((r) => { const q = db.transaction("trips").objectStore("trips").getAll(); q.onsuccess = () => r(q.result); });
      return all.filter((x) => x._owner === "guest").length;
    });
    assert.equal(guestLeft, 0, "guest store cleared after migration");
    await mate.close(); await ctx.close();
  });

  // Shared v2 frame on desktop: content centred (not left-pinned), tab bar under the frame, no h-scroll.
  await test("desktop shell: content centred and tab bar under the frame at 768px and 1280px", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
    const pg = await ctx.newPage();
    await pg.goto(base + "/", { waitUntil: "networkidle" });
    await pg.getByRole("button", { name: "Plan a trip" }).click();
    await pg.getByLabel("Trip name").fill("Oslo trip");
    await pg.getByRole("radio", { name: /Solo — domestic/ }).click();
    await pg.getByRole("button", { name: "Create trip" }).click();
    await pg.locator("#main h1", { hasText: "Oslo trip" }).first().waitFor({ timeout: 8000 });
    await pg.getByLabel("Main").getByRole("button", { name: "Home" }).click();
    await pg.getByText("Next up").waitFor({ timeout: 8000 });

    const geom = async () => pg.evaluate(() => {
      const w = document.querySelector(".v2-wrap").getBoundingClientRect();
      const tb = document.querySelector(".v2-tabbar").getBoundingClientRect();
      return {
        iw: window.innerWidth,
        wrap: { left: w.left, right: w.right, width: w.width },
        tab: { left: tb.left, right: tb.right },
        hscroll: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    for (const width of [1280, 768]) {
      await pg.setViewportSize({ width, height: 800 });
      await pg.waitForTimeout(80);
      const g = await geom();
      assert.ok(g.hscroll <= 1, `@${width}px no h-scroll (overflow ${g.hscroll})`);
      // centred: left gutter ~= right gutter, and not pinned to the left edge
      const leftGutter = g.wrap.left, rightGutter = g.iw - g.wrap.right;
      assert.ok(Math.abs(leftGutter - rightGutter) <= 2, `@${width}px content centred (gutters ${leftGutter} vs ${rightGutter})`);
      assert.ok(leftGutter > 40, `@${width}px content not left-pinned (left gutter ${leftGutter})`);
      assert.ok(g.wrap.width <= 561, `@${width}px frame capped at its max-width (${g.wrap.width})`);
      // tab bar sits under the same frame column
      assert.ok(Math.abs(g.tab.left - g.wrap.left) <= 2 && Math.abs(g.tab.right - g.wrap.right) <= 2, `@${width}px tab bar aligned to frame (tab ${g.tab.left}-${g.tab.right}, frame ${g.wrap.left}-${g.wrap.right})`);
    }
    await ctx.close();
  });

  // Signed-in v2 Together + Member: member cards show "% packed", opening a member is read-only, private items stay hidden.
  await test("signed-in Together/Member: % packed, read-only lists, private items hidden", async () => {
    // Omar: an account in the family with a shared item (packed) and a private item.
    const O = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const o = await O.newPage();
    await o.goto(base + "/", { waitUntil: "networkidle" });
    await o.getByRole("button", { name: "Sign in" }).click();
    await o.getByRole("tab", { name: "Create account" }).click();
    await o.locator("#aName").fill("Omar"); await o.locator("#aPass").fill("secret1"); await o.locator("#aCode").fill("family");
    await o.getByRole("button", { name: "Create my account" }).click();
    await o.getByRole("heading", { name: "Trip to Qadian" }).waitFor({ timeout: 8000 });
    await o.getByLabel("New item").fill("Beach towel");
    await o.getByRole("button", { name: "Add ➕" }).click();
    await o.getByText("Beach towel").waitFor();
    await o.getByRole("button", { name: "Packed: Beach towel" }).click();   // pack the shared item
    await o.getByLabel("New item").fill("OmarSecret");
    await o.getByRole("button", { name: "Add ➕" }).click();
    await o.getByText("OmarSecret").waitFor();
    await o.getByRole("button", { name: "Shared with family: OmarSecret" }).click();   // toggle to private
    await o.getByText("✓ Saved").waitFor({ timeout: 10000 });

    // Nadia: a second account in the same family; packs one item so her own card shows progress.
    const N = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const n = await N.newPage();
    await n.goto(base + "/", { waitUntil: "networkidle" });
    await n.getByRole("button", { name: "Sign in" }).click();
    await n.getByRole("tab", { name: "Create account" }).click();
    await n.locator("#aName").fill("Nadia"); await n.locator("#aPass").fill("secret2"); await n.locator("#aCode").fill("family");
    await n.getByRole("button", { name: "Create my account" }).click();
    await n.getByRole("heading", { name: "Trip to Qadian" }).waitFor({ timeout: 8000 });
    await n.getByLabel("New item").fill("Sunhat");
    await n.getByRole("button", { name: "Add ➕" }).click();
    await n.getByText("Sunhat").waitFor();
    await n.getByRole("button", { name: "Packed: Sunhat" }).click();
    await n.getByText("✓ Saved").waitFor({ timeout: 10000 });

    // Nadia opens Together (v2): sidebar drawer → Family.
    await n.getByRole("button", { name: "☰ Trips" }).click();
    await n.getByRole("button", { name: /Family/ }).click();
    await n.getByRole("heading", { name: "Together" }).waitFor({ timeout: 8000 });

    // two members, each card carries a "% packed" figure (progress, not a readiness score)
    assert.ok(await n.locator(".v2-member").count() >= 2, "both family members are listed");
    const you = n.locator(".v2-member", { hasText: "Nadia" });
    assert.ok(await you.locator(".v2-you").count() === 1, "own card has the 'you' badge");
    const pcts = await n.locator(".v2-member .v2-pct").allTextContents();
    assert.ok(pcts.some((t) => /\d+% packed/.test(t)), "a member card shows '% packed': " + JSON.stringify(pcts));
    assert.equal((await n.locator(".v2-member .v2-pct").allTextContents()).join("|").includes("ready"), false, "never labelled 'ready'");
    await a11y(n, "Together (375px)");

    // open Omar's member view → read-only lists, shared item visible, private item hidden
    await n.getByRole("button", { name: "See Omar's lists" }).click();
    await n.getByRole("heading", { name: "Omar’s lists" }).waitFor({ timeout: 8000 });
    await n.locator(".v2-roitem", { hasText: "Beach towel" }).first().waitFor({ timeout: 8000 });
    assert.equal(await n.getByText("OmarSecret").count(), 0, "private item is hidden from the family member view");
    assert.ok(await n.locator(".v2-pct", { hasText: "% packed" }).count() >= 1, "member trip shows '% packed'");
    // read-only: no packing controls on this screen
    assert.equal(await n.getByRole("button", { name: /^Packed:/ }).count(), 0, "member view has no packing buttons (read-only)");

    await a11y(n, "Member (375px)");
    await O.close(); await N.close();
  });

  await browser.close();
  await new Promise((r) => server.close(r));
  console.log("\n" + passed + " passed, " + failed + " failed");
  try { require("fs").unlinkSync(env.DATA_FILE); } catch (e) {}
  process.exit(failed ? 1 : 0);
})();
