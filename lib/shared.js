// Pure functions shared by the server and the browser-only preview (no Node-specific code in here).
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const int = (v, d) => (Number.isFinite(v) ? Math.trunc(v) : d);

// Whitelist + size-limit whatever the browser sends, so junk can never be stored.
function sanitizeData(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.trips)) return null;
  if (d.trips.length > 100) return null;
  const out = { next: Math.max(1, int(d.next, 1)), trips: [], curTrip: d.curTrip == null ? null : int(d.curTrip, null), curList: d.curList == null ? null : int(d.curList, null) };
  for (const t of d.trips) {
    if (!t || !Array.isArray(t.lists) || t.lists.length > 100) return null;
    const trip = { id: int(t.id, 0), name: str(t.name, 60) || "Trip", created: int(t.created, Date.now()), packedAt: t.packedAt == null ? null : int(t.packedAt, null), travelDate: /^\d{4}-\d{2}-\d{2}$/.test(t.travelDate || "") ? t.travelDate : null, lists: [] };
    if (t.hidden === true) trip.hidden = true;
    for (const l of t.lists) {
      if (!l || !Array.isArray(l.items) || l.items.length > 500) return null;
      const list = { id: int(l.id, 0), name: str(l.name, 60) || "List", emoji: str(l.emoji, 16) || "📋", items: [] };
      if (l.hidden === true) list.hidden = true;
      if (l.kind === "leave") list.kind = "leave";
      for (const i of l.items) {
        if (!i) return null;
        const item = { id: int(i.id, 0), emoji: str(i.emoji, 16) || "🧳", name: str(i.name, 80) || "Item", state: ["todo", "packed", "skip"].includes(i.state) ? i.state : "todo" };
        if (i.hidden === true) item.hidden = true;
        list.items.push(item);
      }
      trip.lists.push(list);
    }
    out.trips.push(trip);
  }
  return out;
}

// What OTHER people (family members, the admin pages) are allowed to see: private trips, checklists and items are removed.
function visible(d) {
  if (!d || !Array.isArray(d.trips)) return null;
  let total = 0, shown = 0;
  d.trips.forEach((t) => t.lists.forEach((l) => { if (l.kind !== "leave") l.items.forEach(() => total++); }));
  const trips = d.trips.filter((t) => !t.hidden).map((t) => ({
    id: t.id, name: t.name, created: t.created, packedAt: t.packedAt, travelDate: t.travelDate,
    lists: t.lists.filter((l) => !l.hidden && l.kind !== "leave").map((l) => ({
      id: l.id, name: l.name, emoji: l.emoji,
      items: l.items.filter((i) => !i.hidden).map((i) => { shown++; return { id: i.id, emoji: i.emoji, name: i.name, state: i.state }; }),
    })),
  }));
  return { trips, privateItems: total - shown };
}

function summarize(vis) {
  const out = { trips: [], tripCount: 0, items: 0, packed: 0, need: 0 };
  if (!vis) return out;
  vis.trips.forEach((t) => {
    let p = 0, n = 0;
    t.lists.forEach((l) => l.items.forEach((i) => { out.items++; if (i.state === "packed") { p++; n++; } else if (i.state === "todo") n++; }));
    out.packed += p; out.need += n;
    out.trips.push({ id: t.id, name: t.name, travelDate: t.travelDate, packedAt: t.packedAt, packed: p, need: n });
  });
  out.tripCount = vis.trips.length;
  return out;
}

// Work out what changed between two public views, as short "activity" events.
// `existing` = ids ("trip:list:item") still present in the owner's full data, so hiding an item is never reported as "removed".
function diffEvents(a, b, existing) {
  const ev = [];
  if (!b) return ev;
  const A = new Map(((a && a.trips) || []).map((t) => [t.id, t]));
  for (const t of b.trips) {
    const o = A.get(t.id);
    if (!o) { ev.push({ k: "trip", trip: t.name }); continue; }
    if (t.travelDate && t.travelDate !== o.travelDate) ev.push({ k: "date", trip: t.name, date: t.travelDate });
    if (t.packedAt && !o.packedAt) ev.push({ k: "done", trip: t.name });
    const L = new Map(o.lists.map((l) => [l.id, l]));
    for (const l of t.lists) {
      const ol = L.get(l.id);
      if (!ol) { ev.push({ k: "list", trip: t.name, list: l.name }); continue; }
      const I = new Map(ol.items.map((i) => [i.id, i]));
      for (const i of l.items) {
        const oi = I.get(i.id);
        const base = { trip: t.name, list: l.name, item: i.name, emoji: i.emoji };
        if (!oi) ev.push(Object.assign({ k: "add" }, base));
        else if (oi.state !== i.state) ev.push(Object.assign({ k: i.state === "packed" ? "pack" : i.state === "skip" ? "skip" : "unpack" }, base));
      }
      const now = new Set(l.items.map((i) => i.id));
      ol.items.forEach((oi) => { if (!now.has(oi.id) && !(existing && existing.has(t.id + ":" + l.id + ":" + oi.id))) ev.push({ k: "remove", trip: t.name, list: l.name, item: oi.name, emoji: oi.emoji }); });
    }
  }
  return ev.slice(0, 40);
}

function existingIds(d) {
  const set = new Set();
  ((d && d.trips) || []).forEach((t) => t.lists.forEach((l) => l.items.forEach((i) => set.add(t.id + ":" + l.id + ":" + i.id))));
  return set;
}
const api = { sanitizeData, visible, summarize, diffEvents, existingIds };
if (typeof module !== "undefined" && module.exports) module.exports = api;
