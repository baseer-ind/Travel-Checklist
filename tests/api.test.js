// API tests against the real server with the file store. Run: npm test
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createServer } = require("../server");

const DATA = path.join(__dirname, "..", ".data", "test-db.json");
try { fs.unlinkSync(DATA); } catch (e) {}
const env = { ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "test-admin-pw", FAMILY_CODE: "family", DATA_FILE: DATA, SESSION_SECRET: "t" };

let base, server, passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + "\n      " + (e.stack || e).toString().split("\n").slice(0, 3).join("\n      ")); }
}
function client() {
  let cookie = "";
  return async function call(method, p, body, headers) {
    const r = await fetch(base + p, { method, headers: Object.assign({ "Content-Type": "application/json", Cookie: cookie, Origin: base }, headers || {}), body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, body: j };
  };
}
const sampleTrip = (name) => ({ next: 10, curTrip: 1, curList: 2, trips: [{ id: 1, name: name || "Trip to Tokyo", created: 1, packedAt: null, travelDate: "2026-12-25", lists: [{ id: 2, name: "Clothing", emoji: "🧥", items: [{ id: 3, emoji: "🧥", name: "Jacket", state: "todo" }, { id: 4, emoji: "🧣", name: "Secret scarf", state: "todo", hidden: true }] }] }] });

(async () => {
  server = createServer(env); await new Promise((r) => server.listen(0, r)); base = "http://127.0.0.1:" + server.address().port;
  console.log("API tests on " + base);

  await test("health", async () => { const r = await client()("GET", "/api/health"); assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true, storage: "file", adminConfigured: true, signupOpen: true }); });
  const amina = client(), bilal = client(), admin = client(), stranger = client(), solo = client();
  await test("signup with no code creates a solo account", async () => {
    const r = await solo("POST", "/api/signup", { username: "Solo", password: "secret9" });
    assert.equal(r.status, 201); assert.equal(r.body.user.username, "Solo");
    const fam = await solo("GET", "/api/family"); assert.equal(fam.status, 200); assert.equal(fam.body.circle, null);
  });
  await test("signup with a valid code joins that circle", async () => {
    const r = await amina("POST", "/api/signup", { username: "Amina", password: "secret1", code: "FAMILY" });
    assert.equal(r.status, 201); assert.equal(r.body.user.username, "Amina");
    const fam = await amina("GET", "/api/family"); assert.notEqual(fam.body.circle, null); assert.equal(fam.body.code, "family");
  });
  await test("signup with a wrong code is refused", async () => { assert.equal((await client()("POST", "/api/signup", { username: "Nocode", password: "secret9", code: "not-a-real-code" })).status, 400); });
  await test("duplicate name is rejected (case-insensitive)", async () => { assert.equal((await client()("POST", "/api/signup", { username: "amina", password: "secret1", code: "family" })).status, 409); });
  await test("bad names and short passwords rejected", async () => { assert.equal((await client()("POST", "/api/signup", { username: "a", password: "secret1", code: "family" })).status, 400); assert.equal((await client()("POST", "/api/signup", { username: "Okay", password: "123", code: "family" })).status, 400); });
  await test("me after signup", async () => { const r = await amina("GET", "/api/me"); assert.equal(r.body.user.username, "Amina"); });
  await test("login wrong password", async () => { assert.equal((await client()("POST", "/api/login", { username: "Amina", password: "nope00" })).status, 401); });
  await test("login right password", async () => { const r = await bilal("POST", "/api/signup", { username: "Bilal", password: "secret2", code: "family" }); assert.equal(r.status, 201); const l = await client()("POST", "/api/login", { username: "bilal", password: "secret2" }); assert.equal(l.status, 200); });
  await test("admin login from env password", async () => { const r = await admin("POST", "/api/login", { username: "admin", password: "test-admin-pw" }); assert.equal(r.status, 200); assert.equal(r.body.user.role, "admin"); });
  await test("forged / tampered cookie is rejected", async () => { const r = await (async () => { const c = client(); return c("GET", "/api/data", undefined, { Cookie: "tc_session=eyJ1IjoiYWRtaW4iLCJwdiI6MSwiZXhwIjo5OTk5OTk5OTk5OTk5fQ.bad" }); })(); assert.equal(r.status, 401); });
  await test("unauthenticated data is 401", async () => { assert.equal((await stranger("GET", "/api/data")).status, 401); });
  await test("cross-origin POST blocked", async () => { assert.equal((await amina("POST", "/api/logout", {}, { Origin: "https://evil.example" })).status, 403); });
  await test("save and reload data", async () => { const s = await amina("PUT", "/api/data", { data: sampleTrip() }); assert.equal(s.status, 200); assert.equal(s.body.rev, 1); const g = await amina("GET", "/api/data"); assert.equal(g.body.rev, 1); assert.equal(g.body.data.trips[0].lists[0].items.length, 2); assert.equal((await amina("GET", "/api/data?rev=1")).body.unchanged, true); });
  await test("junk data rejected", async () => { assert.equal((await amina("PUT", "/api/data", { data: { trips: "x" } })).status, 400); assert.equal((await amina("PUT", "/api/data", "{bad json")).status, 400); });
  await test("oversized data rejected", async () => { const d = sampleTrip(); d.trips[0].lists[0].items = Array.from({ length: 500 }, (_, i) => ({ id: 100 + i, emoji: "x", name: "y".repeat(80), state: "todo" })); d.trips = Array.from({ length: 30 }, (_, i) => Object.assign({}, d.trips[0], { id: i + 1 })); const r = await amina("PUT", "/api/data", { data: d }); assert.equal(r.status, 413); });
  await test("users are isolated", async () => { const r = await bilal("GET", "/api/data"); assert.equal(r.body.data, null); });
  await test("family view shows members, hides private items", async () => { const r = await bilal("GET", "/api/family"); assert.equal(r.status, 200); const names = r.body.members.map((m) => m.username).sort(); assert.deepEqual(names, ["Amina", "Bilal", "admin"]); const am = r.body.members.find((m) => m.username === "Amina"); assert.equal(am.items, 1); const txt = JSON.stringify(r.body); assert.ok(!txt.includes("Secret scarf")); });
  await test("member detail hides private items", async () => { const r = await bilal("GET", "/api/family/amina"); assert.equal(r.status, 200); assert.ok(!JSON.stringify(r.body).includes("Secret scarf")); assert.ok(JSON.stringify(r.body).includes("Jacket")); });
  await test("activity feed reports packing, never private items", async () => { const d = sampleTrip(); d.trips[0].lists[0].items[0].state = "packed"; d.trips[0].lists[0].items[1].state = "packed"; await amina("PUT", "/api/data", { data: d }); const r = await bilal("GET", "/api/family"); const txt = JSON.stringify(r.body.feed); assert.ok(txt.includes("Jacket")); assert.ok(!txt.includes("Secret scarf")); assert.ok(r.body.unread >= 1); await bilal("POST", "/api/family/seen", {}); assert.equal((await bilal("GET", "/api/family/unread")).body.unread, 0); });
  await test("someone outside the family can't see a member", async () => { const c = client(); await c("POST", "/api/signup", { username: "Outsider", password: "secret3", code: "family" }); await c("POST", "/api/family/join", { code: "otherfam" }); assert.equal((await c("GET", "/api/family/amina")).status, 403); });
  await test("admin users list has counts, no private names", async () => { const r = await admin("GET", "/api/admin/users"); assert.equal(r.status, 200); const am = r.body.users.find((u) => u.username === "Amina"); assert.equal(am.privateItems, 1); assert.ok(!JSON.stringify(r.body).includes("Secret scarf")); });
  await test("admin overview and feed", async () => { const o = await admin("GET", "/api/admin/overview"); assert.ok(o.body.trips.some((t) => t.username === "Amina" && t.trip === "Trip to Tokyo")); const f = await admin("GET", "/api/admin/feed"); assert.ok(!JSON.stringify(f.body).includes("Secret scarf")); const d = await admin("GET", "/api/admin/users/amina/data"); assert.equal(d.body.privateItems, 1); assert.ok(!JSON.stringify(d.body).includes("Secret scarf")); });
  await test("non-admin cannot use admin routes", async () => { assert.equal((await amina("GET", "/api/admin/users")).status, 403); assert.equal((await amina("DELETE", "/api/admin/users/bilal")).status, 403); });
  let temp;
  await test("admin adds a member with a temporary password", async () => { const r = await admin("POST", "/api/admin/users", { username: "Dara" }); assert.equal(r.status, 201); temp = r.body.password; assert.ok(temp.length >= 6); assert.equal(r.body.user.mustChange, true); });
  await test("new member must change password, then is normal", async () => { const d = client(); const l = await d("POST", "/api/login", { username: "Dara", password: temp }); assert.equal(l.body.user.mustChange, true); assert.equal((await d("POST", "/api/password", { current: "wrong1", newPassword: "mine123" })).status, 403); const ok = await d("POST", "/api/password", { current: temp, newPassword: "mine123" }); assert.equal(ok.status, 200); assert.equal(ok.body.user.mustChange, false); assert.equal((await client()("POST", "/api/login", { username: "Dara", password: temp })).status, 401); });
  await test("changing password signs out other devices", async () => { const a2 = client(); await a2("POST", "/api/login", { username: "Amina", password: "secret1" }); await amina("POST", "/api/password", { current: "secret1", newPassword: "secret9" }); assert.equal((await a2("GET", "/api/data")).status, 401); assert.equal((await amina("GET", "/api/data")).status, 200); });
  await test("lock-out after 8 wrong tries, admin reset unlocks", async () => { for (let i = 0; i < 8; i++) await client()("POST", "/api/login", { username: "Bilal", password: "wrong0" + i }); assert.equal((await client()("POST", "/api/login", { username: "Bilal", password: "secret2" })).status, 429); const r = await admin("POST", "/api/admin/users/bilal/reset", { password: "fresh12" }); assert.equal(r.status, 200); assert.equal((await client()("POST", "/api/login", { username: "Bilal", password: "fresh12" })).status, 200); });
  await test("admin cannot delete self; can delete a member", async () => { assert.equal((await admin("DELETE", "/api/admin/users/admin")).status, 400); assert.equal((await admin("DELETE", "/api/admin/users/dara")).status, 200); assert.equal((await client()("POST", "/api/login", { username: "Dara", password: "mine123" })).status, 401); });
  await test("sharing code: view only, private items hidden", async () => { const r = await amina("POST", "/api/share/1"); assert.equal(r.status, 200); const code = r.body.code; const v = await stranger("GET", "/api/shared/" + code); assert.equal(v.status, 200); assert.equal(v.body.ownerName, "Amina"); assert.ok(!JSON.stringify(v.body).includes("Secret scarf")); await amina("DELETE", "/api/share/1"); assert.equal((await stranger("GET", "/api/shared/" + code)).status, 404); });
  await test("admin reset signed Bilal out everywhere", async () => { assert.equal((await bilal("GET", "/api/data")).status, 401); assert.equal((await bilal("POST", "/api/login", { username: "Bilal", password: "fresh12" })).status, 200); await bilal("POST", "/api/password", { current: "fresh12", newPassword: "secret2" }); });
  await test("group checklist: create, join, pack together", async () => { const g = await amina("POST", "/api/groups", { name: "Packing crew" }); assert.equal(g.status, 201); const id = g.body.group.id, code = g.body.group.code; const j = await bilal("POST", "/api/groups/join", { code }); assert.equal(j.status, 200); assert.equal(j.body.members.length, 2); const op = await bilal("POST", "/api/groups/" + id + "/op", { op: "addItem", listId: g.body.lists[0].id, name: "Tent" }); assert.equal(op.status, 200); const item = op.body.lists[0].items[0]; const p = await amina("POST", "/api/groups/" + id + "/op", { op: "setState", itemId: item.id, state: "packed" }); assert.equal(p.body.lists[0].items[0].by, "Amina"); assert.equal((await stranger("GET", "/api/groups/" + id)).status, 401); const a = await admin("GET", "/api/admin/groups"); assert.equal(a.body.groups[0].members.length, 2); });
  await test("family/create returns a code, joins the creator, and familyView shows it", async () => {
    const c = client();
    assert.equal((await c("POST", "/api/signup", { username: "Fam1", password: "secret9" })).status, 201);
    const r = await c("POST", "/api/family/create", {});
    assert.equal(r.status, 200);
    assert.ok(typeof r.body.code === "string" && r.body.code.length === 6, "a 6-char code: " + r.body.code);
    assert.notEqual(r.body.circle, null);
    const fam = await c("GET", "/api/family");
    assert.equal(fam.body.code, r.body.code, "familyView shows the same code");
    assert.ok(fam.body.members.some((m) => m.username === "Fam1" && m.you), "the creator is a member");
  });
  await test("two family creates return two different codes", async () => {
    const c1 = client(), c2 = client();
    await c1("POST", "/api/signup", { username: "FamA", password: "secret9" });
    await c2("POST", "/api/signup", { username: "FamB", password: "secret9" });
    const a = (await c1("POST", "/api/family/create", {})).body.code;
    const b = (await c2("POST", "/api/family/create", {})).body.code;
    assert.ok(a && b && a !== b, "distinct codes: " + a + " / " + b);
  });
  await test("a second user joins a generated family code and sees the creator", async () => {
    const c1 = client(), c2 = client();
    await c1("POST", "/api/signup", { username: "Hostie", password: "secret9" });
    const code = (await c1("POST", "/api/family/create", {})).body.code;
    assert.equal((await c2("POST", "/api/signup", { username: "Guestie", password: "secret9" })).status, 201);
    const j = await c2("POST", "/api/family/join", { code });
    assert.equal(j.status, 200);
    assert.deepEqual(j.body.members.map((m) => m.username).sort(), ["Guestie", "Hostie"]);
  });
  await test("per-trip: create, index, get, revision conflict, delete", async () => {
    const trip = { id: "pt1", name: "Weekend", created: 1, lists: [{ id: "l1", name: "Bag", emoji: "🎒", items: [{ id: "i1", name: "Socks", state: "todo", qty: 3, note: "wool" }] }] };
    let r = await amina("PUT", "/api/trips/pt1", { baseRev: 0, trip }); assert.equal(r.status, 200); assert.equal(r.body.rev, 1);
    r = await amina("GET", "/api/trips"); const row = r.body.trips.find((t) => t.id === "pt1"); assert.ok(row && row.rev === 1, "index lists the trip with its rev");
    r = await amina("GET", "/api/trips/pt1"); assert.equal(r.body.trip.id, "pt1"); assert.equal(r.body.trip.lists[0].items[0].qty, 3); assert.equal(r.body.trip.lists[0].items[0].note, "wool");
    r = await amina("PUT", "/api/trips/pt1", { baseRev: 0, trip: Object.assign({}, trip, { name: "Changed" }) }); assert.equal(r.status, 409); assert.equal(r.body.rev, 1); assert.equal(r.body.trip.name, "Weekend");
    r = await amina("PUT", "/api/trips/pt1", { baseRev: 1, trip: Object.assign({}, trip, { name: "Changed" }) }); assert.equal(r.status, 200); assert.equal(r.body.rev, 2);
    assert.equal((await amina("DELETE", "/api/trips/pt1", { baseRev: 1 })).status, 409);
    assert.equal((await amina("DELETE", "/api/trips/pt1", { baseRev: 2 })).status, 200);
    assert.equal((await amina("GET", "/api/trips/pt1")).status, 404);
  });
  await test("per-trip: private items never leak to family, admin or strangers", async () => {
    const trip = { id: "pt2", name: "Secret trip", created: 1, lists: [{ id: "l2", name: "Bag", emoji: "🎒", items: [{ id: "i2", name: "Shared socks", state: "todo" }, { id: "i3", name: "Hidden diary", state: "todo", hidden: true }] }] };
    assert.equal((await amina("PUT", "/api/trips/pt2", { baseRev: 0, trip })).status, 200);
    assert.ok(JSON.stringify((await amina("GET", "/api/trips/pt2")).body).includes("Hidden diary"), "owner sees their own private item");
    const fv = await bilal("GET", "/api/family/amina"); assert.ok(JSON.stringify(fv.body).includes("Shared socks")); assert.ok(!JSON.stringify(fv.body).includes("Hidden diary"), "family never sees a private item");
    assert.ok(!JSON.stringify((await admin("GET", "/api/admin/users/amina/data")).body).includes("Hidden diary"), "admin never sees a private item");
    assert.equal((await stranger("GET", "/api/trips/pt2")).status, 401);
    await amina("DELETE", "/api/trips/pt2", {});
  });
  await test("logout clears session", async () => { await bilal("POST", "/api/logout", {}); assert.equal((await bilal("GET", "/api/data")).status, 401); });
  await test("static files and PWA assets are served", async () => { for (const p of ["/", "/style.css", "/app.js", "/sw.js", "/manifest.webmanifest", "/icons/icon-192.png"]) { const r = await fetch(base + p); assert.equal(r.status, 200, p); } assert.equal((await fetch(base + "/../package.json")).status, 404); });
  await test("self-service delete removes the account + data; admin can't self-delete", async () => {
    const c = client();
    assert.equal((await c("POST", "/api/signup", { username: "Deleteme", password: "secret5", code: "family" })).status, 201);
    const delData = sampleTrip("Delete trip"); delData.contacts = [{ id: "dc1", name: "ICE", phone: "+15559999", relation: "Partner" }];
    assert.equal((await c("PUT", "/api/data", { data: delData })).status, 200);
    assert.ok(JSON.stringify((await c("GET", "/api/data")).body).includes("+15559999"), "emergency contact saved before delete");
    assert.equal((await c("DELETE", "/api/account")).status, 200);
    // account + data (trips AND emergency contacts) are gone: the cleared session can't read data
    assert.equal((await c("GET", "/api/data")).status, 401);
    assert.equal((await client()("POST", "/api/login", { username: "deleteme", password: "secret5" })).status, 401);
    // the config-based admin account can't be self-deleted here
    assert.equal((await admin("DELETE", "/api/account")).status, 400);
  });

  await test("emergency contacts are private: never visible to a family member or admin", async () => {
    const owner = client(), mate = client();
    assert.equal((await owner("POST", "/api/signup", { username: "Carer", password: "secret9", code: "family" })).status, 201);
    assert.equal((await mate("POST", "/api/signup", { username: "Matey", password: "secret9", code: "family" })).status, 201);
    const data = sampleTrip("Carer trip");
    data.contacts = [{ id: "ec1", name: "Mum", phone: "+15550100", relation: "Mother" }];
    assert.equal((await owner("PUT", "/api/data", { data })).status, 200);
    // the owner keeps their contacts (round-trips through sanitize)
    const own = await owner("GET", "/api/data");
    assert.ok(own.body.data.contacts && own.body.data.contacts[0].phone === "+15550100", "owner keeps their contacts");
    // a family member's view of the owner never includes them
    const fam = await mate("GET", "/api/family/carer");
    assert.equal(fam.status, 200);
    assert.ok(!JSON.stringify(fam.body).includes("+15550100") && !JSON.stringify(fam.body).includes("Mum"), "family cannot see emergency contacts");
    // and the family listing / feed don't either
    assert.ok(!JSON.stringify((await mate("GET", "/api/family")).body).includes("+15550100"), "family feed/list has no contacts");
    // nor does the admin's view
    assert.ok(!JSON.stringify((await admin("GET", "/api/admin/users/carer/data")).body).includes("+15550100"), "admin cannot see emergency contacts");
  });

  await test("data survives a server restart", async () => { await new Promise((r) => server.close(r)); await new Promise((r) => setTimeout(r, 150)); server = createServer(env); await new Promise((r) => server.listen(0, r)); base = "http://127.0.0.1:" + server.address().port; const c = client(); assert.equal((await c("POST", "/api/login", { username: "Amina", password: "secret9" })).status, 200); const d = await c("GET", "/api/data"); assert.equal(d.body.data.trips[0].name, "Trip to Tokyo"); });

  server.close();
  console.log("\n" + passed + " passed, " + failed + " failed");
  try { fs.unlinkSync(DATA); } catch (e) {}
  process.exit(failed ? 1 : 0);
})();
