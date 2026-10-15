// Sharing codes (view-only links to one trip) and Group Travel Checklists (everyone packs together).
const { visible } = require("./shared");

module.exports = function groups(ctx) {
  const { store, S, send, fail, readJson, need, needAdmin, getUser, loadVisible, clientIp, WINDOW } = ctx;
  const MAX_ITEMS = 400, MAX_LISTS = 30, MAX_GROUPS = 20, MAX_MEMBERS = 50, FEED = 100;
  const sp = (x) => { try { return JSON.parse(x); } catch (e) { return null; } };
  const clip = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const STATES = ["todo", "packed", "skip"];

  /* ================= view-only sharing codes ================= */
  async function revokeShare(key, tripId) {
    const old = await store.get("sharetrip:" + key + ":" + tripId);
    if (old) { await store.del("share:" + old); await store.srem("shares:" + key, old); }
    await store.del("sharetrip:" + key + ":" + tripId);
  }
  async function shareRoute(req, res, path, method) {
    let m = path.match(/^\/api\/shared\/([A-Za-z0-9-]{4,20})$/);
    if (m && method === "GET") {                         // public: no login needed, view only
      const ipKey = "fail:share:" + clientIp(req);
      if ((await store.count(ipKey)) >= 30) fail(429, "Too many tries. Please wait a few minutes.");
      const rec = sp(await store.get("share:" + normCode(m[1])));
      const bad = async () => { await store.hit(ipKey, WINDOW); fail(404, "That sharing code isn't right, or the list isn't shared any more."); };
      if (!rec) return bad();
      const owner = await getUser(rec.u);
      const ld = owner ? await loadVisible(rec.u) : { vis: null };
      const trip = ld.vis && ld.vis.trips.find((t) => t.id === rec.t);
      if (!trip) return bad();
      return send(res, 200, { ownerName: owner.name, trip, updatedAt: ld.rec.updatedAt });
    }
    m = path.match(/^\/api\/share\/(\d+)$/);
    if (!m) return false;
    const u = await need(req), tripId = Number(m[1]);
    if (method === "GET") return send(res, 200, { code: (await store.get("sharetrip:" + u.key + ":" + tripId)) || null });
    if (method === "DELETE") { await revokeShare(u.key, tripId); return send(res, 200, { code: null }); }
    if (method === "POST") {
      const ld = await loadVisible(u.key);
      const raw = ld.rec && ld.rec.data && ld.rec.data.trips.find((t) => t.id === tripId);
      if (!raw) fail(404, "Save your trip first, then share it.");
      if (raw.hidden) fail(400, "This trip is private. Make it shared first.");
      await revokeShare(u.key, tripId);
      let code = null;
      for (let i = 0; i < 6 && !code; i++) { const c = S.randomCode(8); if (await store.setnx("share:" + c, JSON.stringify({ u: u.key, t: tripId }))) code = c; }
      if (!code) fail(500, "Couldn't make a code. Try again.");
      await store.set("sharetrip:" + u.key + ":" + tripId, code);
      await store.sadd("shares:" + u.key, code);
      return send(res, 200, { code });
    }
    return false;
  }

  /* ================= group travel checklists ================= */
  const gk = (id, part) => "group:" + id + (part ? ":" + part : "");
  async function seenAt(id, key) { return Number((await store.get("gseen:" + id + ":" + key)) || 0); }
  async function event(id, u, e) { await store.lpush("gact:" + id, [JSON.stringify(Object.assign({ t: Date.now(), u: u.key, n: u.name }, e))], FEED); }
  async function meta(id) { return sp(await store.get(gk(id))); }
  async function requireMember(id, u) {
    const g = await meta(id);
    if (!g) fail(404, "That group doesn't exist any more.");
    if (!(await store.smembers(gk(id, "members"))).includes(u.key)) fail(403, "You're not in that group.");
    return g;
  }
  async function readLists(id) { return Object.values(await store.hgetall(gk(id, "lists"))).map(sp).filter(Boolean).sort((a, b) => a.id - b.id); }
  async function readItems(id) { return Object.values(await store.hgetall(gk(id, "items"))).map(sp).filter(Boolean).sort((a, b) => a.id - b.id); }

  async function view(id, u) {
    const g = await meta(id);
    const [memberKeys, lists, items, feedRaw, seen] = await Promise.all([store.smembers(gk(id, "members")), readLists(id), readItems(id), store.lrange("gact:" + id, 40), seenAt(id, u.key)]);
    const members = (await Promise.all(memberKeys.map(async (k) => { const x = await getUser(k); return x ? { key: k, name: x.name } : null; }))).filter(Boolean);
    const feed = feedRaw.map(sp).filter(Boolean);
    return {
      group: { id, name: g.name, code: g.code, travelDate: g.travelDate || null, createdBy: g.createdBy },
      members, you: u.key,
      lists: lists.map((l) => ({ id: l.id, name: l.name, emoji: l.emoji, items: items.filter((i) => i.listId === l.id).map((i) => ({ id: i.id, emoji: i.emoji, name: i.name, state: i.state, by: i.by || null })) })),
      feed, unread: feed.filter((e) => e.u !== u.key && e.t > seen).length,
    };
  }
  async function summary(id, u) {
    const g = await meta(id);
    if (!g) return null;
    const [memberKeys, items, feedRaw, seen] = await Promise.all([store.smembers(gk(id, "members")), readItems(id), store.lrange("gact:" + id, 30), seenAt(id, u.key)]);
    const fresh = feedRaw.map(sp).filter((e) => e && e.u !== u.key && e.t > seen);
    return {
      id, name: g.name, code: g.code, members: memberKeys.length, travelDate: g.travelDate || null,
      packed: items.filter((i) => i.state === "packed").length, need: items.filter((i) => i.state !== "skip").length,
      unread: fresh.length, latest: fresh.slice(0, 3),
    };
  }
  async function newId(prefix, n) { return Number(await store.incr(gk(prefix, "seq"))) + (n || 0); }

  async function applyOp(id, u, b) {
    const op = String(b.op || "");
    if (op === "addItem") {
      const name = clip(b.name, 80); if (!name) fail(400, "Type what to add.");
      const lists = await readLists(id); const listId = Number(b.listId);
      if (!lists.some((l) => l.id === listId)) fail(404, "That checklist doesn't exist any more.");
      if ((await readItems(id)).length >= MAX_ITEMS) fail(400, "This group has too many items.");
      const item = { id: await newId(id), listId, name, emoji: clip(b.emoji, 16) || "🧳", state: "todo", by: null };
      await store.hset(gk(id, "items"), String(item.id), JSON.stringify(item));
      const l = lists.find((x) => x.id === listId);
      return event(id, u, { k: "add", item: name, emoji: item.emoji, list: l.name });
    }
    if (op === "setState") {
      const raw = await store.hget(gk(id, "items"), String(Number(b.itemId))); const it = sp(raw);
      if (!it) fail(404, "That item doesn't exist any more.");
      if (!STATES.includes(b.state)) fail(400, "Bad state.");
      if (it.state === b.state) return;
      it.state = b.state; it.by = b.state === "todo" ? null : u.name;
      await store.hset(gk(id, "items"), String(it.id), JSON.stringify(it));
      const l = (await readLists(id)).find((x) => x.id === it.listId);
      return event(id, u, { k: it.state === "packed" ? "pack" : it.state === "skip" ? "skip" : "unpack", item: it.name, emoji: it.emoji, list: l ? l.name : "" });
    }
    if (op === "removeItem") {
      const it = sp(await store.hget(gk(id, "items"), String(Number(b.itemId))));
      if (!it) return;
      await store.hdel(gk(id, "items"), String(it.id));
      const l = (await readLists(id)).find((x) => x.id === it.listId);
      return event(id, u, { k: "remove", item: it.name, emoji: it.emoji, list: l ? l.name : "" });
    }
    if (op === "addList") {
      const name = clip(b.name, 60); if (!name) fail(400, "Type a name for the checklist.");
      const lists = await readLists(id); if (lists.length >= MAX_LISTS) fail(400, "This group has too many checklists.");
      const l = { id: await newId(id), name, emoji: clip(b.emoji, 16) || "📋" };
      await store.hset(gk(id, "lists"), String(l.id), JSON.stringify(l));
      return event(id, u, { k: "list", list: name });
    }
    if (op === "removeList") {
      const lists = await readLists(id); const l = lists.find((x) => x.id === Number(b.listId));
      if (!l) return;
      if (lists.length <= 1) fail(400, "A group needs at least one checklist.");
      for (const it of (await readItems(id)).filter((i) => i.listId === l.id)) await store.hdel(gk(id, "items"), String(it.id));
      await store.hdel(gk(id, "lists"), String(l.id));
      return event(id, u, { k: "removelist", list: l.name });
    }
    if (op === "setDate") {
      const g = await meta(id); const d = b.date;
      if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(d))) fail(400, "Pick a valid date.");
      g.travelDate = d || null; await store.set(gk(id), JSON.stringify(g));
      return event(id, u, { k: "date", date: d || "" });
    }
    if (op === "rename") {
      const name = clip(b.name, 40); if (name.length < 2) fail(400, "The name needs at least 2 letters.");
      const g = await meta(id); g.name = name; await store.set(gk(id), JSON.stringify(g));
      return event(id, u, { k: "rename", name });
    }
    fail(400, "Unknown change.");
  }

  async function join(u, id, ev) {
    await store.sadd(gk(id, "members"), u.key); await store.sadd("ugroups:" + u.key, id);
    await store.set("gseen:" + id + ":" + u.key, String(Date.now() + 1));
    if (ev) await event(id, u, { k: "join" });
  }

  async function groupRoute(req, res, path, method) {
    if (path === "/api/admin/groups" && method === "GET") {
      await needAdmin(req);
      const ids = (await store.smembers("groups")).slice(0, 200);
      const rows = (await Promise.all(ids.map(async (id) => {
        const g = await meta(id); if (!g) return null;
        const [keys, items] = await Promise.all([store.smembers(gk(id, "members")), readItems(id)]);
        const names = (await Promise.all(keys.map(async (k) => { const x = await getUser(k); return x ? x.name : null; }))).filter(Boolean);
        return { id, name: g.name, code: g.code, members: names, packed: items.filter((i) => i.state === "packed").length, need: items.filter((i) => i.state !== "skip").length, travelDate: g.travelDate || null, createdAt: g.createdAt };
      }))).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
      return send(res, 200, { groups: rows });
    }
    if (path !== "/api/groups" && !path.startsWith("/api/groups/")) return false;
    const u = await need(req);

    if (path === "/api/groups" && method === "GET") {
      const ids = await store.smembers("ugroups:" + u.key);
      const rows = (await Promise.all(ids.map((id) => summary(id, u)))).filter(Boolean);
      return send(res, 200, { groups: rows, unread: rows.reduce((a, g) => a + g.unread, 0) });
    }
    if (path === "/api/groups" && method === "POST") {
      const b = await readJson(req); const name = clip(b.name, 40);
      if (name.length < 2) fail(400, "Give the group a name (2+ letters).");
      if ((await store.smembers("ugroups:" + u.key)).length >= MAX_GROUPS) fail(400, "You're in too many groups.");
      const id = S.randomCode(10).toLowerCase(); let code = null;
      for (let i = 0; i < 6 && !code; i++) { const c = S.randomCode(8); if (await store.setnx("groupcode:" + c, id)) code = c; }
      if (!code) fail(500, "Couldn't make a code. Try again.");
      await store.set(gk(id), JSON.stringify({ id, name, code, createdBy: u.key, createdAt: Date.now(), travelDate: null }));
      await store.sadd("groups", id);
      await join(u, id, false);
      const l = { id: await newId(id), name: "Shared items", emoji: "📋" };
      await store.hset(gk(id, "lists"), String(l.id), JSON.stringify(l));
      await event(id, u, { k: "created", name });
      return send(res, 201, await view(id, u));
    }
    if (path === "/api/groups/join" && method === "POST") {
      const b = await readJson(req); const code = normCode(b.code);
      if (code.length < 6) fail(400, "A group code has 8 letters and numbers.");
      if ((await store.hit("fail:gjoin:" + u.key, WINDOW)) > 20) fail(429, "Too many tries. Please wait a few minutes.");
      const id = await store.get("groupcode:" + code);
      if (!id || !(await meta(id))) fail(404, "No group has that code.");
      const members = await store.smembers(gk(id, "members"));
      if (!members.includes(u.key)) {
        if (members.length >= MAX_MEMBERS) fail(400, "That group is full.");
        if ((await store.smembers("ugroups:" + u.key)).length >= MAX_GROUPS) fail(400, "You're in too many groups.");
        await join(u, id, true);
      }
      return send(res, 200, await view(id, u));
    }
    const m = path.match(/^\/api\/groups\/([a-z0-9]{6,12})(?:\/(op|seen|leave))?$/);
    if (!m) fail(404, "Not found.");
    const id = m[1], act = m[2] || "";
    const g = await requireMember(id, u);
    if (!act && method === "GET") return send(res, 200, await view(id, u));
    if (act === "seen" && method === "POST") { await store.set("gseen:" + id + ":" + u.key, String(Date.now() + 1)); return send(res, 200, { ok: true }); }
    if (act === "leave" && method === "POST") {
      await event(id, u, { k: "leave" });
      await store.srem(gk(id, "members"), u.key); await store.srem("ugroups:" + u.key, id);
      return send(res, 200, { ok: true });
    }
    if (act === "op" && method === "POST") {
      await applyOp(id, u, await readJson(req));
      await store.set("gseen:" + id + ":" + u.key, String(Date.now() + 1));   // your own change is never "new" to you
      return send(res, 200, await view(id, u));
    }
    fail(404, "Not found.");
  }

  async function removeUser(key) {
    for (const id of await store.smembers("ugroups:" + key)) await store.srem(gk(id, "members"), key);
    await store.del("ugroups:" + key);
    for (const code of await store.smembers("shares:" + key)) {
      const rec = sp(await store.get("share:" + code));
      if (rec) await store.del("sharetrip:" + key + ":" + rec.t);
      await store.del("share:" + code);
    }
    await store.del("shares:" + key);
  }

  return { route: async (req, res, path, method) => (await shareRoute(req, res, path, method)) !== false ? true : (await groupRoute(req, res, path, method)) !== false, removeUser };
};
