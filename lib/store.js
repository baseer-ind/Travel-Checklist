// Storage layer. Production: Upstash Redis over REST (no npm packages needed).
// Local development / tests: a JSON file. The preview in the browser uses the same in-memory store on localStorage.
function upstashStore(url, token) {
  async function cmd(args) {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (!r.ok || j.error) throw new Error("Storage error: " + (j.error || r.status));
    return j.result;
  }
  return {
    name: "upstash",
    secretSeed: token,
    get: async (k) => { const v = await cmd(["GET", k]); return v == null ? null : String(v); },
    set: async (k, v) => { await cmd(["SET", k, v]); },
    setnx: async (k, v) => (await cmd(["SET", k, v, "NX"])) === "OK",
    del: async (k) => { await cmd(["DEL", k]); },
    // count an event inside a time window; returns the new count
    hit: async (k, ttl) => { const n = await cmd(["INCR", k]); if (n === 1) await cmd(["EXPIRE", k, String(ttl)]); return n; },
    incr: async (k) => Number(await cmd(["INCR", k])),
    count: async (k) => { const v = await cmd(["GET", k]); return v == null ? 0 : Number(v); },
    lpush: async (k, arr, max) => { if (!arr.length) return; await cmd(["LPUSH", k].concat(arr)); await cmd(["LTRIM", k, "0", String(max - 1)]); },
    lrange: async (k, n) => (await cmd(["LRANGE", k, "0", String(n - 1)])) || [],
    sadd: async (k, m) => { await cmd(["SADD", k, m]); },
    srem: async (k, m) => { await cmd(["SREM", k, m]); },
    smembers: async (k) => (await cmd(["SMEMBERS", k])) || [],
    hset: async (k, f, v) => { await cmd(["HSET", k, f, v]); },
    hget: async (k, f) => { const v = await cmd(["HGET", k, f]); return v == null ? null : String(v); },
    hdel: async (k, f) => { await cmd(["HDEL", k, f]); },
    hgetall: async (k) => { const a = (await cmd(["HGETALL", k])) || []; const o = {}; for (let i = 0; i + 1 < a.length; i += 2) o[a[i]] = a[i + 1]; return o; },
  };
}

// db is a plain object; persist() is called after every change.
function memoryStore(db, persist, seed) {
  const live = (e) => e && (!e.exp || e.exp > Date.now());
  const read = (k) => { const e = db[k]; if (e && !live(e)) { delete db[k]; return null; } return e || null; };
  const ensure = (k, t, v) => read(k) || (db[k] = { t, v });
  return {
    name: "file",
    secretSeed: seed || "local-dev-only-secret",
    get: async (k) => { const e = read(k); return e && e.t === "s" ? e.v : null; },
    set: async (k, v) => { db[k] = { t: "s", v: String(v) }; persist(); },
    setnx: async (k, v) => { if (read(k)) return false; db[k] = { t: "s", v: String(v) }; persist(); return true; },
    del: async (k) => { delete db[k]; persist(); },
    hit: async (k, ttl) => {
      let e = read(k);
      if (!e) e = db[k] = { t: "n", v: 0, exp: Date.now() + ttl * 1000 };
      e.v += 1; persist(); return e.v;
    },
    incr: async (k) => { const e = ensure(k, "n", 0); e.v += 1; persist(); return e.v; },
    count: async (k) => { const e = read(k); return e && e.t === "n" ? e.v : 0; },
    lpush: async (k, arr, max) => { const e = ensure(k, "list", []); arr.forEach((x) => e.v.unshift(String(x))); e.v = e.v.slice(0, max); persist(); },
    lrange: async (k, n) => { const e = read(k); return e && e.t === "list" ? e.v.slice(0, n) : []; },
    sadd: async (k, m) => { const e = ensure(k, "set", []); if (!e.v.includes(m)) e.v.push(m); persist(); },
    srem: async (k, m) => { const e = read(k); if (e) { e.v = e.v.filter((x) => x !== m); persist(); } },
    smembers: async (k) => { const e = read(k); return e && e.t === "set" ? e.v.slice() : []; },
    hset: async (k, f, v) => { const e = ensure(k, "hash", {}); e.v[f] = String(v); persist(); },
    hget: async (k, f) => { const e = read(k); return e && e.t === "hash" && f in e.v ? e.v[f] : null; },
    hdel: async (k, f) => { const e = read(k); if (e && e.t === "hash") { delete e.v[f]; persist(); } },
    hgetall: async (k) => { const e = read(k); return e && e.t === "hash" ? Object.assign({}, e.v) : {}; },
  };
}

function fileStore(file) {
  const fs = require("fs"), path = require("path");
  let db = {};
  try { db = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { db = {}; }
  let writing = false, again = false;
  function persist() {
    if (writing) { again = true; return; }
    writing = true;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + "." + process.pid + ".tmp";
    fs.writeFile(tmp, JSON.stringify(db), (err) => {
      const done = () => { writing = false; if (again) { again = false; persist(); } };
      if (err) return done();
      fs.rename(tmp, file, done);
    });
  }
  return memoryStore(db, persist);
}

function unconfiguredStore() {
  const fail = async () => { throw new Error("NO_STORAGE"); };
  const names = "get set setnx del hit incr count lpush lrange sadd srem smembers hset hget hdel hgetall".split(" ");
  const o = { name: "none", secretSeed: "" };
  names.forEach((n) => { o[n] = fail; });
  return o;
}

function createStore(env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) return upstashStore(url, token);
  if (env.VERCEL && !env.ALLOW_FILE_STORE) return unconfiguredStore();
  return fileStore(env.DATA_FILE || require("path").join(process.cwd(), ".data", "db.json"));
}

module.exports = { createStore, memoryStore };
