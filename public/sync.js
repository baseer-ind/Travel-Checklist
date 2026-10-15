// Per-trip sync queue (client). The device is the source of truth; this reconciles it with the
// server one trip at a time, so nothing is lost:
//   push — each changed trip is PUT with the revision we last saw. If another device got there
//          first the server replies 409; we keep OUR version as a recovered copy, then take the
//          server's copy. Deleted-here trips are DELETEd.
//   pull — new or advanced trips on the server are fetched; trips deleted elsewhere are removed
//          locally (only when we have no unsynced edit to them).
// See docs/PWA_AND_OFFLINE_ARCHITECTURE.md §3.
(function () {
  "use strict";
  var cfg = null;          // { owner, api, getState, onApply, onNote, onStatus, onDirty, onAuthExpired, db }
  var M = {};              // sync meta: { [tripId]: { rev, sig } }
  var running = false, queued = false, timer = null, retryTimer = null, retryMs = 0;

  function clean(t) { var c = {}; for (var k in t) { if (k !== "rev" && k !== "updated") c[k] = t[k]; } return c; }
  function sig(t) { return JSON.stringify(clean(t)); }
  function tripById(S, id) { for (var i = 0; i < S.trips.length; i++) if (String(S.trips[i].id) === String(id)) return S.trips[i]; return null; }
  function indexOfTrip(S, id) { for (var i = 0; i < S.trips.length; i++) if (String(S.trips[i].id) === String(id)) return i; return -1; }

  function anyDirty() {
    var S = cfg.getState(); if (!S) return false;
    for (var i = 0; i < S.trips.length; i++) { var t = S.trips[i], m = M[t.id]; if (!m || m.sig !== sig(t)) return true; }
    for (var id in M) if (!tripById(S, id)) return true;   // a local deletion still to push
    return false;
  }
  function status() { cfg.onStatus(running ? "saving" : anyDirty() ? "pending" : "saved"); if (cfg.onDirty) cfg.onDirty(anyDirty()); }

  var api = function (m, p, b) { return cfg.api(m, p, b); };

  async function push() {
    var S = cfg.getState(), changed = false;
    // changed or new trips
    for (var i = 0; i < S.trips.length; i++) {
      var t = S.trips[i], s = sig(t), m = M[t.id];
      if (m && m.sig === s) continue;                       // unchanged since last sync
      var baseRev = m ? m.rev : 0;
      try {
        var r = await api("PUT", "/api/trips/" + encodeURIComponent(t.id), { baseRev: baseRev, trip: clean(t) });
        M[t.id] = { rev: r.rev, sig: s };
      } catch (e) {
        if (e.status === 409 && e.body) {                   // another device won; keep ours, take theirs
          await cfg.db.pushRecovered(cfg.owner, t, "A newer version from another device replaced this.");
          var srv = e.body.trip;
          var idx = indexOfTrip(S, t.id);
          if (srv) {
            if (idx !== -1) S.trips[idx] = clean(srv);
            M[t.id] = { rev: e.body.rev, sig: sig(srv) };
            cfg.onNote("Kept your “" + t.name + "” as a recovered copy — another device had a newer version.");
          } else {                                          // deleted on the other device
            if (idx !== -1) S.trips.splice(idx, 1);
            delete M[t.id];
            if (String(S.curTrip) === String(t.id)) S.curTrip = S.trips[0] ? S.trips[0].id : null;
            cfg.onNote("“" + t.name + "” was removed on another device — kept a recovered copy here.");
          }
          changed = true;
        } else throw e;
      }
    }
    // trips deleted here (in meta, gone from state) → delete on the server
    for (var id in M) {
      if (tripById(S, id)) continue;
      try { await api("DELETE", "/api/trips/" + encodeURIComponent(id), { baseRev: M[id].rev }); } catch (e) { if (e.status !== 409 && e.status !== 404) throw e; }
      delete M[id];
    }
    return changed;
  }

  async function pull() {
    var S = cfg.getState(), changed = false;
    var idx = await api("GET", "/api/trips"), serverIds = {};
    for (var i = 0; i < idx.trips.length; i++) {
      var row = idx.trips[i]; serverIds[row.id] = 1;
      var local = tripById(S, row.id), m = M[row.id];
      if (!local) {                                         // a trip from another device
        var full = await api("GET", "/api/trips/" + encodeURIComponent(row.id));
        S.trips.push(clean(full.trip)); M[row.id] = { rev: full.rev, sig: sig(full.trip) }; changed = true; continue;
      }
      var localDirty = !m || m.sig !== sig(local);
      if (m && row.rev !== m.rev && !localDirty) {          // server advanced, nothing unsynced here → fast-forward
        var f = await api("GET", "/api/trips/" + encodeURIComponent(row.id));
        var at = indexOfTrip(S, row.id); S.trips[at] = clean(f.trip); M[row.id] = { rev: f.rev, sig: sig(f.trip) }; changed = true;
      }
    }
    // trips deleted on another device → remove locally when we have no unsynced edit to them
    for (var j = S.trips.length - 1; j >= 0; j--) {
      var t = S.trips[j];
      if (!serverIds[t.id] && M[t.id] && M[t.id].sig === sig(t)) {
        S.trips.splice(j, 1); delete M[t.id];
        if (String(S.curTrip) === String(t.id)) S.curTrip = S.trips[0] ? S.trips[0].id : null;
        changed = true;
      }
    }
    return changed;
  }

  async function pass() {
    if (!cfg) return;
    if (running) { queued = true; return; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { status(); return; }
    running = true; status();
    var changed = false;
    try {
      changed = (await push()) || changed;
      changed = (await pull()) || changed;
      retryMs = 0;
    } catch (e) {
      running = false;
      if (e && e.status === 401) { if (cfg.onAuthExpired) cfg.onAuthExpired(); return; }
      cfg.onStatus("error");
      retryMs = Math.min((retryMs || 1000) * 2, 30000);
      clearTimeout(retryTimer); retryTimer = setTimeout(pass, retryMs);
      if (changed) cfg.onApply();
      await save();
      return;
    }
    running = false;
    await save();
    if (changed) cfg.onApply();
    status();
    if (queued) { queued = false; return pass(); }
  }
  function save() { return cfg.db ? cfg.db.setSyncMeta(cfg.owner, M).catch(function () { }) : Promise.resolve(); }

  window.BaggoSync = {
    configure: function (c) { cfg = c; },
    loadMeta: function () { if (!cfg || !cfg.db) { M = {}; return Promise.resolve(); } return cfg.db.getSyncMeta(cfg.owner).then(function (m) { M = m || {}; }); },
    reset: function () { M = {}; queued = false; clearTimeout(timer); clearTimeout(retryTimer); retryMs = 0; running = false; },
    markDirty: function () { if (!cfg) return; status(); clearTimeout(timer); timer = setTimeout(pass, 500); },
    pass: function () { return pass(); },
    anyDirty: anyDirty,
  };
})();
