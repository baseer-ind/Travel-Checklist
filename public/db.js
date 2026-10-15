// Local-first store (IndexedDB). The device is the source of truth; the network is sync.
// Trips are stored one record each (keyed owner|tripId) so a trip is the unit everywhere,
// matching the per-trip server endpoints. See docs/PWA_AND_OFFLINE_ARCHITECTURE.md.
//
// Everything is wrapped in try/catch and degrades to a no-op when IndexedDB is missing or
// blocked (private windows, cleared site data), so the app still runs — it just won't persist
// locally. `BaggoDB.available` reports which case you're in.
(function () {
  "use strict";
  var DB_NAME = "baggo", DB_VER = 1;
  var dbp = null, available = true;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); }
      catch (e) { available = false; return reject(e); }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("trips")) db.createObjectStore("trips", { keyPath: "_key" });
        if (!db.objectStoreNames.contains("templates")) db.createObjectStore("templates", { keyPath: "_key" });
        if (!db.objectStoreNames.contains("recovered")) db.createObjectStore("recovered", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "k" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { available = false; reject(req.error); };
    }).catch(function (e) { available = false; return null; });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode), s = t.objectStore(store), out;
        var r = fn(s);
        if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { resolve(out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    }).catch(function () { return null; });   // a failed local read/write never breaks the app
  }
  function getAll(store) { return tx(store, "readonly", function (s) { return s.getAll(); }).then(function (r) { return r || []; }); }

  var ownerKey = function (owner, id) { return owner + "|" + id; };

  var BaggoDB = {
    get available() { return available; },

    // Load a user's whole state (the shape app.js keeps in `S`), rebuilt from per-trip records.
    loadState: function (owner) {
      return Promise.all([getAll("trips"), tx("meta", "readonly", function (s) { return s.get("state|" + owner); })])
        .then(function (res) {
          var rows = (res[0] || []).filter(function (r) { return r._owner === owner; });
          var meta = res[1] && res[1].v ? res[1].v : null;
          if (!rows.length && !meta) return null;
          var trips = rows.map(function (r) { return r.trip; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0) || (a.created || 0) - (b.created || 0); });
          return { next: (meta && meta.next) || 1, trips: trips, curTrip: meta ? meta.curTrip : null, curList: meta ? meta.curList : null, dirty: !!(meta && meta.dirty), rev: meta ? meta.rev : null };
        }).catch(function () { return null; });
    },

    // Persist a user's whole state: one record per trip, plus a small meta record. Removes
    // trip records that are no longer present (deleted trips) for this owner.
    saveState: function (owner, S, flags) {
      if (!S) return Promise.resolve();
      return open().then(function (db) {
        if (!db) return;
        return new Promise(function (resolve, reject) {
          var t = db.transaction(["trips", "meta"], "readwrite");
          var trips = t.objectStore("trips"), meta = t.objectStore("meta");
          var keep = {};
          (S.trips || []).forEach(function (trip, i) {
            var rec = { _key: ownerKey(owner, trip.id), _owner: owner, trip: trip };
            keep[rec._key] = 1; trips.put(rec);
          });
          var cur = trips.getAllKeys();
          cur.onsuccess = function () {
            (cur.result || []).forEach(function (k) {
              if (typeof k === "string" && k.indexOf(owner + "|") === 0 && !keep[k]) trips.delete(k);
            });
          };
          meta.put({ k: "state|" + owner, v: { next: S.next || 1, curTrip: S.curTrip, curList: S.curList, dirty: !!(flags && flags.dirty), rev: flags && flags.rev != null ? flags.rev : null } });
          t.oncomplete = resolve; t.onerror = function () { reject(t.error); }; t.onabort = function () { reject(t.error); };
        });
      }).catch(function () { });
    },

    // Sign-out wipe: remove this owner's trips, templates and recovered copies from the device.
    wipeOwner: function (owner) {
      return open().then(function (db) {
        if (!db) return;
        return new Promise(function (resolve) {
          var t = db.transaction(["trips", "templates", "meta"], "readwrite");
          ["trips", "templates"].forEach(function (name) {
            var s = t.objectStore(name), ks = s.getAllKeys();
            ks.onsuccess = function () { (ks.result || []).forEach(function (k) { if (typeof k === "string" && k.indexOf(owner + "|") === 0) s.delete(k); }); };
          });
          var meta = t.objectStore("meta");
          meta.delete("state|" + owner);
          meta.delete("sync|" + owner);
          meta.delete("session");
          t.oncomplete = resolve; t.onerror = resolve; t.onabort = resolve;
        });
      }).catch(function () { });
    },

    // Remember the signed-in user so the app can boot offline (the cookie is still valid; we're just
    // offline). Never stores a password or token — only the public identity.
    getSession: function () { return tx("meta", "readonly", function (s) { return s.get("session"); }).then(function (r) { return r ? r.v : null; }).catch(function () { return null; }); },
    setSession: function (sess) { return tx("meta", "readwrite", function (s) { return s.put({ k: "session", v: sess }); }); },
    clearSession: function () { return tx("meta", "readwrite", function (s) { return s.delete("session"); }); },

    // Per-trip sync bookkeeping: { [tripId]: { rev, sig } }. rev = last server revision seen;
    // sig = the trip's content when it was last in sync, used to detect local edits.
    getSyncMeta: function (owner) { return tx("meta", "readonly", function (s) { return s.get("sync|" + owner); }).then(function (r) { return r && r.v ? r.v : {}; }).catch(function () { return {}; }); },
    setSyncMeta: function (owner, m) { return tx("meta", "readwrite", function (s) { return s.put({ k: "sync|" + owner, v: m }); }); },

    getTemplates: function (owner) { return getAll("templates").then(function (rows) { return rows.filter(function (r) { return r._owner === owner; }).map(function (r) { return r.tpl; }); }); },
    putTemplate: function (owner, tpl) { return tx("templates", "readwrite", function (s) { return s.put({ _key: ownerKey(owner, tpl.id), _owner: owner, tpl: tpl }); }); },
    deleteTemplate: function (owner, id) { return tx("templates", "readwrite", function (s) { return s.delete(ownerKey(owner, id)); }); },

    // Losing versions after a conflict (recovered copies). Pruned after 7 days.
    pushRecovered: function (owner, trip, reason) {
      var rec = { id: owner + "|" + trip.id + "|" + Date.now(), owner: owner, at: Date.now(), reason: reason || "", trip: trip };
      return tx("recovered", "readwrite", function (s) { return s.put(rec); });
    },
    listRecovered: function (owner) { return getAll("recovered").then(function (rows) { return rows.filter(function (r) { return r.owner === owner && r.at > Date.now() - 7 * 864e5; }); }); },
    pruneRecovered: function () { return getAll("recovered").then(function (rows) { return Promise.all(rows.filter(function (r) { return r.at <= Date.now() - 7 * 864e5; }).map(function (r) { return tx("recovered", "readwrite", function (s) { return s.delete(r.id); }); })); }); },

    estimate: function () { try { return (navigator.storage && navigator.storage.estimate) ? navigator.storage.estimate() : Promise.resolve(null); } catch (e) { return Promise.resolve(null); } },
  };

  window.BaggoDB = BaggoDB;
})();
