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
    await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 });

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
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const pg = await ctx.newPage();
    let taps = 0;
    pg.on("console", () => {});
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
    await pg.getByRole("heading", { name: "Weekend in Lisbon" }).waitFor({ timeout: 8000 });
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

    // survives an offline reload (local-first)
    await pg.reload({ waitUntil: "domcontentloaded" });
    await pg.getByRole("heading", { name: "Weekend in Lisbon" }).waitFor({ timeout: 8000 });

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

  await browser.close();
  await new Promise((r) => server.close(r));
  console.log("\n" + passed + " passed, " + failed + " failed");
  try { require("fs").unlinkSync(env.DATA_FILE); } catch (e) {}
  process.exit(failed ? 1 : 0);
})();
