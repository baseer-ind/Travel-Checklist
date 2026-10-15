// Per-trip sync endpoints for the local-first (v2) client.
//
// The user document (key "data:<key>") stays the single source of truth, so the existing
// /api/data, family, admin and share code — and the 34 tests that guard privacy — are unchanged.
// Each trip carries its own `rev`; a save only lands if the caller's baseRev matches, otherwise
// the server's copy is returned (409) and the client keeps a recovered copy. See
// docs/PWA_AND_OFFLINE_ARCHITECTURE.md §3.
//
// Known limit: a save is read-modify-write on the whole document. Two of the SAME user's devices
// writing DIFFERENT trips at the same instant can still race at the document level (v1 /api/data
// has this too). The per-trip rev check catches the common case — the same trip from two devices.
// A Redis hash with a Lua compare-and-set removes the document-level race and is the next step.

const MAX_TRIP_BYTES = 300000;   // 300 KB per trip  (docs/STATUS.md limits table)
const MAX_TRIPS = 100;           // per user

module.exports = function trips(ctx) {
  const { store, send, fail, readJson, need, sanitizeTrip, logActivity } = ctx;

  const docKey = (key) => "data:" + key;
  async function readDoc(key) {
    const raw = await store.get(docKey(key));
    const rec = raw ? JSON.parse(raw) : null;
    const data = rec && rec.data ? rec.data : { next: 1, trips: [], curTrip: null, curList: null };
    return { rec, data };
  }
  async function writeDoc(key, prevRec, data) {
    const rec = { rev: (prevRec ? prevRec.rev : 0) + 1, updatedAt: Date.now(), data };
    await store.set(docKey(key), JSON.stringify(rec));
    return rec;
  }
  const revOf = (t) => (t && t.rev != null ? t.rev : 0);
  // the trip as another device should receive it (rev always present)
  const withRev = (t) => Object.assign({}, t, { rev: revOf(t) });

  async function route(req, res, path, method) {
    if (path !== "/api/trips" && !path.startsWith("/api/trips/")) return false;
    const u = await need(req);

    // GET /api/trips → lightweight index for polling
    if (path === "/api/trips" && method === "GET") {
      const { data } = await readDoc(u.key);
      return send(res, 200, { trips: data.trips.map((t) => ({ id: t.id, rev: revOf(t), updated: t.updated || null, name: t.name })) });
    }

    const m = path.match(/^\/api\/trips\/([^/]+)$/);
    if (!m) fail(404, "Not found.");
    const tripId = decodeURIComponent(m[1]);
    const idEq = (t) => String(t.id) === tripId;

    if (method === "GET") {
      const { data } = await readDoc(u.key);
      const t = data.trips.find(idEq);
      if (!t) fail(404, "No such trip.");
      return send(res, 200, { trip: withRev(t), rev: revOf(t) });
    }

    if (method === "PUT") {
      const b = await readJson(req);
      const clean = sanitizeTrip(b.trip);
      if (!clean) fail(400, "That trip doesn't look right.");
      if (String(clean.id) !== tripId) fail(400, "Trip id doesn't match the URL.");
      if (JSON.stringify(clean).length > MAX_TRIP_BYTES) fail(413, "This trip is too big to save.");
      const baseRev = Number(b.baseRev);
      if (!Number.isFinite(baseRev)) fail(400, "Missing baseRev.");

      const { rec, data } = await readDoc(u.key);
      const idx = data.trips.findIndex(idEq);
      const serverRev = idx === -1 ? 0 : revOf(data.trips[idx]);
      if (baseRev !== serverRev) {                                   // someone else saved first
        const current = idx === -1 ? null : withRev(data.trips[idx]);
        return send(res, 409, { conflict: true, rev: serverRev, trip: current });
      }
      if (idx === -1 && data.trips.length >= MAX_TRIPS) fail(400, "You already have " + MAX_TRIPS + " trips. Archive or delete one first.");

      clean.rev = serverRev + 1;
      clean.updated = Date.now();
      const prevData = JSON.parse(JSON.stringify(data));
      if (idx === -1) data.trips.push(clean); else data.trips[idx] = clean;
      const newRec = await writeDoc(u.key, rec, data);
      await logActivity(u, prevData, data);
      return send(res, 200, { ok: true, rev: clean.rev, docRev: newRec.rev });
    }

    if (method === "DELETE") {
      const b = await readJson(req).catch(() => ({}));
      const { rec, data } = await readDoc(u.key);
      const idx = data.trips.findIndex(idEq);
      if (idx === -1) return send(res, 200, { ok: true, gone: true });   // already gone; delete is idempotent
      const serverRev = revOf(data.trips[idx]);
      const baseRev = Number(b.baseRev);
      if (Number.isFinite(baseRev) && baseRev !== serverRev) return send(res, 409, { conflict: true, rev: serverRev, trip: withRev(data.trips[idx]) });
      const prevData = JSON.parse(JSON.stringify(data));
      data.trips.splice(idx, 1);
      if (String(data.curTrip) === tripId) data.curTrip = data.trips[0] ? data.trips[0].id : null;
      await writeDoc(u.key, rec, data);
      await logActivity(u, prevData, data);
      return send(res, 200, { ok: true });
    }

    fail(404, "Not found.");
  }

  return { route: async (req, res, path, method) => ((await route(req, res, path, method)) !== false) };
};
