// Pure functions shared by the server and the browser-only preview (no Node-specific code in here).
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const int = (v, d) => (Number.isFinite(v) ? Math.trunc(v) : d);
// IDs may be legacy integers or new random strings (local-first; a counter collides across devices).
const id = (v) => (typeof v === "string" && v ? v.slice(0, 40) : int(v, 0));
const LIST_KINDS = ["packing", "documents", "home", "money", "digital", "departure", "during", "custom", "leave"];

// One trip, whitelisted and size-limited. Returns a clean trip or null if the shape is wrong.
function sanitizeTrip(t) {
  if (!t || !Array.isArray(t.lists) || t.lists.length > 100) return null;
  const trip = {
    id: id(t.id), name: str(t.name, 60) || "Trip", created: int(t.created, Date.now()),
    packedAt: t.packedAt == null ? null : int(t.packedAt, null),
    travelDate: /^\d{4}-\d{2}-\d{2}$/.test(t.travelDate || "") ? t.travelDate : null,
    lists: [],
  };
  // optional trip fields (section H); only stored when present
  if (/^\d{4}-\d{2}-\d{2}$/.test(t.end || "")) trip.end = t.end;
  if (typeof t.destination === "string" && t.destination.trim()) trip.destination = str(t.destination, 80);
  if (typeof t.profile === "string" && t.profile) trip.profile = str(t.profile, 24);
  if (t.travellers != null) trip.travellers = Math.min(50, Math.max(1, int(t.travellers, 1)));
  if (t.archived === true) trip.archived = true;
  if (t.hidden === true) trip.hidden = true;
  if (t.rev != null) trip.rev = Math.max(0, int(t.rev, 0));           // per-trip revision, kept across saves
  if (t.updated != null) trip.updated = int(t.updated, 0);
  if (t.order != null) trip.order = int(t.order, 0);
  for (const l of t.lists) {
    if (!l || !Array.isArray(l.items) || l.items.length > 500) return null;
    const list = { id: id(l.id), name: str(l.name, 60) || "List", emoji: str(l.emoji, 16) || "📋", items: [] };
    if (l.hidden === true) list.hidden = true;
    // keep legacy "leave" working; otherwise accept the section H kinds
    if (l.kind === "leave") list.kind = "leave";
    else if (LIST_KINDS.includes(l.kind)) list.kind = l.kind;
    if (l.order != null) list.order = int(l.order, 0);
    for (const i of l.items) {
      if (!i) return null;
      const item = {
        id: id(i.id), emoji: str(i.emoji, 16) || "🧳", name: str(i.name, 80) || "Item",
        state: ["todo", "packed", "skip"].includes(i.state) ? i.state : "todo",
      };
      if (i.hidden === true) item.hidden = true;
      if (i.qty != null) item.qty = Math.min(99, Math.max(1, int(i.qty, 1)));
      if (typeof i.note === "string" && i.note.trim()) item.note = str(i.note, 200);
      if (typeof i.link === "string" && i.link.trim()) item.link = str(i.link, 300);
      if (i.mnf === true) item.mnf = true;                               // must-not-forget
      if (i.order != null) item.order = int(i.order, 0);
      list.items.push(item);
    }
    trip.lists.push(list);
  }
  return trip;
}

// Whitelist + size-limit the whole user document the browser sends.
function sanitizeData(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.trips)) return null;
  if (d.trips.length > 100) return null;
  const out = {
    next: Math.max(1, int(d.next, 1)), trips: [],
    curTrip: d.curTrip == null ? null : id(d.curTrip),
    curList: d.curList == null ? null : id(d.curList),
  };
  for (const t of d.trips) { const trip = sanitizeTrip(t); if (!trip) return null; out.trips.push(trip); }
  return out;
}

// What OTHER people (family, admin pages, share links) may see: private trips, lists and items are removed,
// and so is the departure ("leave") list. A private item takes its note and link with it.
function visible(d) {
  if (!d || !Array.isArray(d.trips)) return null;
  let total = 0, shown = 0;
  d.trips.forEach((t) => t.lists.forEach((l) => { if (l.kind !== "leave") l.items.forEach(() => total++); }));
  const trips = d.trips.filter((t) => !t.hidden).map((t) => ({
    id: t.id, name: t.name, created: t.created, packedAt: t.packedAt, travelDate: t.travelDate,
    lists: t.lists.filter((l) => !l.hidden && l.kind !== "leave").map((l) => ({
      id: l.id, name: l.name, emoji: l.emoji,
      items: l.items.filter((i) => !i.hidden).map((i) => {
        shown++;
        const o = { id: i.id, emoji: i.emoji, name: i.name, state: i.state };
        if (i.qty != null) o.qty = i.qty;
        if (i.note) o.note = i.note;
        if (i.link) o.link = i.link;
        if (i.mnf) o.mnf = true;
        return o;
      }),
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
const api = { sanitizeData, sanitizeTrip, visible, summarize, diffEvents, existingIds };
if (typeof module !== "undefined" && module.exports) module.exports = api;
