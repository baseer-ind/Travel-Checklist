const { createStore } = require("./store");
const S = require("./security");

const DAY = 86400000;
const SESSION_DAYS = 30;
const COOKIE = "tc_session";
const MAX_DATA_BYTES = 900000;
const USER_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.\-]{1,23}$/u;

function normName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!USER_RE.test(name)) return null;
  return { key: name.toLowerCase(), name };
}
const { sanitizeData, sanitizeTrip, visible, summarize, diffEvents, existingIds } = require("./shared");

function createApp(env = process.env, injectedStore) {
  const store = injectedStore || createStore(env);
  const ADMIN_KEY = (normName(env.ADMIN_USERNAME || "admin") || { key: "admin" }).key;
  const ADMIN_NAME = (normName(env.ADMIN_USERNAME || "admin") || { name: "admin" }).name;
  const FAMILY_CODE = (env.FAMILY_CODE || "").trim();
  const SECRET = env.SESSION_SECRET || S.crypto.createHmac("sha256", store.secretSeed || "none").update("session-v1").digest("hex");
  const MAX_FAILS = Number(env.LOGIN_MAX_FAILS || 8);
  const IP_MAX_FAILS = Number(env.RATE_LIMIT_IP_MAX || 60);
  const WINDOW = Number(env.LOGIN_WINDOW_SECONDS || 900);
  let adminReady = null;

  /* ---------- helpers ---------- */
  function send(res, status, obj, headers) {
    const body = JSON.stringify(obj);
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (status === 413) res.setHeader("Connection", "close");
    if (headers) for (const k in headers) res.setHeader(k, headers[k]);
    res.end(body);
  }
  class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
  const fail = (s, m, e) => { throw new HttpError(s, m, e); };

  async function readJson(req) {
    let v;
    if (req.body !== undefined && req.body !== null) {
      if (Buffer.isBuffer(req.body)) v = JSON.parse(req.body.toString("utf8") || "{}");
      else if (typeof req.body === "string") v = JSON.parse(req.body || "{}");
      else v = req.body;
    } else {
      const chunks = []; let size = 0, tooBig = false;
      for await (const c of req) {
        size += c.length;
        if (size > 25000000) { req.destroy(); break; }       // never swallow unlimited data
        if (size > 1100000) tooBig = true; else chunks.push(c);
      }
      if (tooBig) fail(413, "Too much data.");
      const txt = Buffer.concat(chunks).toString("utf8");
      v = txt ? JSON.parse(txt) : {};
    }
    if (!v || typeof v !== "object" || Array.isArray(v)) fail(400, "Bad request.");
    return v;
  }
  function cookies(req) {
    const out = {};
    String(req.headers.cookie || "").split(";").forEach((p) => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
    return out;
  }
  const isHttps = (req) => (req.headers["x-forwarded-proto"] || "").split(",")[0] === "https" || !!(req.socket && req.socket.encrypted);
  function sessionCookie(req, token, maxAge) {
    return COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + maxAge + (isHttps(req) ? "; Secure" : "");
  }
  function clientIp(req) {
    return String(req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "?").split(",")[0].trim();
  }
  function sameOrigin(req) {
    const o = req.headers.origin;
    if (!o) return true;
    try { return new URL(o).host === (req.headers["x-forwarded-host"] || req.headers.host); } catch (e) { return false; }
  }
  const pub = (u) => ({ username: u.name, key: u.key, role: u.role, mustChange: !!u.mustChange });
  const getUser = async (key) => { const v = await store.get("user:" + key); return v ? JSON.parse(v) : null; };

  async function ensureAdmin() {
    if (adminReady) return adminReady;
    adminReady = (async () => {
      const pw = env.ADMIN_PASSWORD;
      if (!pw) return;
      const fp = S.crypto.createHash("sha256").update(pw).digest("hex");
      const cur = await getUser(ADMIN_KEY);
      if (!cur) {
        const u = { key: ADMIN_KEY, name: ADMIN_NAME, hash: await S.hashPassword(pw), role: "admin", pwv: 1, mustChange: false, createdAt: Date.now(), bootFp: fp, circle: FAMILY_CODE ? circleOf(FAMILY_CODE) : null };
        if (await store.setnx("user:" + ADMIN_KEY, JSON.stringify(u))) { await store.sadd("users", ADMIN_KEY); if (FAMILY_CODE) await addToCircle(ADMIN_KEY, FAMILY_CODE); }
      } else if (!cur.circle && FAMILY_CODE) {
        cur.circle = circleOf(FAMILY_CODE); await store.set("user:" + ADMIN_KEY, JSON.stringify(cur)); await addToCircle(ADMIN_KEY, FAMILY_CODE);
      }
      if (cur && cur.bootFp !== fp) {
        // ADMIN_PASSWORD was changed in the environment: this is the recovery path if the admin forgets theirs
        cur.hash = await S.hashPassword(pw); cur.pwv = (cur.pwv || 1) + 1; cur.bootFp = fp; cur.role = "admin"; cur.mustChange = false;
        await store.set("user:" + ADMIN_KEY, JSON.stringify(cur));
      }
    })().catch((e) => { adminReady = null; throw e; });
    return adminReady;
  }

  async function auth(req) {
    const tok = cookies(req)[COOKIE];
    const p = S.verify(tok, SECRET);
    if (!p) return null;
    const u = await getUser(p.u);
    if (!u || u.pwv !== p.pv) return null;
    return u;
  }
  const issue = (req, res, u) => ({ "Set-Cookie": sessionCookie(req, S.sign({ u: u.key, pv: u.pwv, exp: Date.now() + SESSION_DAYS * DAY }, SECRET), SESSION_DAYS * 86400) });
  const need = async (req) => { const u = await auth(req); if (!u) fail(401, "Please log in."); return u; };
  const needAdmin = async (req) => { const u = await need(req); if (u.role !== "admin") fail(403, "Admin only."); return u; };

  function checkPassword(pw) {
    if (typeof pw !== "string" || pw.length < 6) fail(400, "Password must be at least 6 characters.");
    if (pw.length > 128) fail(400, "Password is too long.");
  }

  async function tooManyFails(req, key) {
    const [a, b] = await Promise.all([store.count("fail:u:" + key), store.count("fail:ip:" + clientIp(req))]);
    return a >= MAX_FAILS || b >= IP_MAX_FAILS;
  }
  async function noteFail(req, key) {
    await Promise.all([key ? store.hit("fail:u:" + key, WINDOW) : null, store.hit("fail:ip:" + clientIp(req), WINDOW)]);
  }

  async function createUser(name, key, password, role, mustChange, circleCode) {
    const u = { key, name, hash: await S.hashPassword(password), role: role || "user", pwv: 1, mustChange: !!mustChange, createdAt: Date.now(), circle: circleCode ? circleOf(circleCode) : null };
    if (!(await store.setnx("user:" + key, JSON.stringify(u)))) return null;
    await store.sadd("users", key);
    if (circleCode) await addToCircle(key, circleCode);
    return u;
  }

  const circleOf = (code) => S.crypto.createHash("sha256").update("circle:" + String(code).trim().toLowerCase()).digest("hex").slice(0, 24);
  async function addToCircle(key, code) {
    const id = circleOf(code);
    await store.sadd("circle:" + id, key);
    await store.setnx("circlename:" + id, String(code).trim());
    return id;
  }
  const safeParse = (x) => { try { return JSON.parse(x); } catch (e) { return null; } };
  async function loadVisible(key) {
    const raw = await store.get("data:" + key);
    const rec = raw ? JSON.parse(raw) : null;
    return { rec, vis: rec ? visible(rec.data) : null };
  }
  async function memberSummary(k) {
    const [u, ld, seen] = await Promise.all([getUser(k), loadVisible(k), store.get("seen:" + k)]);
    if (!u) return null;
    return Object.assign({ username: u.name, key: k, role: u.role, lastSaved: ld.rec ? ld.rec.updatedAt : null, lastLogin: seen ? Number(seen) : null }, summarize(ld.vis));
  }
  async function familyView(u) {
    if (!u.circle) return { circle: null, unread: 0 };
    const keys = (await store.smembers("circle:" + u.circle)).slice(0, 100);
    const members = (await Promise.all(keys.map(memberSummary))).filter(Boolean).sort((a, b) => a.username.localeCompare(b.username));
    const feed = (await store.lrange("act:c:" + u.circle, 60)).map(safeParse).filter(Boolean);
    const seen = Number((await store.get("feedseen:" + u.key)) || 0);
    return { circle: { members: members.length }, members: members.map((m) => Object.assign({ you: m.key === u.key }, m)), feed, unread: feed.filter((e) => e.u !== u.key && e.t > seen).length };
  }

  // Activity feed: only what is public (private items never show up). Shared by /api/data and /api/trips.
  async function logActivity(u, prevData, newData) {
    try {
      const events = diffEvents(prevData ? visible(prevData) : null, visible(newData), existingIds(newData)).map((e) => JSON.stringify(Object.assign({ t: Date.now(), u: u.key, n: u.name }, e)));
      if (events.length) {
        await store.lpush("act:all", events, 500);
        if (u.circle) await store.lpush("act:c:" + u.circle, events, 300);
      }
    } catch (e) { console.error("activity log failed", e.message); }
  }

  const groupsApi = require("./groups")({ store, S, send, fail, readJson, need, needAdmin, getUser, loadVisible, clientIp, WINDOW });
  const tripsApi = require("./trips")({ store, send, fail, readJson, need, sanitizeTrip, logActivity });

  /* ---------- routes ---------- */
  async function route(req, res, path, method) {
    if (path === "/api/health" && method === "GET") return send(res, 200, { ok: true, storage: store.name, adminConfigured: !!env.ADMIN_PASSWORD, signupOpen: !!FAMILY_CODE });
    if (path === "/api/config" && method === "GET") return send(res, 200, { signupEnabled: !!FAMILY_CODE });

    if (method !== "GET" && !sameOrigin(req)) fail(403, "Blocked: wrong origin.");
    await ensureAdmin();
    if (await groupsApi.route(req, res, path, method)) return;
    if (await tripsApi.route(req, res, path, method)) return;

    if (path === "/api/signup" && method === "POST") {
      const b = await readJson(req);
      if (!FAMILY_CODE) fail(403, "Sign-ups are closed. Ask the admin to create your account.");
      const n = normName(b.username);
      if (!n) fail(400, "Name must be 2–24 letters or numbers (spaces, . - _ are okay).");
      checkPassword(b.password);
      if (await tooManyFails(req, null)) fail(429, "Too many attempts. Try again in a few minutes.");
      if (!S.safeEqual(String(b.code || "").trim().toLowerCase(), FAMILY_CODE.toLowerCase())) { await noteFail(req, null); fail(403, "That family code is not right."); }
      const u = await createUser(n.name, n.key, b.password, "user", false, FAMILY_CODE);
      if (!u) fail(409, "That name is already taken. Try another or log in.");
      return send(res, 201, { user: pub(u) }, issue(req, res, u));
    }

    if (path === "/api/login" && method === "POST") {
      const b = await readJson(req);
      const n = normName(b.username);
      const pw = typeof b.password === "string" ? b.password.slice(0, 128) : "";
      const key = n ? n.key : "invalid";
      const tries = await store.hit("fail:u:" + key, WINDOW);
      if (tries > MAX_FAILS || (await store.count("fail:ip:" + clientIp(req))) >= IP_MAX_FAILS) fail(429, "Too many wrong tries. Please wait 15 minutes, or ask the admin to reset your password.");
      const u = n ? await getUser(n.key) : null;
      const ok = u ? await S.verifyPassword(pw, u.hash) : (await S.fakeVerify(pw), false);
      if (!ok) { await store.hit("fail:ip:" + clientIp(req), WINDOW); fail(401, "Wrong name or password."); }
      await store.del("fail:u:" + key);
      await store.set("seen:" + u.key, String(Date.now()));
      return send(res, 200, { user: pub(u) }, issue(req, res, u));
    }

    if (path === "/api/logout" && method === "POST") {
      return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
    }

    if (path === "/api/me" && method === "GET") {
      const u = await auth(req);
      return send(res, 200, { user: u ? pub(u) : null, signupEnabled: !!FAMILY_CODE });
    }

    if (path === "/api/password" && method === "POST") {
      const u = await need(req);
      const b = await readJson(req);
      checkPassword(b.newPassword);
      const tries = await store.hit("fail:u:" + u.key, WINDOW);
      if (tries > MAX_FAILS) fail(429, "Too many attempts. Try again later.");
      if (!(await S.verifyPassword(String(b.current || "").slice(0, 128), u.hash))) fail(403, "Your current password is not right.");
      await store.del("fail:u:" + u.key);
      const fresh = await getUser(u.key);
      fresh.hash = await S.hashPassword(b.newPassword); fresh.pwv = (fresh.pwv || 1) + 1; fresh.mustChange = false;
      await store.set("user:" + u.key, JSON.stringify(fresh));
      return send(res, 200, { ok: true, user: pub(fresh) }, issue(req, res, fresh));
    }

    if (path === "/api/data" && method === "GET") {
      const u = await need(req);
      const raw = await store.get("data:" + u.key);
      const rec = raw ? JSON.parse(raw) : { rev: 0, data: null };
      const since = Number(new URL(req.url, "http://x").searchParams.get("rev"));
      if (Number.isFinite(since) && since === rec.rev && raw) return send(res, 200, { unchanged: true, rev: rec.rev });
      return send(res, 200, { rev: rec.rev, data: rec.data });
    }
    if (path === "/api/data" && method === "PUT") {
      const u = await need(req);
      const b = await readJson(req);
      const clean = sanitizeData(b.data);
      if (!clean) fail(400, "That data doesn't look right.");
      if (JSON.stringify(clean).length > MAX_DATA_BYTES) fail(413, "Too much data.");
      const raw = await store.get("data:" + u.key);
      const prevRec = raw ? JSON.parse(raw) : null;
      const prev = prevRec ? prevRec.rev : 0;
      const rec = { rev: prev + 1, updatedAt: Date.now(), data: clean };
      await store.set("data:" + u.key, JSON.stringify(rec));
      await logActivity(u, prevRec ? prevRec.data : null, clean);
      return send(res, 200, { ok: true, rev: rec.rev });
    }

    /* ----- family circle ----- */
    if (path === "/api/family" && method === "GET") { const u = await need(req); return send(res, 200, await familyView(u)); }
    if (path === "/api/family/unread" && method === "GET") {
      const u = await need(req);
      if (!u.circle) return send(res, 200, { unread: 0 });
      const feed = (await store.lrange("act:c:" + u.circle, 60)).map(safeParse).filter(Boolean);
      const seen = Number((await store.get("feedseen:" + u.key)) || 0);
      return send(res, 200, { unread: feed.filter((e) => e.u !== u.key && e.t > seen).length });
    }
    if (path === "/api/family/seen" && method === "POST") { const u = await need(req); await store.set("feedseen:" + u.key, String(Date.now())); return send(res, 200, { ok: true }); }
    if (path === "/api/family/join" && method === "POST") {
      const u = await need(req);
      const b = await readJson(req);
      const code = typeof b.code === "string" ? b.code.trim() : "";
      if (code.length < 4 || code.length > 40) fail(400, "The family code must be 4–40 characters.");
      if ((await store.hit("fail:join:" + u.key, WINDOW)) > 20) fail(429, "Too many tries. Please wait a few minutes.");
      const fresh = await getUser(u.key);
      const id = circleOf(code);
      if (fresh.circle && fresh.circle !== id) await store.srem("circle:" + fresh.circle, u.key);
      fresh.circle = id;
      await store.set("user:" + u.key, JSON.stringify(fresh));
      await addToCircle(u.key, code);
      await store.set("feedseen:" + u.key, String(Date.now()));
      return send(res, 200, await familyView(fresh));
    }
    if (path === "/api/family/leave" && method === "POST") {
      const u = await need(req);
      const fresh = await getUser(u.key);
      if (fresh.circle) await store.srem("circle:" + fresh.circle, u.key);
      fresh.circle = null;
      await store.set("user:" + u.key, JSON.stringify(fresh));
      return send(res, 200, { circle: null, unread: 0 });
    }
    const fm = path.match(/^\/api\/family\/([^/]+)$/);
    if (fm && method === "GET") {
      const u = await need(req);
      const key = decodeURIComponent(fm[1]).toLowerCase();
      const target = await getUser(key);
      if (!target) fail(404, "No such person.");
      if (key !== u.key && (!u.circle || target.circle !== u.circle)) fail(403, "That person isn't in your family.");
      const ld = await loadVisible(key);
      return send(res, 200, { username: target.name, data: ld.vis ? { trips: ld.vis.trips } : null, updatedAt: ld.rec ? ld.rec.updatedAt : null, you: key === u.key });
    }

    /* ----- admin ----- */
    if (path === "/api/admin/users" && method === "GET") {
      await needAdmin(req);
      const keys = (await store.smembers("users")).slice(0, 300);
      const rows = await Promise.all(keys.map(async (k) => {
        const [u, ld, seen] = await Promise.all([getUser(k), loadVisible(k), store.get("seen:" + k)]);
        if (!u) return null;
        const sm = summarize(ld.vis);
        const circleName = u.circle ? await store.get("circlename:" + u.circle) : null;
        return { username: u.name, key: u.key, role: u.role, createdAt: u.createdAt, lastLogin: seen ? Number(seen) : null, lastSaved: ld.rec ? ld.rec.updatedAt : null, trips: sm.tripCount, items: sm.items, privateItems: ld.vis ? ld.vis.privateItems : 0, circle: circleName, mustChange: !!u.mustChange };
      }));
      return send(res, 200, { users: rows.filter(Boolean).sort((x, y) => x.createdAt - y.createdAt) });
    }
    if (path === "/api/admin/feed" && method === "GET") {
      await needAdmin(req);
      return send(res, 200, { events: (await store.lrange("act:all", 150)).map(safeParse).filter(Boolean) });
    }
    if (path === "/api/admin/overview" && method === "GET") {
      await needAdmin(req);
      const keys = (await store.smembers("users")).slice(0, 300);
      const rows = [];
      await Promise.all(keys.map(async (k) => {
        const [u, ld] = await Promise.all([getUser(k), loadVisible(k)]);
        if (!u || !ld.vis) return;
        summarize(ld.vis).trips.forEach((t) => rows.push({ username: u.name, key: k, trip: t.name, travelDate: t.travelDate, packedAt: t.packedAt, packed: t.packed, need: t.need }));
      }));
      rows.sort((x, y) => (x.travelDate || "9999").localeCompare(y.travelDate || "9999") || x.username.localeCompare(y.username));
      return send(res, 200, { trips: rows });
    }
    if (path === "/api/admin/users" && method === "POST") {
      await needAdmin(req);
      const b = await readJson(req);
      const n = normName(b.username);
      if (!n) fail(400, "Name must be 2–24 letters or numbers (spaces, . - _ are okay).");
      const password = b.password ? b.password : S.randomPassword();
      checkPassword(password);
      const u = await createUser(n.name, n.key, password, "user", true, FAMILY_CODE || null);
      if (!u) fail(409, "That name is already taken.");
      return send(res, 201, { user: pub(u), password });
    }
    const dm = path.match(/^\/api\/admin\/users\/([^/]+)\/data$/);
    if (dm && method === "GET") {
      await needAdmin(req);
      const key = decodeURIComponent(dm[1]).toLowerCase();
      const u = await getUser(key);
      if (!u) fail(404, "No such user.");
      const ld = await loadVisible(key);
      return send(res, 200, { username: u.name, data: ld.vis ? { trips: ld.vis.trips } : null, privateItems: ld.vis ? ld.vis.privateItems : 0, updatedAt: ld.rec ? ld.rec.updatedAt : null });
    }
    const m = path.match(/^\/api\/admin\/users\/([^/]+)(\/reset)?$/);
    if (m) {
      const admin = await needAdmin(req);
      const key = decodeURIComponent(m[1]).toLowerCase();
      if (m[2] && method === "POST") {
        const u = await getUser(key);
        if (!u) fail(404, "No such user.");
        if (u.role === "admin") fail(400, "Change the admin password from Account, or set ADMIN_PASSWORD in Vercel.");
        const b = await readJson(req).catch(() => ({}));
        const password = b.password ? b.password : S.randomPassword();
        checkPassword(password);
        u.hash = await S.hashPassword(password); u.pwv = (u.pwv || 1) + 1; u.mustChange = true;
        await store.set("user:" + key, JSON.stringify(u));
        await store.del("fail:u:" + key);
        return send(res, 200, { ok: true, password });
      }
      if (!m[2] && method === "DELETE") {
        const u = await getUser(key);
        if (!u) fail(404, "No such user.");
        if (u.role === "admin" || key === admin.key) fail(400, "The admin account can't be deleted.");
        await Promise.all([store.del("user:" + key), store.del("data:" + key), store.del("seen:" + key), store.del("feedseen:" + key), store.del("fail:u:" + key), store.srem("users", key), u.circle ? store.srem("circle:" + u.circle, key) : null, groupsApi.removeUser(key)]);
        return send(res, 200, { ok: true });
      }
    }

    fail(404, "Not found.");
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://x");
      await route(req, res, url.pathname.replace(/\/+$/, "") || "/", req.method);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      if (e instanceof SyntaxError) return send(res, 400, { error: "Bad request." });
      if (e && e.message === "NO_STORAGE") return send(res, 503, { error: "Database is not connected yet. In Vercel, connect an Upstash Redis store to this project and redeploy." });
      console.error(e);
      return send(res, 500, { error: "Something went wrong. Please try again." });
    }
  };
}

module.exports = { createApp, sanitizeData, normName };
