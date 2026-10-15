// Browser walk of the local-first data layer at 375 px, including offline.
// Uses the preinstalled Chromium via the `playwright` package (dev-only). Run: npm run test:browser
// Requires: playwright available, and the file store (the default local dev env).
const path = require("path");
const { chromium } = require("playwright");
const { createServer } = require("../server");

const env = { ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "test-admin-pw", FAMILY_CODE: "family", DATA_FILE: path.join(__dirname, "..", ".data", "browser-db.json"), SESSION_SECRET: "b" };
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log("  ✓ " + name); } catch (e) { failed++; console.log("  ✗ " + name + "\n      " + (e.stack || e).toString().split("\n").slice(0, 4).join("\n      ")); } }
const assert = require("assert");

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
    await a.getByRole("tab", { name: "Create account" }).click();
    await a.locator("#aName").fill("Dyad"); await a.locator("#aPass").fill("secret1"); await a.locator("#aCode").fill("family");
    await a.getByRole("button", { name: "Create my account" }).click();
    await a.getByRole("heading", { name: "Trip to Qadian" }).waitFor({ timeout: 8000 });
    await a.getByText("✓ Saved").waitFor({ timeout: 8000 });

    // Device B logs into the same account and pulls the trip.
    await b.goto(base + "/", { waitUntil: "networkidle" });
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

  await browser.close();
  await new Promise((r) => server.close(r));
  console.log("\n" + passed + " passed, " + failed + " failed");
  try { require("fs").unlinkSync(env.DATA_FILE); } catch (e) {}
  process.exit(failed ? 1 : 0);
})();
