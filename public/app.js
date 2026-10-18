(function () {
  "use strict";

  /* ================= templates ================= */
  var ITEM_EMOJI = [
    [/passport|visa|\bid\b/i, "🛂"], [/ticket|booking|boarding/i, "🎟️"], [/card|wallet/i, "💳"], [/cash|money|currency/i, "💵"],
    [/phone|mobile/i, "📱"], [/charger|cable|power/i, "🔌"], [/headphone|earbud|airpod/i, "🎧"], [/shirt|cloth|jacket|dress|pant|jean|sweater|coat/i, "👕"],
    [/shoe|sandal|sneaker|boot|slipper/i, "👟"], [/tooth/i, "🪥"], [/soap|shampoo|toiletr|towel/i, "🧴"], [/medic|pill|tablet/i, "💊"],
    [/sun ?screen|lotion/i, "🧴"], [/glass|shade/i, "🕶️"], [/bag|backpack|luggage|suitcase/i, "🎒"], [/water|bottle/i, "💧"],
    [/camera|gopro/i, "📸"], [/book|kindle|novel/i, "📚"], [/hat|cap/i, "🧢"], [/umbrella|rain/i, "☂️"], [/swim|beach/i, "🩱"],
    [/snack|food|chocolate/i, "🍫"], [/laptop|ipad/i, "💻"], [/map|guide/i, "🗺️"], [/key/i, "🔑"], [/watch/i, "⌚"], [/pillow/i, "😴"]
  ];
  var LIST_EMOJI = [
    [/cloth|wear|outfit|shoe/i, "👕"], [/gadget|tech|electronic|device/i, "📱"], [/doc|paper|passport|id/i, "🛂"],
    [/toilet|hygiene|beauty|care/i, "🧴"], [/med|health|first/i, "💊"], [/food|snack/i, "🍫"], [/beach|swim/i, "🏖️"],
    [/work|office/i, "💼"], [/kid|baby/i, "🧸"], [/money|cash|finance/i, "💵"]
  ];
  var LEAVE_TASKS = [["🔑", "Lock doors & windows"], ["🔌", "Unplug appliances"], ["🔥", "Turn off the gas / stove"], ["🚰", "Turn off taps & water heater"], ["🗑️", "Take out the trash"], ["🔋", "Charge phone & power bank"], ["🪪", "Check passport / ID & tickets"], ["💵", "Carry cash & cards"], ["🏠", "Tell a neighbour or family you're away"], ["🪴", "Water plants / arrange pets"]];
  var ESSENTIALS = [
    { id: "id", emoji: "🪪", label: "ID / passport", re: /passport|visa|\bid\b|identity|licen[sc]e/i, add: ["🪪", "Passport / ID"] },
    { id: "tickets", emoji: "🎟️", label: "Tickets & bookings", re: /ticket|boarding|booking|reservation/i, add: ["🎟️", "Tickets & bookings"] },
    { id: "money", emoji: "💳", label: "Money & cards", re: /wallet|cash|money|credit|debit|\bcards\b|purse|currency/i, add: ["💳", "Wallet & cards"] },
    { id: "phone", emoji: "📱", label: "Phone", re: /\bphone\b|\bmobile\b|\btab\b|iphone|smartphone/i, add: ["📱", "Phone"] },
    { id: "charger", emoji: "🔌", label: "Charger / power bank", re: /charger|power ?bank|adapter/i, add: ["🔌", "Charger & power bank"] },
    { id: "meds", emoji: "💊", label: "Medicines", re: /medic|tablet|pill|first ?aid|bandage|prescription/i, add: ["💊", "Medicines"] }
  ];
  function guess(map, name, fallback) { for (var i = 0; i < map.length; i++) { if (map[i][0].test(name)) return map[i][1]; } return fallback; }

  /* ================= state ================= */
  var S = null;               // the checklist data (saved to the server)
  var user = null;            // {username,key,role,mustChange}
  var cfg = { signupEnabled: false };
  var rev = 0, dirty = false, saving = false, saveTimer = null, retryMs = 0, saveState = "saved";
  var view = "app";           // app | account | admin | adminuser | mustchange
  var appView = "home";       // within view==="app" (signed-in v2): home | trip | new
  var ntForm = null;          // signed-in New-trip form state
  var offlineBoot = false;    // true when the app was booted from local cache with no network
  var adminGroups = null, adminUsers = null, adminDetail = null, flash = null, lastKey = null, expiredMsg = null;
  var authMode = "login";
  var family = null, unread = 0, adminTab = "people", adminFeed = null, adminTrips = null, member = null;

  var $ = function (i) { return document.getElementById(i); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn) { var b = el("button", cls, text); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }

  /* ================= api ================= */
  function api(method, path, body, keepalive) {
    return fetch(path, {
      method: method, credentials: "same-origin", keepalive: !!keepalive,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.error) || "Something went wrong."); e.status = r.status; e.body = j; throw e; }
        return j;
      });
    });
  }
  function errText(e) { return e && e.status ? e.message : "Can't reach the server. Check your internet and try again."; }

  /* ================= data model ================= */
  var uid = 1, migrated = false;
  // Random string IDs: a per-user counter (S.next) collides as soon as two devices add items
  // offline. These are unique per device and joined (never merged) on sync.
  function nid() { return "x" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function numId(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  function persistLocal() { if (user && S && window.BaggoDB) BaggoDB.saveState(user.key, S); }
  function mkItem(e, n) { return { id: nid(), emoji: e, name: n, state: "todo" }; }
  function mkList(name, emoji, items, kind) { var l = { id: nid(), name: name, emoji: emoji, items: (items || []).map(function (i) { return mkItem(i[0], i[1]); }) }; if (kind) l.kind = kind; return l; }
  function mkLeaveList() { return mkList("Before you leave", "🔑", LEAVE_TASKS, "leave"); }
  function emptyState() { return { next: 1, trips: [], curTrip: null, curList: null }; }
  function normalize(d) {
    d = d && d.trips ? d : emptyState();
    var max = 0;
    d.trips.forEach(function (t) { max = Math.max(max, numId(t.id)); t.lists.forEach(function (l) { max = Math.max(max, numId(l.id)); l.items.forEach(function (i) { max = Math.max(max, numId(i.id)); }); }); });
    d.next = Math.max(d.next || 1, max + 1);
    var keep = S; S = d;      // trips made before "Before you leave" existed get that checklist added
    d.trips.forEach(function (t) { if (!t.lists.some(function (l) { return l.kind === "leave"; })) { t.lists.push(mkLeaveList()); migrated = true; } });
    S = keep;
    if (!d.trips.some(function (t) { return t.id === d.curTrip; })) { var last = d.trips[d.trips.length - 1]; d.curTrip = last ? last.id : null; }
    var ct = d.trips.filter(function (t) { return t.id === d.curTrip; })[0];
    if (ct && !ct.lists.some(function (l) { return l.id === d.curList; })) d.curList = ct.lists[0] ? ct.lists[0].id : null;
    return d;
  }
  function trip() { return S && S.trips.filter(function (t) { return t.id === S.curTrip; })[0] || null; }
  function list() { var t = trip(); if (!t) return null; return t.lists.filter(function (l) { return l.id === S.curList; })[0] || t.lists[0] || null; }
  function counts(items) { var p = 0, t = 0, s = 0; items.forEach(function (i) { if (i.state === "packed") p++; else if (i.state === "skip") s++; else t++; }); return { p: p, t: t, s: s, need: p + t }; }
  function tripCounts(t) { var c = { p: 0, t: 0, s: 0, need: 0 }; t.lists.forEach(function (l) { if (l.kind === "leave") return; var x = counts(l.items); c.p += x.p; c.t += x.t; c.s += x.s; c.need += x.need; }); return c; }
  function fmtDate(ts) { try { return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } }
  function fmtDateTime(ts) { if (!ts) return "never"; try { return new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }

  function ago(ts) {
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return "just now"; if (m < 60) return m + " min ago";
    var h = Math.round(m / 60); if (h < 24) return h + " hr ago";
    var d = Math.round(h / 24); return d + (d === 1 ? " day ago" : " days ago");
  }
  function feedLine(e) {
    var who = e.n;
    switch (e.k) {
      case "trip": return "✈️ " + who + " started the trip “" + e.trip + "”";
      case "list": return "📋 " + who + " added the checklist “" + e.list + "” to " + e.trip;
      case "date": return "📅 " + who + " set the travel date for “" + e.trip + "” to " + e.date;
      case "done": return "🎉 " + who + " finished packing for “" + e.trip + "”!";
      default:
        var icon = { pack: "✅", skip: "🚫", add: "➕", remove: "➖", unpack: "↩️" }[e.k] || "•";
        var verb = { pack: "packed", skip: "skipped", add: "added", remove: "removed", unpack: "un-packed" }[e.k] || e.k;
        return icon + " " + who + " " + verb + " " + e.emoji + " " + e.item + " · " + e.list + " · " + e.trip;
    }
  }
  function dayWords(date) {
    var d = parseDay(date); if (!d) return "no date yet";
    var n = new Date(); n = new Date(n.getFullYear(), n.getMonth(), n.getDate()); var k = Math.round((d - n) / 86400000);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + (k > 0 ? " (in " + k + (k === 1 ? " day)" : " days)") : k === 0 ? " (today!)" : " (passed)");
  }

  /* ================= saving / sync ================= */
  var STATUS_TEXT = { saved: "✓ Saved", pending: "● Unsaved…", saving: "● Saving…", error: "⚠ Not saved — retrying" };
  function setStatus(s) { saveState = s; var e = $("saveStatus"); if (e) { e.textContent = STATUS_TEXT[s]; e.className = "status " + s; } }
  // Every edit is written to the device first, then the per-trip sync engine reconciles with the server.
  function touch() { persistLocal(); if (window.BaggoSync) BaggoSync.markDirty(); else setStatus("pending"); }
  function flush() { return window.BaggoSync ? BaggoSync.pass() : Promise.resolve(); }
  function configureSync() {
    if (!window.BaggoSync) return;
    BaggoSync.configure({
      owner: user.key, api: api, db: window.BaggoDB,
      getState: function () { return S; },
      onApply: function () { if (S) normalize(S); persistLocal(); applyRemote(); },
      onNote: function (m) { toast(m); },
      onStatus: function (st) { saving = (st === "saving"); setStatus(st); },
      onDirty: function (d) { dirty = d; },
      onAuthExpired: function () { sessionExpired(); },
    });
  }
  // Re-render after sync changed S — unless the user is mid-action (typing, or a modal/sheet open).
  function applyRemote() {
    if (!user || !S) return;
    if ($("modal") && $("modal").classList.contains("show")) return;
    var a = document.activeElement;
    if (a && (a.id === "newItem" || a.id === "gNewItem") && a.value) return;
    render();
  }
  function sessionExpired() {
    lastKey = user ? user.key : null; user = null; view = "app";
    expiredMsg = "Your session ended. Please log in again" + (dirty ? " — your latest changes will be saved when you do." : ".");
    render();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { if (user) flush(); } else { if (user) flush(); pollUnread(); }
  });
  window.addEventListener("pagehide", function () { if (user) flush(); });
  window.addEventListener("online", function () { if (user) flush(); });

  /* periodic reconcile with the server while the tab is open */
  setInterval(function () { if (user && !document.hidden) flush(); }, 20000);

  /* ================= modal ================= */
  var modalCb = null, modalOptional = false;
  function openModal(o, cb) {
    $("mTitle").textContent = o.title; $("mText").textContent = o.text || ""; $("mText").style.display = o.text ? "block" : "none";
    var inp = $("mInput"); inp.style.display = o.input === false ? "none" : "block";
    inp.type = o.inputType || "text"; inp.value = o.value || ""; inp.placeholder = o.placeholder || "";
    var sel = $("mSel"); sel.innerHTML = "";
    if (o.select) { o.select.forEach(function (x) { var op = document.createElement("option"); op.value = x[0]; op.textContent = x[1]; sel.appendChild(op); }); sel.style.display = "block"; } else sel.style.display = "none";
    $("mOk").textContent = o.ok || "OK";
    modalCb = cb; modalOptional = !!o.optional; $("modal").classList.add("show");
    setTimeout(function () { if (o.input === false) $("mOk").focus(); else { inp.focus(); if (inp.type === "text") inp.select(); } }, 30);
  }
  function closeModal() { $("modal").classList.remove("show"); modalCb = null; }
  function submitModal() {
    var cb = modalCb, v = $("mInput").value.trim(), needs = $("mInput").style.display !== "none";
    if (needs && !v && !modalOptional) { $("mInput").focus(); return; }
    var s = $("mSel").style.display !== "none" ? $("mSel").value : null;
    closeModal(); if (cb) cb(v, s);
  }
  $("mOk").addEventListener("click", submitModal);
  $("mCancel").addEventListener("click", closeModal);
  $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeModal(); });
  document.addEventListener("keydown", function (e) {
    if (!$("modal").classList.contains("show")) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "Enter" && e.target.tagName !== "SELECT") { e.preventDefault(); submitModal(); }
  });
  function confirmBox(title, text, ok, cb) { openModal({ title: title, text: text, input: false, ok: ok }, cb); }

  function openSide() { $("side").classList.add("open"); $("scrim").classList.add("show"); }
  function closeSide() { $("side").classList.remove("open"); $("scrim").classList.remove("show"); }
  $("scrim").addEventListener("click", closeSide);

  /* ================= trip / list actions ================= */
  function msgClear() { var m = $("msg"); if (m) { m.className = "msg"; m.innerHTML = ""; } }
  function go(v) { view = v; flash = null; closeSide(); render(); }
  function appGo(sub) { view = "app"; appView = sub; flash = null; closeSide(); closeAppMenu(); render(); }
  function newList() {
    var t = trip(); if (!t) return;
    openModal({ title: "New checklist 📋", text: "For example: Clothing, Gadgets, Documents", placeholder: "Checklist name", ok: "Add checklist" }, function (name) {
      var l = mkList(name, guess(LIST_EMOJI, name, "📋"), []); t.lists.push(l); S.curList = l.id; t.packedAt = null; view = "app"; msgClear(); touch(); render(); closeSide();
    });
  }
  function renameTrip() { var t = trip(); if (!t) return; openModal({ title: "Rename trip", value: t.name, ok: "Save" }, function (n) { t.name = n; touch(); render(); }); }
  function deleteTrip() {
    var t = trip(); if (!t) return;
    confirmBox("Delete this trip?", "“" + t.name + "” and all its checklists will be removed.", "Delete trip", function () {
      S.trips = S.trips.filter(function (x) { return x.id !== t.id; });
      var n = S.trips[S.trips.length - 1]; S.curTrip = n ? n.id : null; S.curList = n && n.lists[0] ? n.lists[0].id : null; msgClear(); touch(); render();
    });
  }
  function renameList() { var l = list(); if (!l) return; openModal({ title: "Rename checklist", value: l.name, ok: "Save" }, function (n) { l.name = n; l.emoji = guess(LIST_EMOJI, n, l.emoji); touch(); render(); }); }
  function deleteList() {
    var t = trip(), l = list(); if (!t || !l) return;
    confirmBox("Delete this checklist?", "“" + l.name + "” and its items will be removed.", "Delete checklist", function () {
      t.lists = t.lists.filter(function (x) { return x.id !== l.id; }); S.curList = t.lists[0] ? t.lists[0].id : null; msgClear(); touch(); render();
    });
  }
  function selectTrip(tid, lid) { S.curTrip = tid; var t = trip(); S.curList = lid || (t && t.lists[0] ? t.lists[0].id : null); view = "app"; appView = "trip"; msgClear(); touch(); render(); }
  function setState(item, s) { item.state = item.state === s ? "todo" : s; var t = trip(); if (item.state === "todo" && t) t.packedAt = null; msgClear(); touch(); render(); }
  function toggleHidden(o) { if (o.hidden) delete o.hidden; else o.hidden = true; msgClear(); touch(); render(); }
  function removeItem(l, item) { l.items = l.items.filter(function (i) { return i.id !== item.id; }); msgClear(); touch(); render(); }
  function addItem() {
    var inp = $("newItem"), l = list(), name = inp.value.trim();
    if (!name) { inp.focus(); return; }
    l.items.push(mkItem(guess(ITEM_EMOJI, name, "🧳"), name));
    var t = trip(); if (t) t.packedAt = null;
    inp.value = ""; msgClear(); touch(); render(); $("newItem").focus();
  }
  function finish() {
    var t = trip(), m = $("msg"); m.innerHTML = "";
    var total = tripCounts(t);
    if (!total.need && !total.s) { m.className = "msg show bad"; m.textContent = "Nothing on this trip yet. Add items to a checklist first. 📝"; return; }
    var groups = [];
    t.lists.forEach(function (l) { var left = l.items.filter(function (i) { return i.state === "todo"; }); if (left.length) groups.push({ l: l, left: left }); });
    if (groups.length) {
      m.className = "msg show bad";
      var leftN = groups.reduce(function (a, g) { return a + g.left.length; }, 0);
      m.appendChild(el("div", null, "😬 You didn't tick everything! " + leftN + (leftN === 1 ? " item is" : " items are") + " still waiting:"));
      groups.forEach(function (g) {
        var box = el("div", "grp"); box.appendChild(el("div", null, g.l.emoji + " " + g.l.name));
        var ul = el("ul"); g.left.forEach(function (i) { ul.appendChild(el("li", null, i.emoji + " " + i.name)); });
        box.appendChild(ul); m.appendChild(box);
      });
    } else {
      m.className = "msg show good"; m.textContent = "🎉 All packed for " + t.name + "! Have an amazing trip! ✈️🌴";
      t.packedAt = Date.now(); touch(); renderSide();
    }
    var miss = essentialsStatus(t).filter(function (x) { return x.st === "missing"; });
    if (miss.length) m.appendChild(el("div", "grp", "⚠️ Missing essentials (not on your list): " + miss.map(function (x) { return x.e.emoji + " " + x.e.label; }).join(", ")));
    m.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ================= missing essentials ================= */
  function essentialsStatus(t) {
    var items = []; t.lists.forEach(function (l) { if (l.kind !== "leave") items = items.concat(l.items); });
    return ESSENTIALS.map(function (e) {
      var m = items.filter(function (i) { return e.re.test(i.name); });
      var st = !m.length ? "missing" : m.some(function (i) { return i.state !== "todo"; }) ? "ok" : "todo";
      return { e: e, st: st };
    });
  }
  function addEssential(e) {
    var t = trip(); if (!t) return;
    var l = list(); if (!l || l.kind === "leave") l = t.lists.filter(function (x) { return x.kind !== "leave"; })[0];
    if (!l) return;
    l.items.push(mkItem(e.add[0], e.add[1])); t.packedAt = null; msgClear(); touch(); render();
  }
  function buildEssentials(t) {
    var st = essentialsStatus(t), miss = st.filter(function (x) { return x.st === "missing"; }), todo = st.filter(function (x) { return x.st === "todo"; });
    var box = document.createElement("details"); box.className = "ess" + (miss.length ? " warn" : todo.length ? " soon" : ""); box.open = miss.length > 0;
    var sum = document.createElement("summary");
    sum.textContent = miss.length ? "⚠️ Missing essentials: " + miss.map(function (x) { return x.e.emoji + " " + x.e.label; }).join(", ")
      : todo.length ? "🕐 Essentials still to pack: " + todo.map(function (x) { return x.e.emoji + " " + x.e.label; }).join(", ") : "✅ All essentials are packed";
    box.appendChild(sum);
    st.forEach(function (x) {
      var r = el("div", "essrow"); r.appendChild(el("span", null, x.e.emoji + " " + x.e.label));
      if (x.st === "missing") { var b = btn("essadd", "➕ Add to list", function () { addEssential(x.e); }); b.setAttribute("aria-label", "Add " + x.e.label + " to your list"); r.appendChild(b); }
      else r.appendChild(el("span", "essst " + x.st, x.st === "ok" ? "✅ packed" : "🕐 not packed yet"));
      box.appendChild(r);
    });
    return box;
  }

  /* ================= countdown ================= */
  function parseDay(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); if (!m) return null; var d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d.getTime()) ? null : d; }
  function daysUntil(t) { var d = parseDay(t.travelDate); if (!d) return null; var n = new Date(); n = new Date(n.getFullYear(), n.getMonth(), n.getDate()); return Math.round((d - n) / 86400000); }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function setTravelDate() {
    var t = trip(); if (!t) return;
    openModal({ title: "When are you travelling? 📅", text: "We'll count down the days for you.", inputType: "date", value: t.travelDate || "", ok: "Save date" }, function (v) {
      if (!parseDay(v)) return; t.travelDate = v; touch(); render();
    });
  }
  function clearTravelDate() { var t = trip(); if (!t) return; t.travelDate = null; touch(); render(); }
  // Design_1 live countdown for the v2 Trip (interactive: onSet/onClear) and Home card (opts.mini).
  // The 1-second tick stops itself once its grid leaves the DOM (screen change), so it never leaks.
  function v2Countdown(t, opts) {
    opts = opts || {};
    var d = parseDay(t.travelDate);
    var box = el("div", "v2-cd" + (opts.mini ? " mini" : ""));
    if (!d) {
      if (opts.mini) return null;   // Home card shows nothing until a date is set
      var row = el("div", "v2-cd-top");
      row.appendChild(el("span", "v2-cd-date", "No travel date yet"));
      if (opts.onSet) row.appendChild(btn("v2-btn sec", "Set travel date", opts.onSet));
      box.appendChild(row); return box;
    }
    if (!opts.mini) {
      var top = el("div", "v2-cd-top");
      top.appendChild(el("span", "v2-cd-date", "📅 " + d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric" })));
      if (opts.onSet || opts.onClear) {
        var acts = el("div", "acts");
        if (opts.onSet) { var ch = el("button", "v2-iconbtn"); ch.type = "button"; ch.setAttribute("aria-label", "Change travel date"); ch.title = "Change date"; ch.appendChild(gsvg(G.pencil)); ch.addEventListener("click", opts.onSet); acts.appendChild(ch); }
        if (opts.onClear) { var rm = el("button", "v2-iconbtn"); rm.type = "button"; rm.setAttribute("aria-label", "Remove travel date"); rm.title = "Remove date"; rm.appendChild(gsvg(G.skip)); rm.addEventListener("click", opts.onClear); acts.appendChild(rm); }
        top.appendChild(acts);
      }
      box.appendChild(top);
    }
    var grid = el("div", "v2-cd-boxes"); grid.setAttribute("role", "timer"); grid.setAttribute("aria-label", "Time until the trip");
    var vals = {};
    [["d", "Days"], ["h", "Hours"], ["m", "Mins"], ["s", "Secs"]].forEach(function (x) { var c = el("div", "v2-cd-box"); var n = el("b", null, "0"); vals[x[0]] = n; c.appendChild(n); c.appendChild(el("span", null, x[1])); grid.appendChild(c); });
    box.appendChild(grid);
    var note = opts.mini ? null : el("div", "v2-cd-note"); if (note) box.appendChild(note);
    var toGo = opts.counts ? opts.counts.t : 0;
    function stop() { if (box._timer) { clearInterval(box._timer); box._timer = null; } }
    function tick() {
      var ms = d - new Date();
      if (ms > 0) {
        var s = Math.floor(ms / 1000), days = Math.floor(s / 86400);
        vals.d.textContent = days; vals.h.textContent = pad2(Math.floor(s % 86400 / 3600)); vals.m.textContent = pad2(Math.floor(s % 3600 / 60)); vals.s.textContent = pad2(s % 60);
        grid.style.display = "grid";
        if (note) note.textContent = (days <= 3 && toGo > 0) ? "🧳 " + toGo + (toGo === 1 ? " item" : " items") + " still to pack" : (days === 0 ? "Tomorrow's the day! 🌟" : "");
      } else if (ms > -86400000) { grid.style.display = "none"; if (note) note.textContent = "🎉 Today's the day — safe travels! ✈️"; stop(); }
      else { grid.style.display = "none"; if (note) note.textContent = "This trip's date has passed."; stop(); }
    }
    tick();
    box._timer = setInterval(function () { if (!document.body.contains(grid)) { clearInterval(box._timer); box._timer = null; return; } tick(); }, 1000);
    return box;
  }

  /* ================= auth screens ================= */
  // v2 helpers for signed-out / form screens (brand bar, legal footer, password field, label field).
  function baggoMarkImg(size) {
    var img = el("img", "baggo-mark"); img.src = "/baggo-mark.svg?v=1"; img.width = size; img.height = size;
    img.alt = ""; img.setAttribute("aria-hidden", "true"); img.setAttribute("draggable", "false"); return img;
  }
  function brandEl(tagline) {
    var brand = el("div", "v2-brand"); brand.appendChild(baggoMarkImg(26));
    var txt = el("span", "v2-brandtext"); txt.appendChild(el("b", null, "Baggo"));
    if (tagline) txt.appendChild(el("em", "tag", "Ready, together."));
    brand.appendChild(txt); return brand;
  }
  function v2Brandbar(wrap) {
    var top = el("div", "v2-top");
    top.appendChild(brandEl(false)); wrap.appendChild(top); return top;
  }
  function v2Footer(parent) {
    var f = el("div", "v2-footer");
    var p = el("a", null, "Privacy"); p.href = "/privacy"; p.target = "_blank"; p.rel = "noopener";
    var t = el("a", null, "Terms"); t.href = "/terms"; t.target = "_blank"; t.rel = "noopener";
    f.appendChild(p); f.appendChild(t); parent.appendChild(f);
  }
  function v2Field(id, label, type, autocomplete, placeholder) {
    var f = el("label", "v2-field"); f.appendChild(el("span", null, label));
    var input = el("input", "v2-input"); input.id = id; input.type = type || "text"; if (autocomplete) input.autocomplete = autocomplete; if (placeholder) input.placeholder = placeholder; input.setAttribute("aria-label", label);
    f.appendChild(input); return { wrap: f, input: input };
  }
  function v2PwField(id, label, autocomplete) {
    var f = el("label", "v2-field"); f.appendChild(el("span", null, label));
    var row = el("div", "v2-pw");
    var input = el("input", "v2-input"); input.id = id; input.type = "password"; input.autocomplete = autocomplete; input.setAttribute("aria-label", label);
    var peek = el("button", "peek", "Show"); peek.type = "button"; peek.setAttribute("aria-label", "Show " + label.toLowerCase());
    peek.addEventListener("click", function () { var hid = input.type === "password"; input.type = hid ? "text" : "password"; peek.textContent = hid ? "Hide" : "Show"; peek.setAttribute("aria-label", (hid ? "Hide " : "Show ") + label.toLowerCase()); });
    row.appendChild(input); row.appendChild(peek); f.appendChild(row); return { wrap: f, input: input };
  }
  function renderAuth() {
    var wrap = gShell(false); v2Brandbar(wrap);
    var narrow = el("div", "v2-narrow"); wrap.appendChild(narrow);
    var signup = cfg.signupEnabled && authMode === "signup";
    var head = el("div", "v2-authhead");
    var mark = el("div", "mark bare"); mark.appendChild(baggoMarkImg(52)); head.appendChild(mark);
    head.appendChild(el("p", "v2-tagline", "Ready, together."));
    head.appendChild(el("h1", "v2-h1", signup ? "Create your account" : "Welcome back"));
    head.appendChild(el("p", "v2-sub", "Pack together, across your phones and laptops."));
    narrow.appendChild(head);
    var card = el("div", "v2-card"); card.style.cssText = "display:flex;flex-direction:column;gap:14px"; narrow.appendChild(card);
    if (cfg.signupEnabled) {
      var seg = el("div", "v2-seg"); seg.setAttribute("role", "tablist"); seg.setAttribute("aria-label", "Log in or create account");
      [["login", "Log in"], ["signup", "Create account"]].forEach(function (x) {
        var b = el("button", null, x[1]); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", authMode === x[0] ? "true" : "false");
        b.addEventListener("click", function () { authMode = x[0]; expiredMsg = null; renderAuth(); }); seg.appendChild(b);
      });
      card.appendChild(seg);
    } else authMode = "login";
    if (expiredMsg) { var exm = el("p", "v2-alert bad", expiredMsg); exm.setAttribute("role", "alert"); card.appendChild(exm); }
    var err = el("p", "v2-alert bad"); err.id = "aErr"; err.setAttribute("role", "alert"); err.style.display = "none"; card.appendChild(err);
    var form = document.createElement("form"); form.noValidate = true; form.style.cssText = "display:flex;flex-direction:column;gap:12px"; card.appendChild(form);
    var name = v2Field("aName", "Your name", "text", "username"), pw = v2PwField("aPass", "Password", signup ? "new-password" : "current-password");
    form.appendChild(name.wrap); form.appendChild(pw.wrap);
    var code = null; if (signup) { code = v2Field("aCode", "Family code (ask the admin)", "text", "off"); form.appendChild(code.wrap); }
    var go = el("button", "v2-btn full", signup ? "Create my account" : "Log in"); go.type = "submit"; go.id = "aSubmit"; form.appendChild(go);
    if (signup) {
      var agree = el("p", "v2-fine"); agree.appendChild(document.createTextNode("By creating an account you agree to the "));
      var tl = el("a", null, "Terms"); tl.href = "/terms"; tl.target = "_blank"; tl.rel = "noopener"; agree.appendChild(tl);
      agree.appendChild(document.createTextNode(" and "));
      var pl = el("a", null, "Privacy Policy"); pl.href = "/privacy"; pl.target = "_blank"; pl.rel = "noopener"; agree.appendChild(pl);
      agree.appendChild(document.createTextNode(". Baggo is for ages 16 and over."));
      form.appendChild(agree);
    }
    form.addEventListener("submit", function (ev) {
      ev.preventDefault(); err.style.display = "none"; expiredMsg = null;
      var nm = name.input.value.trim(), pass = pw.input.value;
      if (!nm || !pass) { err.textContent = "Please enter your name and password."; err.style.display = "block"; return; }
      go.disabled = true; go.textContent = "Please wait…";
      var body = { username: nm, password: pass }; if (code) body.code = code.input.value.trim();
      api("POST", signup ? "/api/signup" : "/api/login", body).then(function (r) { user = r.user; return afterLogin(); }).catch(function (e) {
        err.textContent = errText(e); err.style.display = "block"; go.disabled = false; go.textContent = signup ? "Create my account" : "Log in";
      });
    });
    card.appendChild(el("p", "v2-fine", signup ? "Your family and the admin can see your lists, except items you mark private." : "Forgot your password? Ask the admin to reset it for you."));
    var links = el("div", "v2-linkrow");
    links.appendChild(btn("v2-link", "Have a sharing code? View a list", askSharedCode));
    links.appendChild(btn("v2-link", "Continue without an account", function () { enterGuest(); }));
    narrow.appendChild(links);
    v2Footer(narrow);
    setTimeout(function () { var f = document.activeElement; if (!f || f === document.body) name.input.focus(); }, 30);
  }
  function renderMustChange() {
    var wrap = gShell(false); v2Brandbar(wrap);
    var narrow = el("div", "v2-narrow"); wrap.appendChild(narrow);
    var head = el("div", "v2-authhead");
    var mark = el("div", "mark"); mark.style.background = "var(--private-bg)"; mark.style.color = "var(--private-fg)"; var sv = gsvg(G.eyeoff, 2); sv.setAttribute("width", 26); sv.setAttribute("height", 26); mark.appendChild(sv); head.appendChild(mark);
    head.appendChild(el("h1", "v2-h1", "Choose a new password"));
    head.appendChild(el("p", "v2-sub", "The admin gave you a temporary password. Pick your own to continue."));
    narrow.appendChild(head);
    var card = el("div", "v2-card"); card.appendChild(passwordForm(true)); narrow.appendChild(card);
  }
  function passwordForm(forced) {
    var form = document.createElement("form"); form.noValidate = true; form.style.cssText = "display:flex;flex-direction:column;gap:12px";
    var msg = el("p", "v2-alert bad"); msg.setAttribute("role", "alert"); msg.style.display = "none";
    var cur = v2PwField("pCur", forced ? "Temporary password" : "Current password", "current-password"), n1 = v2PwField("pNew", "New password (6+ characters)", "new-password"), n2 = v2PwField("pNew2", "New password again", "new-password");
    form.appendChild(msg); form.appendChild(cur.wrap); form.appendChild(n1.wrap); form.appendChild(n2.wrap);
    var go = el("button", "v2-btn full", "Save new password"); go.type = "submit"; form.appendChild(go);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault(); msg.style.display = "none"; msg.className = "v2-alert bad";
      if (n1.input.value !== n2.input.value) { msg.textContent = "The two new passwords don't match."; msg.style.display = "block"; return; }
      go.disabled = true;
      api("POST", "/api/password", { current: cur.input.value, newPassword: n1.input.value }).then(function (r) {
        user = r.user; if (forced) return afterLogin();
        msg.className = "v2-alert good"; msg.textContent = "✓ Password changed. Other devices have been signed out."; msg.style.display = "block"; form.reset(); go.disabled = false;
      }).catch(function (e) { msg.className = "v2-alert bad"; msg.textContent = errText(e); msg.style.display = "block"; go.disabled = false; });
    });
    return form;
  }

  function afterLogin() {
    if (user.mustChange) { view = "mustchange"; render(); return Promise.resolve(); }
    view = "app"; offlineBoot = false; guestMode = false;
    if (window.BaggoDB) BaggoDB.setSession({ key: user.key, username: user.username, role: user.role });
    family = null; unread = 0; groups = null; toasted = {}; setTimeout(pollUnread, 800); setTimeout(loadGroups, 600);
    configureSync();
    // Local-first: show trips cached on this device immediately, then the sync engine reconciles.
    var loadLocal = (window.BaggoDB ? BaggoDB.loadState(user.key) : Promise.resolve(null)).catch(function () { return null; });
    var loadGuest = (window.BaggoDB ? BaggoDB.loadState(GUEST) : Promise.resolve(null)).catch(function () { return null; });
    var loadMeta = (window.BaggoSync ? BaggoSync.loadMeta() : Promise.resolve());
    return Promise.all([loadLocal, loadMeta, loadGuest]).then(function (res) {
      var local = res[0], guest = res[2];
      lastKey = user.key;
      // Build from the account's own stored data (not any carried-over guest state in memory).
      S = (local && local.trips && local.trips.length) ? normalize(local) : emptyState();
      // Move any trips made as a guest into this account, so "sign in" / "connect a family" never
      // loses them. Fields (including private flags, notes, quantities) are carried as-is; the trips
      // are new to the account's sync meta, so the engine pushes them on the flush below.
      var migrated = 0;
      if (guest && guest.trips && guest.trips.length) {
        var have = {}; S.trips.forEach(function (t) { have[t.id] = true; });
        guest.trips.forEach(function (t) { if (!have[t.id]) { S.trips.push(t); migrated++; } });
        if (migrated) { normalize(S); persistLocal(); if (window.BaggoDB) BaggoDB.wipeOwner(GUEST); }
      }
      render();
      return flush().then(function () {
        if (migrated) toast(migrated === 1 ? "Your trip was added to your account." : "Your " + migrated + " trips were added to your account.");
        // A brand-new account with nothing to migrate lands on the empty Home and creates its first
        // trip through the normal New-trip flow — nothing is created silently (generation rule 1).
        joinPending();
      });
    });
  }
  function joinPending() {
    if (!pendingGroup) return; var c = pendingGroup; pendingGroup = null;
    try { history.replaceState(null, "", location.pathname); } catch (e) { }
    api("POST", "/api/groups/join", { code: c }).then(showGroup).catch(function (e) { toast(errText(e)); });
  }
  function logout() {
    var key = user ? user.key : null;
    function finish() {
      closeSide();
      api("POST", "/api/logout", {}).catch(function () { }).then(function () {
        // Sign-out wipes this person's trips from the device (shared-phone privacy; see DECISIONS.md).
        if (window.BaggoSync) BaggoSync.reset();
        if (key && window.BaggoDB) BaggoDB.wipeOwner(key);
        user = null; S = null; dirty = false; rev = 0; view = "app"; appView = "home"; closeAppMenu(); authMode = "login"; adminUsers = null; family = null; unread = 0; groups = null; curGroup = null; shared = null; sharePanel = null; toasted = {}; render();
      });
    }
    // If there are unsynced changes and we can't sync now, warn once before wiping them.
    if (dirty && !navigator.onLine) {
      confirmBox("Sign out anyway?", "You have changes that haven't synced yet. They're saved on this phone, but signing out removes them from this device.", "Sign out anyway", finish);
      return;
    }
    if (dirty) flush();
    finish();
  }

  /* ================= account + admin ================= */
  function renderAccount() {
    var wrap = gShell(false); appHeader(wrap, function () { appGo("home"); });
    wrap.appendChild(el("h1", "v2-h1", "Account"));
    wrap.appendChild(el("p", "v2-sub", "Signed in as " + user.username + (user.role === "admin" ? " · admin" : "")));
    var pwCard = el("div", "v2-card"); pwCard.style.cssText = "display:flex;flex-direction:column;gap:12px";
    pwCard.appendChild(el("h2", "v2-h2", "Change password")); pwCard.appendChild(passwordForm(false)); wrap.appendChild(pwCard);
    var dataCard = el("div", "v2-card"); dataCard.style.cssText = "display:flex;flex-direction:column;gap:12px";
    dataCard.appendChild(el("h2", "v2-h2", "Your data"));
    dataCard.appendChild(el("p", "v2-sub", "Download everything you've created, or permanently delete your account and all of its data."));
    dataCard.appendChild(btn("v2-btn sec full", "Export all my data (JSON)", exportData));
    dataCard.appendChild(btn("v2-btn sec full v2-danger-btn", "Delete my account", deleteAccount));
    wrap.appendChild(dataCard);
    wrap.appendChild(btn("v2-btn sec full", "Log out", logout));
  }
  // Export all of the signed-in person's content as a JSON file (client-side; works offline).
  function exportData() {
    var payload = { app: "Baggo", exportedAt: new Date().toISOString(), account: { username: user.username }, trips: (S && S.trips) || [] };
    try {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url;
      a.download = "baggo-" + String(user.username || "me").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast("Your data was downloaded as JSON.");
    } catch (e) { toast("Couldn't export on this device."); }
  }
  function deleteAccount() {
    confirmBox("Delete your account?", "This permanently deletes your account and all your trips, lists and items. It can't be undone.", "Delete everything", function () {
      api("DELETE", "/api/account").then(function () {
        var key = user ? user.key : null;
        if (window.BaggoSync) BaggoSync.reset();
        if (window.BaggoDB) { if (key) BaggoDB.wipeOwner(key); BaggoDB.clearSession(); }
        user = null; S = null; dirty = false; rev = 0; view = "app"; appView = "home"; closeAppMenu();
        authMode = "login"; family = null; unread = 0; groups = null; curGroup = null; shared = null; sharePanel = null; toasted = {};
        toast("Your account and all its data were deleted.");
        render();
      }).catch(function (e) { toast(errText(e)); });
    });
  }
  function loadAdmin() {
    Promise.all([api("GET", "/api/admin/users"), api("GET", "/api/admin/feed"), api("GET", "/api/admin/overview"), api("GET", "/api/admin/groups")]).then(function (r) {
      adminUsers = r[0].users; adminFeed = r[1].events; adminTrips = r[2].trips; adminGroups = r[3].groups; if (view === "admin") render();
    }).catch(function (e) { if (e.status === 401) sessionExpired(); else { flash = { error: errText(e) }; render(); } });
  }
  function v2Bar(packed, need) {
    var pct = need ? Math.round(packed / need * 100) : 0;
    var pr = el("div", "v2-progress"); pr.setAttribute("role", "progressbar"); pr.setAttribute("aria-valuemin", "0"); pr.setAttribute("aria-valuemax", String(need)); pr.setAttribute("aria-valuenow", String(packed)); pr.setAttribute("aria-label", pct + "% packed");
    var fi = document.createElement("i"); fi.style.width = pct + "%"; pr.appendChild(fi); return pr;
  }
  function renderAdmin() {
    var wrap = gShell(false); appHeader(wrap, function () { appGo("home"); });
    wrap.appendChild(el("h1", "v2-h1", "Admin"));
    wrap.appendChild(el("p", "v2-sub", "Who's going where, who packed what, and everyone's accounts. Private items stay hidden."));
    if (flash) {
      var fb = el("div", "v2-alert " + (flash.error ? "bad" : "good"));
      if (flash.error) fb.textContent = flash.error;
      else { fb.appendChild(el("div", null, flash.title || "Done.")); if (flash.password) fb.appendChild(el("div", "v2-sub", "Temporary password: " + flash.password + " — copy it now, it won't be shown again.")); }
      wrap.appendChild(fb);
    }
    var tabs = el("div", "v2-listtabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Admin sections");
    [["people", "People"], ["trips", "Trips"], ["groups", "Groups"], ["activity", "Activity"]].forEach(function (x) {
      var b = el("button", "v2-tab"); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", adminTab === x[0] ? "true" : "false"); b.appendChild(document.createTextNode(x[1]));
      b.addEventListener("click", function () { adminTab = x[0]; render(); }); tabs.appendChild(b);
    });
    wrap.appendChild(tabs);
    if (!adminUsers) { wrap.appendChild(el("p", "v2-sub", "Loading…")); return; }
    if (adminTab === "activity") {
      if (!adminFeed || !adminFeed.length) { wrap.appendChild(el("p", "v2-sub", "No activity yet.")); return; }
      var fd = el("div", "v2-feed"); adminFeed.forEach(function (ev) { var r = el("div", "v2-feedrow"); r.appendChild(el("span", null, feedLine(ev))); r.appendChild(el("span", "when", ago(ev.t))); fd.appendChild(r); }); wrap.appendChild(fd); return;
    }
    if (adminTab === "groups") {
      if (!adminGroups.length) { wrap.appendChild(el("p", "v2-sub", "No groups yet.")); return; }
      adminGroups.forEach(function (g) {
        var c = el("div", "v2-rowcard"); c.setAttribute("data-group-card", g.name);
        var top = el("div", "top"); top.appendChild(el("b", null, "👥 " + g.name)); top.appendChild(el("span", "v2-by", fmtCode(g.code))); c.appendChild(top);
        c.appendChild(el("div", "v2-stat", "👤 " + (g.members.length ? g.members.join(", ") : "nobody") + " · 📅 " + dayWords(g.travelDate) + " · " + g.packed + "/" + g.need + " packed"));
        c.appendChild(v2Bar(g.packed, g.need)); wrap.appendChild(c);
      });
      return;
    }
    if (adminTab === "trips") {
      if (!adminTrips.length) { wrap.appendChild(el("p", "v2-sub", "No trips yet.")); return; }
      adminTrips.forEach(function (t) {
        var c = el("div", "v2-rowcard"); c.setAttribute("data-trip", t.username + "|" + t.trip);
        var top = el("div", "top"); top.appendChild(el("b", null, "👤 " + t.username)); if (t.packedAt) top.appendChild(el("span", "v2-by", "✅ packed")); c.appendChild(top);
        c.appendChild(el("div", "v2-stat", "✈️ " + t.trip + " · 📅 " + dayWords(t.travelDate) + " · " + t.packed + "/" + t.need + " packed"));
        c.appendChild(v2Bar(t.packed, t.need)); wrap.appendChild(c);
      });
      return;
    }
    // people tab: add a member + the list
    var addCard = el("div", "v2-card"); addCard.style.cssText = "display:flex;flex-direction:column;gap:12px";
    addCard.appendChild(el("h2", "v2-h2", "Add a family member"));
    var form = document.createElement("form"); form.noValidate = true; form.style.cssText = "display:flex;flex-direction:column;gap:12px";
    var n = v2Field("uName", "Name", "text", "off"), p = v2Field("uPass", "Temporary password", "text", "off", "blank = make one for them");
    form.appendChild(n.wrap); form.appendChild(p.wrap);
    var go = el("button", "v2-btn full", "Create account"); go.type = "submit"; form.appendChild(go);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      api("POST", "/api/admin/users", { username: n.input.value.trim(), password: p.input.value || undefined }).then(function (r) {
        flash = { title: "✅ Created " + r.user.username, password: r.password }; loadAdmin(); render();
      }).catch(function (e) { flash = { error: errText(e) }; render(); });
    });
    addCard.appendChild(form); wrap.appendChild(addCard);
    wrap.appendChild(el("h2", "v2-h2", "People (" + adminUsers.length + ")"));
    adminUsers.forEach(function (u) {
      var c = el("div", "v2-rowcard"); c.setAttribute("data-user", u.key);
      var top = el("div", "top"); top.appendChild(el("b", null, u.username));
      if (u.role === "admin") top.appendChild(el("span", "v2-you", "admin"));
      if (u.mustChange) top.appendChild(el("span", "v2-by", "must reset pw")); c.appendChild(top);
      c.appendChild(el("div", "v2-stat", "joined " + fmtDate(u.createdAt) + " · " + u.trips + (u.trips === 1 ? " trip" : " trips") + ", " + u.items + " shared" + (u.privateItems ? " · 🙈 " + u.privateItems + " private" : "") + (u.circle ? " · code " + u.circle : " · no family")));
      var acts = el("div"); acts.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
      acts.appendChild(btn("v2-btn sec", "View lists", function () { viewUser(u); }));
      if (u.role !== "admin") {
        acts.appendChild(btn("v2-btn sec", "Reset password", function () {
          openModal({ title: "Reset password for " + u.username, text: "Leave empty to make a random password.", placeholder: "new password (optional)", ok: "Reset", optional: true }, function (v) { resetPassword(u, v); });
        }));
        acts.appendChild(btn("v2-btn sec v2-danger-btn", "Delete", function () {
          confirmBox("Delete " + u.username + "?", "Their account and all their lists will be removed for good.", "Delete", function () {
            api("DELETE", "/api/admin/users/" + encodeURIComponent(u.key)).then(function () { flash = { title: "🗑️ Deleted " + u.username }; loadAdmin(); }).catch(function (e) { flash = { error: errText(e) }; render(); });
          });
        }));
      }
      c.appendChild(acts); wrap.appendChild(c);
    });
  }
  function resetPassword(u, custom) {
    api("POST", "/api/admin/users/" + encodeURIComponent(u.key) + "/reset", custom ? { password: custom } : {}).then(function (r) {
      flash = { title: "🔑 New password for " + u.username, password: r.password }; loadAdmin(); render();
    }).catch(function (e) { flash = { error: errText(e) }; render(); });
  }
  function viewUser(u) {
    api("GET", "/api/admin/users/" + encodeURIComponent(u.key) + "/data").then(function (r) { adminDetail = r; view = "adminuser"; render(); }).catch(function (e) { flash = { error: errText(e) }; render(); });
  }
  // Read-only view of someone's lists (admin → a user). Reuses the v2 read-only item rows.
  function renderReadOnly(o) {
    var wrap = gShell(false);
    var top = v2Brandbar(wrap); top.insertBefore(btnIcon(G.back, "Back", o.onBack), top.firstChild);
    wrap.appendChild(el("h1", "v2-h1", o.username + (o.you ? " (you)" : "") + "’s lists"));
    wrap.appendChild(el("p", "v2-sub", "Read-only · last saved " + fmtDateTime(o.updatedAt) + "." + (o.privateItems ? " " + o.privateItems + " private item" + (o.privateItems === 1 ? "" : "s") + " hidden." : "")));
    var trips = (o.data && o.data.trips) || [];
    if (!trips.length) { wrap.appendChild(el("p", "v2-sub", "Nothing shared yet.")); return; }
    trips.forEach(function (t) {
      var card = el("div", "v2-card"); card.style.cssText = "display:flex;flex-direction:column;gap:10px";
      var hh = el("div"); hh.style.cssText = "display:flex;align-items:baseline;justify-content:space-between;gap:10px";
      var left = el("div"); left.appendChild(el("div", "v2-h2", "✈️ " + t.name)); if (t.travelDate) left.appendChild(el("div", "v2-meta", "📅 " + dayWords(t.travelDate))); hh.appendChild(left);
      var pk = 0, nn = 0; (t.lists || []).forEach(function (l) { (l.items || []).forEach(function (i) { if (i.state === "packed") { pk++; nn++; } else if (i.state !== "skip") nn++; }); });
      hh.appendChild(el("span", "v2-pct", nn ? Math.round(pk / nn * 100) + "% packed" : "—")); card.appendChild(hh);
      (t.lists || []).forEach(function (l) {
        card.appendChild(el("div", "v2-kicker", (l.emoji ? l.emoji + " " : "") + l.name));
        var box = el("div", "v2-ro");
        if (!l.items || !l.items.length) { var e = el("div", "v2-roitem"); e.appendChild(el("span", "st")); e.appendChild(el("span", "nm", "Nothing here")); box.appendChild(e); }
        else l.items.forEach(function (i) { box.appendChild(roItem(i)); });
        card.appendChild(box);
      });
      wrap.appendChild(card);
    });
  }
  function renderAdminUser() {
    renderReadOnly({ onBack: function () { view = "admin"; adminDetail = null; render(); }, username: adminDetail.username, data: adminDetail.data, updatedAt: adminDetail.updatedAt, privateItems: adminDetail.privateItems });
  }

  /* ================= family ================= */
  function loadFamily() {
    return api("GET", "/api/family").then(function (r) {
      family = r; unread = 0; if (view === "family") render(); else renderSide();
      if (r.circle) api("POST", "/api/family/seen", {}).catch(function () { });
    }).catch(function (e) { if (e.status === 401) sessionExpired(); });
  }
  function leaveFamily() {
    confirmBox("Leave this family?", "You'll stop seeing each other's lists and activity. You can join again with the code.", "Leave", function () {
      api("POST", "/api/family/leave", {}).then(function (r) { family = r; render(); }).catch(function (e) { flash = { error: errText(e) }; render(); });
    });
  }
  function viewMember(m) {
    api("GET", "/api/family/" + encodeURIComponent(m.key)).then(function (r) { member = r; view = "member"; render(); }).catch(function (e) { flash = { error: errText(e) }; render(); });
  }
  /* ---- v2 Together / Member (signed-in). The v1 sidebar is hidden by gShell; a
     Back control returns to the trips app (Together) or to Together (Member). ---- */
  var famErr = null, famReconnect = false;
  var AVCOLORS = ["#0E7C66", "#B45309", "#6D28D9", "#D83A4E", "#1361D1"];
  function initials(name) {
    var s = String(name || "").trim(); if (!s) return "?";
    var parts = s.split(/\s+/);
    return (parts[0].charAt(0) + (parts[1] ? parts[1].charAt(0) : "")).toUpperCase();
  }
  function avatarColor(name) {
    var s = String(name || ""), h = 0, i;
    for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVCOLORS[h % AVCOLORS.length];
  }
  // Member-card headline: progress across the trips they share. "% packed" is literal
  // progress (packed of packed+to-go), not a readiness score — skipped items don't count.
  function famAgg(m) {
    var p = 0, n = 0; (m.trips || []).forEach(function (t) { p += t.packed || 0; n += t.need || 0; });
    return { p: p, n: n, pct: n ? Math.round(p / n * 100) : 0 };
  }
  function famConnect(code) {
    code = String(code || "").trim();
    if (!code) { famErr = "Enter your family's code."; return render(); }
    api("POST", "/api/family/join", { code: code }).then(function (r) {
      family = r; unread = 0; famErr = null; famReconnect = false; render();
    }).catch(function (e) { famErr = errText(e); render(); });
  }
  function renderFamily(main) {
    var wrap = gShell(false);
    var top = gBrand(wrap, false);
    top.insertBefore(btnIcon(G.back, "Back to home", function () { famErr = null; famReconnect = false; appGo("home"); }), top.firstChild);
    wrap.appendChild(el("h1", "v2-h1", "Together"));
    if (!family) { wrap.appendChild(el("p", "v2-sub", "Loading…")); return; }
    if (!family.circle || famReconnect) {
      var c = el("div", "v2-card"); c.style.cssText = "display:flex;flex-direction:column;gap:12px";
      c.appendChild(el("h2", "v2-h2", "Connect with your family"));
      c.appendChild(el("p", "v2-sub", "Everyone who enters the same family code is connected: you'll see who's going where and what they've packed, and they'll see you. Your private items, lists and trips stay private."));
      var f = el("label", "v2-field"); f.appendChild(el("span", null, "Family code"));
      var inp = el("input", "v2-input"); inp.setAttribute("aria-label", "Family code"); inp.placeholder = "family code"; inp.autocomplete = "off"; if (famErr) inp.setAttribute("aria-invalid", "true");
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); famConnect(inp.value); } });
      f.appendChild(inp); c.appendChild(f);
      if (famErr) { var er = el("p", "v2-err", famErr); er.setAttribute("role", "alert"); c.appendChild(er); }
      c.appendChild(btn("v2-btn full", "Connect", function () { famConnect(inp.value); }));
      if (family.circle) c.appendChild(btn("v2-btn sec full", "Cancel", function () { famErr = null; famReconnect = false; render(); }));
      wrap.appendChild(c); return;
    }
    var n = family.circle.members;
    wrap.appendChild(el("p", "v2-sub", n + (n === 1 ? " person is" : " people are") + " connected. Tap a name to see what they chose and packed."));
    if (family.unread) wrap.appendChild(el("p", "v2-meta", "🔔 " + family.unread + " new since you last looked"));
    var people = el("div"); people.style.cssText = "display:flex;flex-direction:column;gap:10px";
    family.members.forEach(function (m) {
      var ag = famAgg(m);
      var row = el("button", "v2-member"); row.type = "button"; row.setAttribute("data-member", m.key);
      row.setAttribute("aria-label", "See " + (m.you ? "your shared lists" : m.username + "'s lists"));
      var av = el("div", "v2-avatar", initials(m.username)); av.style.background = avatarColor(m.username); av.setAttribute("aria-hidden", "true");
      row.appendChild(av);
      var info = el("div", "mi");
      var nm = el("b"); nm.appendChild(document.createTextNode(m.username)); if (m.you) nm.appendChild(el("span", "v2-you", "you")); info.appendChild(nm);
      var sub = m.trips && m.trips.length ? (m.trips.length + (m.trips.length === 1 ? " trip" : " trips") + " · " + (m.lastSaved ? ago(m.lastSaved) : "no activity yet")) : "No trips shared yet";
      info.appendChild(el("small", null, sub));
      row.appendChild(info);
      row.appendChild(el("span", "v2-pct", ag.n ? ag.pct + "% packed" : "—"));
      row.addEventListener("click", function () { viewMember(m); });
      people.appendChild(row);
    });
    wrap.appendChild(people);
    wrap.appendChild(el("h2", "v2-h2", "Recent activity"));
    if (!family.feed || !family.feed.length) wrap.appendChild(el("p", "v2-sub", "Nothing yet. When someone packs or adds something, it shows up here."));
    else {
      var fd = el("div", "v2-feed");
      family.feed.forEach(function (ev) { var r = el("div", "v2-feedrow"); r.appendChild(el("span", null, feedLine(ev))); r.appendChild(el("span", "when", ago(ev.t))); fd.appendChild(r); });
      wrap.appendChild(fd);
    }
    var tools = el("div"); tools.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:4px";
    tools.appendChild(btn("v2-btn sec", "Use a different code", function () { famErr = null; famReconnect = true; render(); }));
    tools.appendChild(btn("v2-btn sec", "Leave family", leaveFamily));
    wrap.appendChild(tools);
  }
  function roDot() {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg");
    s.setAttribute("width", 16); s.setAttribute("height", 16); s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", 2); s.setAttribute("aria-hidden", "true");
    var c = document.createElementNS(ns, "circle"); c.setAttribute("cx", 12); c.setAttribute("cy", 12); c.setAttribute("r", 8); s.appendChild(c); return s;
  }
  function roItem(i) {
    var st = i.state === "packed" ? "packed" : i.state === "skip" ? "skip" : "todo";
    var row = el("div", "v2-roitem" + (st === "packed" ? " packed" : st === "skip" ? " skip" : ""));
    var mark = el("span", "st");
    if (st === "packed") mark.appendChild(gsvg(G.tick));
    else if (st === "skip") mark.appendChild(gsvg(G.skip));
    else mark.appendChild(roDot());
    row.appendChild(mark);
    row.appendChild(el("span", "nm", (i.emoji ? i.emoji + " " : "") + i.name));
    return row;
  }
  function renderMember(main) {
    var wrap = gShell(false);
    var top = gBrand(wrap, false);
    top.insertBefore(btnIcon(G.back, "Back to Together", function () { view = "family"; member = null; render(); loadFamily(); }), top.firstChild);
    wrap.appendChild(el("h1", "v2-h1", member.you ? "Your shared lists" : member.username + "’s lists"));
    wrap.appendChild(el("p", "v2-sub", "View only" + (member.updatedAt ? " · updated " + fmtDateTime(member.updatedAt) : "") + ". Private items stay hidden."));
    var trips = (member.data && member.data.trips) || [];
    if (!trips.length) { wrap.appendChild(el("p", "v2-sub", (member.you ? "You haven’t" : "They haven’t") + " shared any trips yet.")); return; }
    trips.forEach(function (t) {
      var card = el("div", "v2-card"); card.style.cssText = "display:flex;flex-direction:column;gap:10px";
      var h = el("div"); h.style.cssText = "display:flex;align-items:baseline;justify-content:space-between;gap:10px";
      var left = el("div"); left.appendChild(el("div", "v2-h2", "✈️ " + t.name));
      if (t.travelDate) left.appendChild(el("div", "v2-meta", "📅 " + dayWords(t.travelDate)));
      h.appendChild(left);
      var p = 0, n = 0; (t.lists || []).forEach(function (l) { (l.items || []).forEach(function (i) { if (i.state === "packed") { p++; n++; } else if (i.state !== "skip") n++; }); });
      h.appendChild(el("span", "v2-pct", n ? Math.round(p / n * 100) + "% packed" : "—"));
      card.appendChild(h);
      (t.lists || []).forEach(function (l) {
        card.appendChild(el("div", "v2-kicker", (l.emoji ? l.emoji + " " : "") + l.name));
        var box = el("div", "v2-ro");
        if (!l.items || !l.items.length) { var e = el("div", "v2-roitem"); e.appendChild(el("span", "st")); e.appendChild(el("span", "nm", "Nothing shared here")); box.appendChild(e); }
        else l.items.forEach(function (i) { box.appendChild(roItem(i)); });
        card.appendChild(box);
      });
      wrap.appendChild(card);
    });
  }
  function pollUnread() {
    if (!user || document.hidden) return;
    if (view === "family") { loadFamily(); return; }
    api("GET", "/api/family/unread").then(function (r) { if (r.unread !== unread) { unread = r.unread; renderSide(); } }).catch(function () { });
  }
  setInterval(pollUnread, 20000);


  /* ================= toast + notifications ================= */
  function toast(text) {
    var t = $("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.textContent = text; t.className = "toast show";
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = "toast"; }, 5500);
  }
  function browserNotify(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
    try { new Notification(title, { body: body, icon: "/icons/icon-192.png" }); } catch (e) { }
  }
  function enableAlerts() {
    if (!("Notification" in window)) { toast("This browser can't show alerts."); return; }
    Notification.requestPermission().then(function (p) { toast(p === "granted" ? "🔔 Alerts are on while the app is open." : "Alerts are off."); render(); });
  }
  function copyText(txt) { try { navigator.clipboard.writeText(txt); toast("Copied ✓"); } catch (e) { toast("Press and hold the text to copy it."); } }
  function fmtCode(c) { return c ? c.slice(0, 4) + "-" + c.slice(4) : ""; }

  /* ================= sharing code (view only) ================= */
  var sharePanel = null, shared = null;
  function toggleSharePanel(t) {
    if (sharePanel && sharePanel.tripId === t.id) { sharePanel = null; render(); return; }
    sharePanel = { tripId: t.id, code: undefined, error: null }; render();
    flush().then(function () { return api("GET", "/api/share/" + t.id); }).then(function (r) { if (sharePanel && sharePanel.tripId === t.id) { sharePanel.code = r.code; render(); } })
      .catch(function (e) { if (sharePanel) { sharePanel.code = null; sharePanel.error = errText(e); render(); } });
  }
  function makeShare(t, tries) {
    flush().then(function () { return api("POST", "/api/share/" + t.id); }).then(function (r) { sharePanel.code = r.code; sharePanel.error = null; render(); })
      .catch(function (e) { if (e.status === 404 && (tries || 0) < 3) setTimeout(function () { makeShare(t, (tries || 0) + 1); }, 900); else { sharePanel.error = errText(e); render(); } });
  }
  function stopShare(t) { api("DELETE", "/api/share/" + t.id).then(function () { sharePanel.code = null; render(); }).catch(function (e) { sharePanel.error = errText(e); render(); }); }
  function buildSharePanel(t) {
    var box = el("div", "flash share"); box.setAttribute("role", "status");
    box.appendChild(el("div", null, "🔗 Share “" + t.name + "” (view only)"));
    if (sharePanel.error) box.appendChild(el("div", "err", sharePanel.error));
    if (sharePanel.code === undefined) { box.appendChild(el("div", null, "Loading…")); return box; }
    if (t.hidden) { box.appendChild(el("div", null, "This trip is private (🙈). Tap the 👁️ at the top to share it first.")); return box; }
    if (!sharePanel.code) {
      box.appendChild(el("p", "fine", "Make a sharing code so friends and family can look at this list. They can't edit or delete anything, and your 🙈 private items and your “Before you leave” reminders stay hidden."));
      box.appendChild(btn("btn", "Create sharing code", function () { makeShare(t); }));
      return box;
    }
    var c = el("code", "bigcode", fmtCode(sharePanel.code)); c.id = "shareCode"; box.appendChild(c);
    var link = location.origin + "/?code=" + sharePanel.code;
    var row = el("div", "uacts"); row.style.marginTop = "8px";
    row.appendChild(btn("", "Copy code", function () { copyText(fmtCode(sharePanel.code)); })); row.appendChild(btn("", "Copy link", function () { copyText(link); }));
    row.appendChild(btn("", "🔄 New code", function () { makeShare(t); })); row.appendChild(btn("danger", "⛔ Stop sharing", function () { stopShare(t); }));
    box.appendChild(row);
    box.appendChild(el("p", "fine", "Anyone with this code can view the list. Making a new code stops the old one."));
    return box;
  }
  function askSharedCode() {
    closeSide();
    openModal({ title: "Open a shared list 🔗", text: "Type the sharing code a friend gave you. You can look at the list, but not change it.", placeholder: "ABCD-2345", ok: "Open" }, function (code) { openShared(code); });
  }
  function openShared(code) {
    return api("GET", "/api/shared/" + encodeURIComponent(String(code).replace(/[^A-Za-z0-9]/g, ""))).then(function (r) {
      shared = { code: code, ownerName: r.ownerName, trip: r.trip, updatedAt: r.updatedAt }; if (user) view = "shared"; render();
      try { history.replaceState(null, "", location.pathname); } catch (e) { }
    }).catch(function (e) { if (user) { flash = { error: errText(e) }; view = "app"; toast(errText(e)); render(); } else { expiredMsg = errText(e); render(); } });
  }
  setInterval(function () {
    if (!shared || document.hidden || !(view === "shared" || !user)) return;
    api("GET", "/api/shared/" + encodeURIComponent(String(shared.code).replace(/[^A-Za-z0-9]/g, ""))).then(function (r) { if (!shared) return; shared.trip = r.trip; shared.updatedAt = r.updatedAt; shared.ownerName = r.ownerName; render(); }).catch(function () { });
  }, 15000);
  function renderShared() {
    var wrap = gShell(false);
    var top = v2Brandbar(wrap);
    top.insertBefore(btnIcon(G.back, user ? "Back to my trips" : "Back", function () { shared = null; view = "app"; if (user) appView = "home"; render(); }), top.firstChild);
    var t = shared.trip;
    wrap.appendChild(el("h1", "v2-h1", "👀 " + shared.ownerName + "'s " + t.name));
    wrap.appendChild(el("p", "v2-sub", "View only · updated " + fmtDateTime(shared.updatedAt) + ". You can look, but you can't change anything."));
    var card = el("div", "v2-card"); card.style.cssText = "display:flex;flex-direction:column;gap:10px";
    var h = el("div"); h.style.cssText = "display:flex;align-items:baseline;justify-content:space-between;gap:10px";
    var left = el("div"); left.appendChild(el("div", "v2-h2", "✈️ " + t.name));
    if (t.travelDate) left.appendChild(el("div", "v2-meta", "📅 " + dayWords(t.travelDate)));
    h.appendChild(left);
    var p = 0, n = 0; (t.lists || []).forEach(function (l) { (l.items || []).forEach(function (i) { if (i.state === "packed") { p++; n++; } else if (i.state !== "skip") n++; }); });
    h.appendChild(el("span", "v2-pct", n ? Math.round(p / n * 100) + "% packed" : "—")); card.appendChild(h);
    (t.lists || []).forEach(function (l) {
      card.appendChild(el("div", "v2-kicker", (l.emoji ? l.emoji + " " : "") + l.name));
      var box = el("div", "v2-ro");
      if (!l.items || !l.items.length) { var e = el("div", "v2-roitem"); e.appendChild(el("span", "st")); e.appendChild(el("span", "nm", "Nothing here")); box.appendChild(e); }
      else l.items.forEach(function (i) { box.appendChild(roItem(i)); });
      card.appendChild(box);
    });
    wrap.appendChild(card);
    if (!user) {
      var links = el("div", "v2-linkrow");
      links.appendChild(btn("v2-btn full", "Create your own Baggo account", function () { shared = null; authMode = "signup"; render(); }));
      wrap.appendChild(links); v2Footer(wrap);
    }
  }
  function renderSharedGuest() { renderShared(); }

  /* ================= group travel checklists ================= */
  var pendingGroup = null, groups = null, curGroup = null, groupListId = null, toasted = {}, groupTick = 0;
  function groupLine(e) {
    var n = e.n, ic = { pack: "✅", skip: "🚫", add: "➕", remove: "➖", unpack: "↩️" }[e.k], verb = { pack: "packed", skip: "skipped", add: "added", remove: "removed", unpack: "un-packed" }[e.k];
    switch (e.k) {
      case "created": return "🎉 " + n + " created the group";
      case "join": return "👋 " + n + " joined the group";
      case "leave": return "🚪 " + n + " left the group";
      case "list": return "📋 " + n + " added the checklist “" + e.list + "”";
      case "removelist": return "🗑️ " + n + " removed the checklist “" + e.list + "”";
      case "date": return "📅 " + n + (e.date ? " set the travel date to " + e.date : " cleared the travel date");
      case "rename": return "✏️ " + n + " renamed the group to “" + e.name + "”";
      default: return ic + " " + n + " " + verb + " " + e.emoji + " " + e.item + (e.list ? " · " + e.list : "");
    }
  }
  function updateBell() {
    var b = $("bell"); if (!b) return; var n = groups ? groups.unread : 0;
    b.textContent = "🔔 " + n; b.hidden = !n; b.setAttribute("aria-label", n + " new change" + (n === 1 ? "" : "s") + " in your groups");
  }
  function notifyGroups(r, first) {
    var key = function (g, e) { return g.id + ":" + e.t + ":" + e.u + ":" + e.k; };
    if (first) { if (r.unread > 0) toast("🔔 " + r.unread + " new change" + (r.unread === 1 ? "" : "s") + " in your groups"); r.groups.forEach(function (g) { g.latest.forEach(function (e) { toasted[key(g, e)] = 1; }); }); return; }
    r.groups.forEach(function (g) {
      g.latest.slice().reverse().forEach(function (e) {
        var k = key(g, e); if (toasted[k]) return; toasted[k] = 1;
        toast("🔔 " + groupLine(e) + "  ·  " + g.name); browserNotify(g.name, groupLine(e));
      });
    });
  }
  function loadGroups() {
    return api("GET", "/api/groups").then(function (r) { var first = !groups; groups = r; notifyGroups(r, first); renderSide(); updateBell(); }).catch(function (e) { if (e.status === 401) sessionExpired(); });
  }
  function openBell() {
    if (!groups || !groups.groups.length) return loadGroups();
    var best = groups.groups.slice().sort(function (a, b) { return b.unread - a.unread; })[0]; openGroup(best.id);
  }
  function showGroup(r) {
    var last = 0; r.feed.forEach(function (e) { last = Math.max(last, e.t); });
    r._lastT = last; curGroup = r; view = "group"; closeSide();
    if (!r.lists.some(function (l) { return l.id === groupListId; })) groupListId = r.lists[0] ? r.lists[0].id : null;
    render(); api("POST", "/api/groups/" + r.group.id + "/seen", {}).then(loadGroups).catch(function () { });
  }
  function openGroup(id) { api("GET", "/api/groups/" + id).then(showGroup).catch(function (e) { toast(errText(e)); }); }
  function newGroup() {
    closeSide();
    openModal({ title: "Create a group checklist 👥", text: "Give it a name, like “Family trip crew”. You'll get a code to share, so everyone can pack together.", placeholder: "Group name", ok: "Create group" }, function (name) {
      api("POST", "/api/groups", { name: name }).then(showGroup).catch(function (e) { toast(errText(e)); });
    });
  }
  function joinGroup() {
    closeSide();
    openModal({ title: "Join a group with a code 🔑", text: "Type the group code someone shared with you.", placeholder: "ABCD-2345", ok: "Join" }, function (code) {
      api("POST", "/api/groups/join", { code: code }).then(showGroup).catch(function (e) { toast(errText(e)); });
    });
  }
  function groupOp(body) {
    var id = curGroup.group.id;
    return api("POST", "/api/groups/" + id + "/op", body).then(function (r) {
      if (!curGroup || curGroup.group.id !== id) return;
      var last = curGroup._lastT; r.feed.forEach(function (e) { last = Math.max(last, e.t); }); r._lastT = last; curGroup = r; render();
    }).catch(function (e) { toast(errText(e)); });
  }
  function leaveGroup() {
    confirmBox("Leave this group?", "You'll stop seeing it. You can join again with the code.", "Leave", function () {
      var id = curGroup.group.id;
      api("POST", "/api/groups/" + id + "/leave", {}).then(function () { curGroup = null; view = "app"; loadGroups(); render(); }).catch(function (e) { toast(errText(e)); });
    });
  }
  function refreshGroup() {
    if (!curGroup || document.hidden) return;
    var id = curGroup.group.id;
    api("GET", "/api/groups/" + id).then(function (r) {
      if (view !== "group" || !curGroup || curGroup.group.id !== id) return;
      var changed = JSON.stringify([r.lists, r.members, r.group]) !== JSON.stringify([curGroup.lists, curGroup.members, curGroup.group]);
      var fresh = r.feed.filter(function (e) { return e.u !== r.you && e.t > curGroup._lastT; }).reverse();
      fresh.slice(-3).forEach(function (e) { toast("🔔 " + groupLine(e)); });
      var last = curGroup._lastT; r.feed.forEach(function (e) { last = Math.max(last, e.t); }); r._lastT = last; curGroup = r;
      var a = document.activeElement; var typing = a && a.id === "gNewItem" && a.value;
      if ((changed || fresh.length) && !typing && !$("modal").classList.contains("show")) render();
      if (fresh.length) api("POST", "/api/groups/" + id + "/seen", {}).catch(function () { });
    }).catch(function (e) { if (e.status === 401) sessionExpired(); else if (e.status === 403 || e.status === 404) { curGroup = null; view = "app"; loadGroups(); render(); } });
  }
  setInterval(function () {
    if (!user) return; groupTick++;
    if (view === "group" && curGroup) refreshGroup(); else if (groupTick % 3 === 0) loadGroups();
  }, 6000);

  function groupCounts(G) { var p = 0, t = 0, s = 0; G.lists.forEach(function (l) { var c = counts(l.items); p += c.p; t += c.t; s += c.s; }); return { p: p, t: t, s: s, need: p + t }; }
  function groupItemV2(grp, it) {
    var li = el("li", "v2-item" + (it.state === "packed" ? " done" : it.state === "skip" ? " skip" : ""));
    var chk = el("button", "v2-check"); chk.type = "button"; chk.setAttribute("role", "checkbox"); chk.setAttribute("aria-checked", it.state === "packed" ? "true" : "false"); chk.setAttribute("aria-label", (it.state === "packed" ? "Packed: " : "Pack: ") + it.name);
    var bx = el("span", "box"); if (it.state === "packed") bx.appendChild(gsvg(G.tick, 3)); chk.appendChild(bx);
    chk.addEventListener("click", function () { groupOp({ op: "setState", itemId: it.id, state: it.state === "packed" ? "todo" : "packed" }); });
    var lab = el("button", "label"); lab.type = "button"; lab.setAttribute("aria-label", it.name);
    if (it.emoji) lab.appendChild(el("span", "emoji", it.emoji));
    lab.appendChild(el("span", "nm", it.name));
    if (it.by) { var meName = (grp.members.filter(function (m) { return m.key === grp.you; })[0] || {}).name; lab.appendChild(el("span", "v2-by", (it.state === "skip" ? "✕ " : "✓ ") + (it.by === meName ? "you" : it.by))); }
    lab.addEventListener("click", function () { groupOp({ op: "setState", itemId: it.id, state: it.state === "packed" ? "todo" : "packed" }); });
    var skip = el("button", "v2-skip"); skip.type = "button"; skip.setAttribute("aria-pressed", it.state === "skip" ? "true" : "false"); skip.setAttribute("aria-label", "Not needed: " + it.name); skip.title = "Not needed"; skip.appendChild(gsvg(G.skip)); skip.addEventListener("click", function () { groupOp({ op: "setState", itemId: it.id, state: it.state === "skip" ? "todo" : "skip" }); });
    var rm = el("button", "v2-rowbtn danger"); rm.type = "button"; rm.setAttribute("aria-label", "Remove: " + it.name); rm.title = "Remove"; rm.appendChild(gsvg("M5 12h14")); rm.addEventListener("click", function () { groupOp({ op: "removeItem", itemId: it.id }); });
    li.appendChild(chk); li.appendChild(lab); li.appendChild(skip); li.appendChild(rm); return li;
  }
  function renderGroup() {
    var grp = curGroup, g = grp.group;
    var l = grp.lists.filter(function (x) { return x.id === groupListId; })[0] || grp.lists[0];
    var wrap = gShell(false); appHeader(wrap, function () { view = "app"; appView = "home"; curGroup = null; render(); });
    // title + rename
    var h = el("div"); h.style.cssText = "display:flex;align-items:flex-start;gap:8px";
    var tt = el("h1", "v2-h1"); tt.style.cssText = "flex:1;min-width:0;overflow-wrap:anywhere"; tt.appendChild(document.createTextNode("👥 " + g.name)); h.appendChild(tt);
    var ic = el("div", "v2-iconrow"); ic.style.flex = "none";
    var re = el("button", "v2-iconbtn"); re.type = "button"; re.setAttribute("aria-label", "Rename group"); re.title = "Rename group"; re.appendChild(gsvg(G.pencil)); re.addEventListener("click", function () { openModal({ title: "Rename group", value: g.name, ok: "Save" }, function (n) { groupOp({ op: "rename", name: n }); }); }); ic.appendChild(re);
    h.appendChild(ic); wrap.appendChild(h);
    wrap.appendChild(el("p", "v2-sub", "With " + grp.members.map(function (m) { return m.key === grp.you ? "you" : m.name; }).join(", ")));
    // share code
    var cb = el("div", "v2-share"); cb.appendChild(el("div", "v2-h2", "🔑 Group code"));
    cb.appendChild(el("p", "v2-sub", "Share it so others can join and pack together."));
    cb.appendChild(el("div", "code", fmtCode(g.code)));
    var cr = el("div", "row"); cr.appendChild(btn("v2-btn sec", "Copy code", function () { copyText(fmtCode(g.code)); })); cr.appendChild(btn("v2-btn sec", "Copy link", function () { copyText(location.origin + "/?group=" + g.code); })); cb.appendChild(cr); wrap.appendChild(cb);
    var gc = groupCounts(grp);
    wrap.appendChild(v2Countdown({ travelDate: g.travelDate }, {
      counts: { t: gc.t },
      onSet: function () { openModal({ title: "When is the group travelling? 📅", inputType: "date", value: g.travelDate || "", ok: "Save date" }, function (v) { if (parseDay(v)) groupOp({ op: "setDate", date: v }); }); },
      onClear: function () { groupOp({ op: "setDate", date: null }); },
    }));
    var prow = el("div"); prow.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;gap:10px";
    prow.appendChild(el("span", "v2-sub", gc.p + " of " + gc.need + " packed together"));
    prow.appendChild(el("span", "v2-pct", (gc.need ? Math.round(gc.p / gc.need * 100) : 0) + "% packed")); wrap.appendChild(prow);
    wrap.appendChild(v2Bar(gc.p, gc.need));
    // list tabs
    var tabs = el("div", "v2-listtabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Group checklists");
    grp.lists.forEach(function (x) { var c = counts(x.items); var b = el("button", "v2-tab"); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", x.id === l.id ? "true" : "false"); b.appendChild(document.createTextNode((x.emoji ? x.emoji + " " : "") + x.name)); b.appendChild(el("span", "c", c.p + "/" + c.need)); b.addEventListener("click", function () { groupListId = x.id; render(); }); tabs.appendChild(b); });
    var addTab = el("button", "v2-tab"); addTab.type = "button"; addTab.appendChild(gsvg(G.plus)); addTab.appendChild(document.createTextNode(" Checklist")); addTab.addEventListener("click", function () { openModal({ title: "New group checklist 📋", placeholder: "Checklist name", ok: "Add" }, function (n) { groupOp({ op: "addList", name: n, emoji: guess(LIST_EMOJI, n, "📋") }); }); }); tabs.appendChild(addTab);
    wrap.appendChild(tabs);
    if (grp.lists.length > 1) { var tools = el("div"); tools.style.cssText = "display:flex;flex-wrap:wrap;gap:8px"; tools.appendChild(btn("v2-btn sec v2-danger-btn", "Delete this list", function () { confirmBox("Delete “" + l.name + "”?", "Its items are removed for everyone in the group.", "Delete", function () { groupOp({ op: "removeList", listId: l.id }); }); })); wrap.appendChild(tools); }
    // items
    var ul = el("ul", "v2-rows"); ul.setAttribute("aria-label", l.name);
    if (!l.items.length) { var li0 = el("li"); li0.style.cssText = "background:var(--bg);padding:14px 16px;color:var(--slate);font-size:14px"; li0.textContent = "Nothing in " + l.name + " yet — anyone in the group can add items."; ul.appendChild(li0); }
    l.items.forEach(function (it) { ul.appendChild(groupItemV2(grp, it)); });
    wrap.appendChild(ul);
    // quick add
    var form = document.createElement("form"); form.className = "v2-add";
    var inp = el("input", "v2-input"); inp.id = "gNewItem"; inp.maxLength = 80; inp.autocomplete = "off"; inp.placeholder = "Add to " + l.name + " (everyone sees it)…"; inp.setAttribute("aria-label", "New group item");
    form.appendChild(inp); var addb = el("button", "v2-btn", "Add"); addb.type = "submit"; form.appendChild(addb);
    form.addEventListener("submit", function (ev) { ev.preventDefault(); var v = inp.value.trim(); if (!v) { inp.focus(); return; } inp.value = ""; groupOp({ op: "addItem", listId: l.id, name: v, emoji: guess(ITEM_EMOJI, v, "🧳") }).then(function () { var nf = $("gNewItem"); if (nf) nf.focus(); }); });
    wrap.appendChild(form);
    // finish
    wrap.appendChild(btn("v2-btn full", "🧳 Everything packed!", function () {
      var m = $("msg"); if (!m) return; m.className = ""; m.innerHTML = "";
      var left = []; grp.lists.forEach(function (x) { x.items.forEach(function (i) { if (i.state === "todo") left.push(x.emoji + " " + i.emoji + " " + i.name); }); });
      if (!gc.need && !gc.s) { m.className = "v2-finish bad"; m.textContent = "Nothing in this group yet. Add some items first. 📝"; return; }
      if (left.length) { m.className = "v2-finish bad"; m.appendChild(el("div", null, "😬 Not done yet — " + left.length + (left.length === 1 ? " item is" : " items are") + " still waiting:")); var u = el("ul"); left.forEach(function (t) { u.appendChild(el("li", null, t)); }); m.appendChild(u); }
      else { m.className = "v2-finish good"; m.textContent = "🎉 The whole group is packed! Have a great trip. ✈️"; }
    }));
    var msg = el("div"); msg.id = "msg"; msg.setAttribute("role", "status"); wrap.appendChild(msg);
    // activity
    wrap.appendChild(el("h2", "v2-h2", "Group activity"));
    if (!grp.feed || !grp.feed.length) wrap.appendChild(el("p", "v2-sub", "Nothing yet. Changes by anyone in the group show up here."));
    else { var fd = el("div", "v2-feed"); grp.feed.forEach(function (ev) { var r = el("div", "v2-feedrow"); r.appendChild(el("span", null, groupLine(ev))); r.appendChild(el("span", "when", ago(ev.t))); fd.appendChild(r); }); wrap.appendChild(fd); }
    var tools2 = el("div"); tools2.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:4px";
    if ("Notification" in window && Notification.permission === "default") tools2.appendChild(btn("v2-btn sec", "Turn on alerts", enableAlerts));
    tools2.appendChild(btn("v2-btn sec v2-danger-btn", "Leave group", leaveGroup));
    wrap.appendChild(tools2);
  }

  /* ================= main app render ================= */
  function renderSide() {
    var side = $("side"), scrim = $("scrim"); if (side) side.style.display = ""; if (scrim) scrim.style.display = "";   // restore v1 chrome (hidden during guest mode)
    var box = $("tripList"), foot = $("sideFoot"), gbox = $("groupList"); box.innerHTML = ""; foot.innerHTML = ""; gbox.innerHTML = "";
    if (!user || !S) return;
    gbox.appendChild(el("div", "sidehead", "👥 Group checklists"));
    if (groups) groups.groups.forEach(function (g) {
      var gb = el("button", "trip-btn" + (view === "group" && curGroup && curGroup.group.id === g.id ? " cur" : "")); gb.type = "button"; gb.setAttribute("data-group", g.id);
      var nm = el("span", "trip-name", "👥 " + g.name); if (g.unread) nm.appendChild(el("span", "dot", "🔔 " + g.unread)); gb.appendChild(nm);
      gb.appendChild(el("span", "trip-meta", g.members + (g.members === 1 ? " person" : " people") + " · " + g.packed + " of " + g.need + " packed"));
      gb.addEventListener("click", function () { openGroup(g.id); }); gbox.appendChild(gb);
    });
    var gr = el("div", "uacts"); gr.style.margin = "6px 4px 10px"; gr.appendChild(btn("", "➕ New group", newGroup)); gr.appendChild(btn("", "🔑 Join with code", joinGroup)); gbox.appendChild(gr);
    if (!S.trips.length) box.appendChild(el("p", "empty-side", "No trips yet. Tap New trip to start."));
    S.trips.slice().reverse().forEach(function (t) {
      var cur = t.id === S.curTrip && view === "app", c = tripCounts(t);
      var wrap = el("div", "trip" + (cur ? " cur" : "")), b = el("button", "trip-btn"); b.type = "button";
      b.appendChild(el("span", "trip-name", "✈️ " + t.name));
      var du = daysUntil(t), when = (du != null && du >= 0) ? (du === 0 ? "🎉 Today · " : "⏳ in " + du + (du === 1 ? " day" : " days") + " · ") : "";
      b.appendChild(el("span", "trip-meta", t.packedAt ? "✅ Packed " + fmtDate(t.packedAt) : when + c.p + " of " + c.need + " packed"));
      b.addEventListener("click", function () { selectTrip(t.id); if (!t.lists.length) closeSide(); });
      wrap.appendChild(b);
      if (t.id === S.curTrip) {
        var sub = el("div", "sublists");
        t.lists.forEach(function (l) {
          var lc = counts(l.items), sb = el("button", "sub-btn" + (l.id === S.curList && view === "app" ? " cur" : "")); sb.type = "button";
          sb.appendChild(el("span", null, l.emoji + " " + l.name)); sb.appendChild(el("span", null, lc.p + "/" + lc.need));
          sb.addEventListener("click", function () { selectTrip(t.id, l.id); closeSide(); }); sub.appendChild(sb);
        });
        var ab = el("button", "sub-btn add"); ab.type = "button"; ab.appendChild(el("span", null, "➕ New checklist")); ab.appendChild(el("span", null, "")); ab.addEventListener("click", newList); sub.appendChild(ab);
        wrap.appendChild(sub);
      }
      box.appendChild(wrap);
    });
    foot.appendChild(el("div", "me", "👤 " + user.username + (user.role === "admin" ? " (admin)" : "")));
    foot.appendChild(btn("", "🏠 Home", function () { appGo("home"); }));
    foot.appendChild(btn("", "👨‍👩‍👧 Family" + (unread ? "  🔔 " + unread : ""), function () { go("family"); loadFamily(); }));
    if (user.role === "admin") foot.appendChild(btn("", "👑 Admin", function () { go("admin"); loadAdmin(); }));
    foot.appendChild(btn("", "🔑 My account", function () { go("account"); }));
    foot.appendChild(btn("", "🔗 Open a shared list", askSharedCode));
    foot.appendChild(btn("", "Log out", logout));
  }
  function renderMain() {
    // The signed-in app (Home + Trip + New-trip) is v2: it builds its own shell (no v1 topbar/sidebar).
    if (view === "app") {
      if (appView === "new" && ntForm) return renderNewTripV2();
      return (appView === "trip" && trip()) ? renderTripV2() : renderHomeV2();
    }
    var main = $("main"); main.innerHTML = "";
    var top = el("div", "topbar"); top.appendChild(btn("menu", "☰ Trips", openSide));
    var bell = btn("bell", "🔔 0", openBell); bell.id = "bell"; bell.hidden = true; top.appendChild(bell); updateBell();
    var st = el("span", "status " + saveState, STATUS_TEXT[saveState]); st.id = "saveStatus"; st.setAttribute("role", "status"); top.appendChild(st); main.appendChild(top);
    if (view === "account") return renderAccount(main);
    if (view === "admin") return renderAdmin(main);
    if (view === "family") return renderFamily(main);
    if (view === "member" && member) return renderMember(main);
    if (view === "group" && curGroup) return renderGroup(main);
    if (view === "shared" && shared) return renderShared(main);
    if (view === "adminuser" && adminDetail) return renderAdminUser(main);
  }

  /* ================= signed-in v2: Home + Trip ================= */
  // Navigation hub for the signed-in app. The v1 sidebar is hidden on v2 screens, so the overflow
  // sheet (openAppMenu) reaches Together, groups, account, admin, shared and log out.
  function appHeader(wrap, backTo) {
    var top = el("div", "v2-top");
    if (backTo) top.appendChild(btnIcon(G.back, "Back", backTo));
    top.appendChild(brandEl(false));
    var sp = el("div"); sp.style.flex = "1"; top.appendChild(sp);
    var st = el("span", "status " + saveState, STATUS_TEXT[saveState]); st.id = "saveStatus"; st.setAttribute("role", "status"); st.style.cssText = "font-size:var(--fs-meta);color:var(--slate);font-family:var(--font-mono);margin-inline-end:4px;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"; top.appendChild(st);
    var menu = el("button", "v2-iconbtn"); menu.type = "button"; menu.setAttribute("aria-label", "Menu" + (unread ? " (" + unread + " new)" : "")); menu.appendChild(gsvg(G.menu));
    if (unread) { var d = el("span"); d.style.cssText = "position:absolute;margin:-14px 0 0 12px;width:8px;height:8px;border-radius:50%;background:var(--together)"; menu.style.position = "relative"; menu.appendChild(d); }
    menu.addEventListener("click", openAppMenu); top.appendChild(menu);
    wrap.appendChild(top); return top;
  }
  function cdText(t) {
    var n = daysUntil(t);
    if (n == null) return "No dates yet";
    if (n > 1) return "In " + n + " days"; if (n === 1) return "Tomorrow"; if (n === 0) return "Today"; return "Date passed";
  }
  function renderHomeV2() {
    var wrap = gShell(false); appHeader(wrap, null);
    wrap.appendChild(el("h1", "v2-h1", "Hi " + user.username + " 👋"));
    var active = S.trips.filter(function (t) { return !t.archived; });
    if (!active.length) {
      var em = el("div", "v2-empty"); em.style.paddingTop = "8px";
      em.appendChild(el("h2", "v2-h2", "Where to next?"));
      em.appendChild(el("p", "v2-sub", "You have no trips yet. Plan one and add checklists like Documents, Clothing or Gadgets — nothing is added until you do."));
      em.appendChild(btn("v2-btn full", "Plan a trip", newTripV2));
      wrap.appendChild(em); return;
    }
    var next = nextTripV2(active), c = tripCounts(next), days = daysUntil(next);
    // departure-day surfacing: on the day or the day before, lead with the final "Before you leave" list
    var leave = next.lists.filter(function (l) { return l.kind === "leave"; })[0];
    if (days != null && days >= 0 && days <= 1 && leave) {
      var openN = leave.items.filter(function (i) { return i.state === "todo"; }).length;
      var dep = el("button", "v2-card"); dep.type = "button"; dep.style.cssText = "display:block;width:100%;text-align:start;cursor:pointer;background:var(--together-bg);border-color:var(--together)";
      dep.appendChild(el("div", "v2-kicker", (days === 0 ? "Leaving today" : "Leaving tomorrow") + " · " + next.name));
      dep.appendChild(el("div", "v2-h2", (leave.emoji || "🔑") + " " + leave.name));
      dep.appendChild(el("p", "v2-sub", openN ? (openN + " thing" + (openN === 1 ? "" : "s") + " left before you walk out the door.") : "You're all set — nothing left on this list."));
      dep.addEventListener("click", function () { selectTrip(next.id, leave.id); });
      wrap.appendChild(dep);
    }
    wrap.appendChild(el("div", "v2-kicker", "Next up"));
    wrap.appendChild(tripCardV2(next, c, true));
    var nextCd = v2Countdown(next, { mini: true }); if (nextCd) wrap.appendChild(nextCd);
    var others = active.filter(function (t) { return t.id !== next.id; });
    if (others.length) {
      wrap.appendChild(el("div", "v2-kicker", "Your other trips"));
      others.forEach(function (t) { wrap.appendChild(tripCardV2(t, tripCounts(t), false)); });
    }
    wrap.appendChild(btn("v2-btn sec full", "Plan another trip", newTripV2));
  }
  // Soonest upcoming, then undated, then past; most recently created breaks ties (matches guest Home).
  function nextTripV2(active) {
    var a = active.slice();
    a.sort(function (x, y) { var dx = daysUntil(x), dy = daysUntil(y); var rx = dx == null ? 1e8 : dx < 0 ? 1e7 - dx : dx; var ry = dy == null ? 1e8 : dy < 0 ? 1e7 - dy : dy; return rx - ry || (y.created || 0) - (x.created || 0); });
    return a[0];
  }
  function tripCardV2(t, c, big) {
    var card = el("button", "v2-trip"); card.type = "button"; if (!big) card.style.background = "var(--bg)";
    var tn = el("div", "tn"); tn.appendChild(document.createTextNode(t.name));
    if (t.hidden) { var pv = el("span", "v2-privtag"); pv.style.marginInlineStart = "8px"; pv.appendChild(gsvg(G.eyeoff, 2)); pv.appendChild(document.createTextNode("private")); tn.appendChild(pv); }
    card.appendChild(tn);
    card.appendChild(el("div", "td", cdText(t) + (t.travelDate ? " · " + fmtDate(t.travelDate) : "") + " · " + c.p + "/" + c.need + " packed" + (t.packedAt ? " · ✅" : "")));
    if (big) { var pr = el("div", "v2-progress"); pr.setAttribute("role", "progressbar"); pr.setAttribute("aria-valuemin", "0"); pr.setAttribute("aria-valuemax", String(c.need)); pr.setAttribute("aria-valuenow", String(c.p)); pr.style.margin = "12px 0 2px"; var fi = document.createElement("i"); fi.style.width = (c.need ? Math.round(c.p / c.need * 100) : 0) + "%"; pr.appendChild(fi); card.appendChild(pr); }
    card.addEventListener("click", function () { selectTrip(t.id); });
    return card;
  }
  // Signed-in New-trip: the v2 three-field flow (name, dates, who's going → ready-made lists),
  // replacing the v1 modal. Nothing is created until Create — no auto-create.
  function newTripV2() { ntForm = { name: "", start: "", end: "", noDates: false, profile: null, pick: {}, err: "" }; appView = "new"; closeAppMenu(); render(); }
  function renderNewTripV2() {
    var f = ntForm; var wrap = gShell(false);
    appHeader(wrap, function () { ntForm = null; appGo("home"); });
    wrap.appendChild(el("h1", "v2-h1", "Plan a trip"));
    tripFormFields(wrap, f, renderNewTripV2);
    wrap.appendChild(btn("v2-btn full", "Create trip", ntCreate));
  }
  function ntCreate() {
    var f = ntForm; if (!f) return;
    if (!f.name.trim()) { f.err = "Give your trip a name."; return render(); }
    var trip = buildTripFromForm(f);
    S.trips.push(trip); S.curTrip = trip.id; S.curList = trip.lists[0].id;
    ntForm = null; appView = "trip"; msgClear(); touch(); render();
  }
  function renderTripV2() {
    var t = trip(); var wrap = gShell(false);
    var top = appHeader(wrap, function () { appGo("home"); });
    // trip title + actions
    var h = el("div"); h.style.cssText = "display:flex;align-items:flex-start;gap:8px";
    var tt = el("h1", "v2-h1"); tt.style.cssText = "flex:1;min-width:0;overflow-wrap:anywhere"; tt.appendChild(document.createTextNode(t.name)); h.appendChild(tt);
    var ic = el("div", "v2-iconrow"); ic.style.flex = "none";
    var ey = el("button", "v2-iconbtn" + (t.hidden ? " on" : "")); ey.type = "button"; ey.setAttribute("aria-label", t.hidden ? "Private trip — hidden from family. Tap to share." : "Shared with family. Tap to make private."); ey.title = ey.getAttribute("aria-label"); ey.appendChild(gsvg(t.hidden ? G.eyeoff : G.eye)); ey.addEventListener("click", function () { toggleHidden(t); }); ic.appendChild(ey);
    var sh = el("button", "v2-iconbtn"); sh.type = "button"; sh.setAttribute("aria-label", "Share this trip (view only)"); sh.title = sh.getAttribute("aria-label"); sh.appendChild(gsvg(G.link)); sh.addEventListener("click", function () { toggleSharePanel(t); }); ic.appendChild(sh);
    var re = el("button", "v2-iconbtn"); re.type = "button"; re.setAttribute("aria-label", "Rename trip"); re.title = "Rename trip"; re.appendChild(gsvg(G.pencil)); re.addEventListener("click", renameTrip); ic.appendChild(re);
    var de = el("button", "v2-iconbtn danger"); de.type = "button"; de.setAttribute("aria-label", "Delete trip"); de.title = "Delete trip"; de.appendChild(gsvg(G.trash)); de.addEventListener("click", deleteTrip); ic.appendChild(de);
    h.appendChild(ic); wrap.appendChild(h);
    var tc = tripCounts(t);
    if (t.packedAt || t.hidden) wrap.appendChild(el("div", "v2-meta", [t.packedAt ? "✅ Packed " + fmtDate(t.packedAt) : "", t.hidden ? "🙈 private" : ""].filter(Boolean).join(" · ")));
    wrap.appendChild(v2Countdown(t, { onSet: setTravelDate, onClear: clearTravelDate, counts: tc }));
    if (sharePanel && sharePanel.tripId === t.id) wrap.appendChild(buildShareV2(t));
    // Progress: packed of (packed + to-go), labelled "% packed" — progress, not a readiness score.
    var pct = tc.need ? Math.round(tc.p / tc.need * 100) : 0;
    var prow = el("div"); prow.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;gap:10px";
    prow.appendChild(el("span", "v2-sub", tc.p + " of " + tc.need + " packed"));
    prow.appendChild(el("span", "v2-pct", pct + "% packed"));
    wrap.appendChild(prow);
    var pr = el("div", "v2-progress"); pr.setAttribute("role", "progressbar"); pr.setAttribute("aria-valuemin", "0"); pr.setAttribute("aria-valuemax", String(tc.need)); pr.setAttribute("aria-valuenow", String(tc.p)); pr.setAttribute("aria-label", pct + "% packed"); var fi = document.createElement("i"); fi.style.width = pct + "%"; pr.appendChild(fi); wrap.appendChild(pr);
    wrap.appendChild(buildEssentialsV2(t));
    // list tabs
    var cur = list();
    var tabs = el("div", "v2-listtabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Checklists");
    t.lists.forEach(function (l) {
      var lc = counts(l.items); var b = el("button", "v2-tab"); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", cur && l.id === cur.id ? "true" : "false");
      b.appendChild(document.createTextNode((l.hidden ? "🙈 " : (l.emoji ? l.emoji + " " : "")) + l.name)); b.appendChild(el("span", "c", lc.p + "/" + lc.need));
      b.addEventListener("click", function () { S.curList = l.id; msgClear(); render(); }); tabs.appendChild(b);
    });
    var addTab = el("button", "v2-tab"); addTab.type = "button"; addTab.appendChild(gsvg(G.plus)); addTab.appendChild(document.createTextNode(" Checklist")); addTab.addEventListener("click", newList); tabs.appendChild(addTab);
    wrap.appendChild(tabs);
    var l = cur;
    if (!l) { wrap.appendChild(el("p", "v2-sub", "No checklists yet. Add one like Documents, Clothing or Gadgets.")); return; }
    // list tools
    if (l.kind === "leave") wrap.appendChild(el("p", "v2-note", "🔑 Reminders for before you walk out the door. They're only for you — never shown to family."));
    else {
      var tools = el("div"); tools.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
      tools.appendChild(btn("v2-btn sec", "Rename list", renameList));
      tools.appendChild(btn("v2-btn sec", l.hidden ? "Share list" : "Make list private", function () { toggleHidden(l); }));
      tools.appendChild(btn("v2-btn sec", "Delete list", deleteList));
      wrap.appendChild(tools);
    }
    // items
    var ul = el("ul", "v2-rows"); ul.setAttribute("aria-label", l.name);
    if (!l.items.length) { var li0 = el("li"); li0.style.cssText = "background:var(--bg);padding:14px 16px;color:var(--slate);font-size:14px"; li0.textContent = "Nothing in " + l.name + " yet — add your first item below."; ul.appendChild(li0); }
    l.items.forEach(function (it) { ul.appendChild(tripItemV2(l, it)); });
    wrap.appendChild(ul);
    // quick add
    var form = document.createElement("form"); form.className = "v2-add";
    var inp = el("input", "v2-input"); inp.id = "newItem"; inp.maxLength = 80; inp.autocomplete = "off"; inp.placeholder = "Add to " + l.name + "…"; inp.setAttribute("aria-label", "New item");
    form.appendChild(inp); var addb = el("button", "v2-btn", "Add"); addb.type = "submit"; form.appendChild(addb);
    form.addEventListener("submit", function (ev) { ev.preventDefault(); addItem(); });
    wrap.appendChild(form);
    // finish
    wrap.appendChild(btn("v2-btn full", "🧳 Everything packed!", finishV2));
    var m = el("div"); m.id = "msg"; m.setAttribute("role", "status"); wrap.appendChild(m);
  }
  function tripItemV2(l, it) {
    var li = el("li", "v2-item" + (it.state === "packed" ? " done" : it.state === "skip" ? " skip" : "") + (it.hidden ? " priv" : ""));
    var chk = el("button", "v2-check"); chk.type = "button"; chk.setAttribute("role", "checkbox"); chk.setAttribute("aria-checked", it.state === "packed" ? "true" : "false"); chk.setAttribute("aria-label", (it.state === "packed" ? "Packed: " : "Pack: ") + it.name);
    var bx = el("span", "box"); if (it.state === "packed") bx.appendChild(gsvg(G.tick, 3)); chk.appendChild(bx);
    chk.addEventListener("click", function () { setState(it, "packed"); });
    var lab = el("button", "label"); lab.type = "button"; lab.setAttribute("aria-label", it.name);
    if (it.mnf) { var star = el("span", "star"); star.setAttribute("aria-label", "Must not forget"); star.appendChild(gsvg(G.star, 1.6)); lab.appendChild(star); }
    if (it.emoji) lab.appendChild(el("span", "emoji", it.emoji));
    lab.appendChild(el("span", "nm", it.name));
    if (it.qty && it.qty > 1) lab.appendChild(el("span", "qty", "×" + it.qty));
    if (it.hidden) { var pt = el("span", "v2-privtag"); pt.appendChild(gsvg(G.eyeoff, 2)); pt.appendChild(document.createTextNode("private")); lab.appendChild(pt); }
    lab.addEventListener("click", function () { setState(it, "packed"); });
    var skip = el("button", "v2-skip"); skip.type = "button"; skip.setAttribute("aria-pressed", it.state === "skip" ? "true" : "false"); skip.setAttribute("aria-label", "Not needed: " + it.name); skip.title = "Not needed"; skip.appendChild(gsvg(G.skip)); skip.addEventListener("click", function () { setState(it, "skip"); });
    li.appendChild(chk); li.appendChild(lab); li.appendChild(skip);
    if (l.kind !== "leave") { var eye = el("button", "v2-rowbtn" + (it.hidden ? " on" : "")); eye.type = "button"; eye.setAttribute("aria-label", (it.hidden ? "Private, hidden from family: " : "Shared with family: ") + it.name); eye.setAttribute("aria-pressed", it.hidden ? "true" : "false"); eye.appendChild(gsvg(it.hidden ? G.eyeoff : G.eye)); eye.addEventListener("click", function () { toggleHidden(it); }); li.appendChild(eye); }
    var rm = el("button", "v2-rowbtn danger"); rm.type = "button"; rm.setAttribute("aria-label", "Remove: " + it.name); rm.title = "Remove"; rm.appendChild(gsvg("M5 12h14")); rm.addEventListener("click", function () { removeItem(l, it); }); li.appendChild(rm);
    return li;
  }
  // Essentials: progress + a named list of what's missing. Never a score (CLAUDE.md).
  function buildEssentialsV2(t) {
    var st = essentialsStatus(t), miss = st.filter(function (x) { return x.st === "missing"; }), todo = st.filter(function (x) { return x.st === "todo"; });
    var box = document.createElement("details"); box.className = "v2-ess" + (miss.length ? " warn" : "");
    box.open = miss.length > 0;
    var sum = document.createElement("summary");
    sum.textContent = miss.length ? "⚠️ Missing essentials: " + miss.map(function (x) { return x.e.emoji + " " + x.e.label; }).join(", ")
      : todo.length ? "🕐 Essentials still to pack: " + todo.map(function (x) { return x.e.emoji + " " + x.e.label; }).join(", ")
        : "✅ All essentials are packed";
    box.appendChild(sum);
    st.forEach(function (x) {
      var r = el("div", "essrow"); r.appendChild(el("span", null, x.e.emoji + " " + x.e.label));
      if (x.st === "missing") { var b = btn("v2-btn sec", "Add", function () { addEssential(x.e); }); b.setAttribute("aria-label", "Add " + x.e.label + " to your list"); b.style.minHeight = "36px"; r.appendChild(b); }
      else r.appendChild(el("span", "st", x.st === "ok" ? "✓ packed" : "to pack"));
      box.appendChild(r);
    });
    return box;
  }
  function buildShareV2(t) {
    var box = el("div", "v2-share"); box.setAttribute("role", "status");
    box.appendChild(el("div", "v2-h2", "🔗 Share “" + t.name + "” (view only)"));
    if (sharePanel.error) box.appendChild(el("p", "v2-err", sharePanel.error));
    if (t.hidden) { box.appendChild(el("p", "v2-sub", "This trip is private. Tap the eye icon above to share it before making a code.")); return box; }
    if (sharePanel.code === undefined) { box.appendChild(el("p", "v2-sub", "Loading…")); return box; }
    if (!sharePanel.code) {
      box.appendChild(el("p", "v2-sub", "Make a code so friends can view this list. They can't change anything, and your 🙈 private items and your “Before you leave” list stay hidden."));
      box.appendChild(btn("v2-btn", "Create sharing code", function () { makeShare(t); }));
      return box;
    }
    box.appendChild(el("div", "code", fmtCode(sharePanel.code)));
    var link = location.origin + "/?code=" + sharePanel.code;
    var row = el("div", "row");
    row.appendChild(btn("v2-btn sec", "Copy code", function () { copyText(fmtCode(sharePanel.code)); }));
    row.appendChild(btn("v2-btn sec", "Copy link", function () { copyText(link); }));
    row.appendChild(btn("v2-btn sec", "New code", function () { makeShare(t); }));
    row.appendChild(btn("v2-btn sec", "Stop sharing", function () { stopShare(t); }));
    box.appendChild(row);
    return box;
  }
  function finishV2() {
    var t = trip(), m = $("msg"); if (!m) return; m.className = ""; m.innerHTML = "";
    var total = tripCounts(t);
    if (!total.need && !total.s) { m.className = "v2-finish bad"; m.textContent = "Nothing on this trip yet. Add items to a checklist first. 📝"; return; }
    var left = [];
    t.lists.forEach(function (l) { var u = l.items.filter(function (i) { return i.state === "todo"; }); if (u.length) left.push({ l: l, u: u }); });
    if (left.length) {
      m.className = "v2-finish bad";
      var n = left.reduce(function (a, g) { return a + g.u.length; }, 0);
      m.appendChild(el("div", null, "😬 Not done yet — " + n + (n === 1 ? " item is" : " items are") + " still waiting:"));
      left.forEach(function (g) { var ul = el("ul"); ul.appendChild(el("div", null, g.l.emoji + " " + g.l.name)); g.u.forEach(function (i) { ul.appendChild(el("li", null, i.emoji + " " + i.name)); }); m.appendChild(ul); });
    } else {
      m.className = "v2-finish good"; m.textContent = "🎉 All packed for " + t.name + "! Have a great trip. ✈️";
      t.packedAt = Date.now(); touch();
    }
    var miss = essentialsStatus(t).filter(function (x) { return x.st === "missing"; });
    if (miss.length) m.appendChild(el("div", null, "⚠️ Missing essentials (not on your list): " + miss.map(function (x) { return x.e.emoji + " " + x.e.label; }).join(", ")));
    m.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  // Overflow sheet: the signed-in nav the hidden v1 sidebar used to carry.
  var appMenuEl = null;
  function closeAppMenu() { if (appMenuEl) { appMenuEl.remove(); appMenuEl = null; } }
  function openAppMenu() {
    closeAppMenu();
    var scrim = el("div", "v2-scrim"); scrim.addEventListener("click", function (e) { if (e.target === scrim) closeAppMenu(); });
    var sheet = el("div", "v2-sheet"); sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-label", "Menu");
    sheet.appendChild(el("h2", null, "👤 " + user.username + (user.role === "admin" ? " · admin" : "")));
    function row(icon, label, fn, badge) {
      var b = el("button", "v2-sheet-row"); b.type = "button";
      b.appendChild(el("span", "ic", icon)); b.appendChild(document.createTextNode(label));
      if (badge) b.appendChild(el("span", "badge", "🔔 " + badge));
      b.addEventListener("click", function () { closeAppMenu(); fn(); }); sheet.appendChild(b); return b;
    }
    row("👨‍👩‍👧", "Together", function () { go("family"); loadFamily(); }, unread || 0);
    // groups the user is in
    if (groups && groups.groups && groups.groups.length) {
      sheet.appendChild(el("div", "v2-sheet-sep"));
      groups.groups.forEach(function (g) { row("👥", g.name, function () { openGroup(g.id); }, g.unread || 0); });
    }
    sheet.appendChild(el("div", "v2-sheet-sep"));
    row("➕", "New group", newGroup);
    row("🔑", "Join a group", joinGroup);
    row("🔗", "Open a shared list", askSharedCode);
    sheet.appendChild(el("div", "v2-sheet-sep"));
    row("⚙️", "My account", function () { go("account"); });
    if (user.role === "admin") row("👑", "Admin", function () { go("admin"); loadAdmin(); });
    row("🚪", "Log out", logout);
    scrim.appendChild(sheet); document.body.appendChild(scrim); appMenuEl = scrim;
  }

  function render() {
    if (!user) {
      if (shared) return renderSharedGuest();
      if (guestMode) return renderGuest();
      return renderAuth();
    }
    if (view === "mustchange") return renderMustChange();
    document.body.className = "";
    if (!S) { $("main").innerHTML = '<p class="sub loading">Loading…</p>'; return; }
    renderSide(); renderMain();
  }
  $("newTripBtn").addEventListener("click", newTripV2);

  /* ================= boot ================= */
  api("GET", "/api/me").then(function (r) {
    cfg.signupEnabled = !!r.signupEnabled; user = r.user;
    var qc = null; try { var sp = new URLSearchParams(location.search); qc = sp.get("code"); pendingGroup = sp.get("group"); } catch (e) { }
    var first = user ? afterLogin() : enterGuest();   // no account → guest-first (works offline)
    return first.then(function () { if (qc) return openShared(qc); });
  }).catch(function (e) {
    // Offline or server down: if this device has a signed-in session and cached trips, boot anyway.
    return bootOffline(e);
  });

  function bootOffline(e) {
    if (!window.BaggoDB) return showBootError(e);
    return BaggoDB.getSession().then(function (sess) {
      if (!sess) return enterGuest();   // never signed in → guest works offline from first open
      return BaggoDB.loadState(sess.key).then(function (local) {
        // A valid session boots straight into the signed-in app, even with an empty account (no
        // trips yet) or no cached state — the v2 Home shows the empty state and sync reconciles online.
        user = { username: sess.username, key: sess.key, role: sess.role, mustChange: false };
        lastKey = user.key; S = (local && local.trips) ? normalize(local) : emptyState(); view = "app"; appView = "home"; offlineBoot = true;
        configureSync();
        return BaggoSync.loadMeta().then(function () {
          setStatus(BaggoSync.anyDirty() ? "pending" : "saved"); render();
          setTimeout(pollUnread, 3000); setTimeout(loadGroups, 3000); setTimeout(flush, 1500);   // reconcile when the network returns
        });
      });
    }).catch(function () { return showBootError(e); });
  }
  function showBootError(e) {
    $("main").innerHTML = ""; var c = el("div", "auth"); c.appendChild(el("div", "big", "😕")); c.appendChild(el("h1", null, "Can't load right now"));
    c.appendChild(el("p", "sub", errText(e))); c.appendChild(btn("btn full", "Try again", function () { location.reload(); })); $("main").appendChild(c);
  }

  /* ================= guest mode (v2 · Journey 1) =================
     No account, no network needed. Trips live on the device (IndexedDB, owner "guest");
     nothing is sent anywhere. Signing in (v1) is one tap away for family/groups. */
  var GUEST = "guest", guestMode = false, gview = "welcome", gform = null, gcat = "all";
  var PROFILES = [
    ["family", "Family", "One organiser plus the family, each on their own phone"],
    ["pilgrimage", "Pilgrimage / religious group", "A jamaat, Umrah or church trip with a coordinator"],
    ["solo_dom", "Solo — domestic", "A quick trip at home; reuse last time"],
    ["solo_int", "Solo — international", "First or occasional international travel"],
  ];
  // starter lists: [name, emoji, kind, [[emoji, name, qty?, mustNotForget?], ...]]
  var UNIVERSAL = [
    ["Documents", "🛂", "documents", [["🛂", "Passport / ID", 1, true], ["🎟️", "Tickets & bookings"], ["💳", "Wallet & cards"], ["💵", "Cash / local currency"]]],
    ["Packing basics", "🎒", "packing", [["👕", "Clothes"], ["🩲", "Underwear & socks"], ["🪥", "Toothbrush & toothpaste"], ["🔌", "Phone charger", 1, true], ["💊", "Medicines"]]],
    ["Before you leave", "🔑", "leave", [["🔑", "Lock doors & windows"], ["🔌", "Unplug appliances"], ["🔥", "Turn off the gas"], ["🪪", "Passport / ID & tickets", 1, true]]],
  ];
  var STARTERS = {
    family: [
      ["Family packing", "👨‍👩‍👧", "packing", [["👕", "Clothes for everyone"], ["🧥", "Jackets"], ["🩲", "Underwear & socks"], ["🪥", "Toiletries bag"], ["💊", "Medicines"]]],
      ["Kids", "🧸", "packing", [["🍼", "Snacks & bottles"], ["🧸", "Comfort toy"], ["🩹", "Plasters"], ["👶", "Spare clothes"], ["🎧", "Headphones"]]],
      ["Documents", "🛂", "documents", [["🛂", "Passports / IDs", 1, true], ["🎟️", "Tickets & bookings"], ["💳", "Wallet & cards"]]],
      ["Home", "🏠", "home", [["🪴", "Water the plants"], ["🗑️", "Take out the trash"], ["🔌", "Unplug appliances"], ["🐱", "Arrange pet care"]]],
      ["Before you leave", "🔑", "leave", [["🔑", "Lock up"], ["🔥", "Turn off the gas"], ["🚰", "Turn off taps"]]],
    ],
    pilgrimage: [
      ["Essentials", "📋", "packing", [["🪪", "ID card", 1, true], ["👝", "Pouch / belt bag"], ["💧", "Water bottle"], ["📿", "Prayer items"]]],
      ["Modesty & prayer", "🧕", "packing", [["🧕", "Modest clothing"], ["🧦", "Extra socks"], ["🧴", "Travel prayer mat"], ["🧣", "Scarf / shawl"]]],
      ["Long journey", "🚌", "custom", [["🍿", "Snacks for the journey"], ["🎧", "Headphones"], ["🔌", "Power bank", 1, true], ["💊", "Travel-sickness tablets"]]],
      ["Documents", "🛂", "documents", [["🛂", "Passport / ID", 1, true], ["🎟️", "Group booking reference"], ["💳", "Cash & cards"]]],
    ],
    solo_dom: [
      ["Weekend bag", "🎒", "packing", [["👕", "T-shirts", 2], ["🩲", "Underwear", 2], ["🧦", "Socks", 2], ["🪥", "Toothbrush & toothpaste"], ["🔌", "Phone charger", 1, true]]],
      ["Work trip", "💼", "packing", [["👔", "Smart outfit"], ["💻", "Laptop & charger", 1, true], ["🪪", "Work ID"]]],
      ["Before you leave", "🔑", "leave", [["🔑", "Lock up"], ["🔌", "Unplug"], ["🗑️", "Trash out"]]],
    ],
    solo_int: [
      ["International documents", "🛂", "documents", [["🛂", "Passport", 1, true], ["📄", "Check: visa / entry rules"], ["💉", "Check: vaccinations needed"], ["🧾", "Travel insurance"]]],
      ["Money", "💳", "money", [["💳", "Backup bank card", 1, true], ["💵", "Some local currency"], ["📱", "Banking app set up"]]],
      ["Digital readiness", "📱", "digital", [["📲", "Offline maps downloaded"], ["🔌", "Plug adapter"], ["🔋", "Power bank"], ["☁️", "Docs saved offline"]]],
      ["Packing basics", "🎒", "packing", [["👕", "Clothes"], ["🪥", "Toiletries"], ["💊", "Medicines"]]],
    ],
  };
  function gsvg(d, w) { var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("width", 18); s.setAttribute("height", 18); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", w || 2); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true"); var pth = document.createElementNS("http://www.w3.org/2000/svg", "path"); pth.setAttribute("d", d); s.appendChild(pth); return s; }
  var G = { tick: "M5 12.5 10 17.5 19 7", skip: "M18 6 6 18", star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9z", back: "M15 6l-6 6 6 6", plus: "M12 5v14M5 12h14", home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", bag: "M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z", people: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a7 7 0 0 1 14 0M17 11a3 3 0 1 0-1-5.8M22 20a7 7 0 0 0-5-6.7",
    eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", eyeoff: "M3 3l18 18 M10.6 10.6a3 3 0 0 0 4.2 4.2 M9.8 5.1A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9 M6 6.1A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 3-.5",
    link: "M9 15l6-6 M10.5 7.5l1-1a4 4 0 0 1 6 6l-1 1 M13.5 16.5l-1 1a4 4 0 0 1-6-6l1-1", menu: "M4 7h16M4 12h16M4 17h16", pencil: "M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z M13.5 6.5l3 3", trash: "M4 7h16 M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" };

  function enterGuest() {
    guestMode = true; user = null; gcat = "all";
    var load = (window.BaggoDB ? BaggoDB.loadState(GUEST) : Promise.resolve(null)).catch(function () { return null; });
    return load.then(function (local) {
      if (local && local.trips && local.trips.length) { S = local; gFix(); gview = "home"; }
      else { S = emptyState(); gview = "welcome"; }
      renderGuest();
    });
  }
  function gFix() {
    if (!S) return;
    if (!S.trips.some(function (t) { return t.id === S.curTrip; })) { var last = S.trips[S.trips.length - 1]; S.curTrip = last ? last.id : null; }
    var ct = S.trips.filter(function (t) { return t.id === S.curTrip; })[0];
    if (ct && !ct.lists.some(function (l) { return l.id === S.curList; })) S.curList = ct.lists[0] ? ct.lists[0].id : null;
  }
  function guestPersist() { if (window.BaggoDB) BaggoDB.saveState(GUEST, S); }
  function gTrip() { return S && S.trips.filter(function (t) { return t.id === S.curTrip; })[0] || null; }
  function gGo(v, extra) { gview = v; if (extra) { if ("cat" in extra) gcat = extra.cat; } renderGuest(); var m = $("main"); if (m) m.scrollTop = 0; }
  function guestSignIn() { guestMode = false; gform = null; expiredMsg = null; render(); }

  function gCounts(t) { var p = 0, n = 0; t.lists.forEach(function (l) { l.items.forEach(function (i) { if (i.state === "packed") { p++; n++; } else if (i.state === "todo") n++; }); }); return { packed: p, need: n, pct: n ? Math.round(p / n * 100) : 0 }; }
  // Guest trips keep dates in start (and travelDate = start, which the countdown reads).
  function gSetDate() {
    var t = gTrip(); if (!t) return;
    openModal({ title: "When are you travelling? 📅", text: "We'll count down the days for you.", inputType: "date", value: t.start || "", ok: "Save date" }, function (v) {
      if (!parseDay(v)) return; t.start = v; t.travelDate = v; guestPersist(); renderGuest();
    });
  }
  function gClearDate() { var t = gTrip(); if (!t) return; t.start = null; t.travelDate = null; guestPersist(); renderGuest(); }

  // Build a trip from a New-trip form (shared by guest and signed-in). Nothing is created until
  // the person taps Create — the chosen starter lists only, or one empty "Packing" list.
  function buildTripFromForm(f) {
    var src = f.profile ? STARTERS[f.profile] : UNIVERSAL;
    var lists = src.filter(function (t) { return f.pick[t[0]] !== false; }).map(function (t) {
      return { id: nid(), name: t[0], emoji: t[1], kind: t[2], items: t[3].map(function (it) { var o = { id: nid(), emoji: it[0], name: it[1], state: "todo" }; if (it[2]) o.qty = it[2]; if (it[3]) o.mnf = true; return o; }) };
    });
    if (!lists.length) lists = [{ id: nid(), name: "Packing", emoji: "🎒", kind: "packing", items: [] }];
    var start = f.noDates ? null : (f.start || null);
    return { id: nid(), name: f.name.trim(), created: Date.now(), packedAt: null, start: start, end: f.noDates ? null : (f.end || null), travelDate: start, profile: f.profile || null, lists: lists };
  }
  // The three New-trip fields (name, dates, who's going → starter lists) rendered into a wrap.
  // `rerender` redraws the screen after a toggle; the caller adds its own header and Create button.
  function tripFormFields(wrap, f, rerender) {
    var nameF = el("label", "v2-field"); nameF.appendChild(el("span", null, "Trip name"));
    var nameI = el("input", "v2-input"); nameI.id = "ntName"; nameI.value = f.name; nameI.placeholder = "e.g. Weekend in Lisbon"; nameI.setAttribute("aria-label", "Trip name"); if (f.err) nameI.setAttribute("aria-invalid", "true");
    nameI.addEventListener("input", function () { f.name = nameI.value; f.err = ""; });
    nameF.appendChild(nameI); wrap.appendChild(nameF);
    if (f.err) { var e = el("p", "v2-err", f.err); e.setAttribute("role", "alert"); wrap.appendChild(e); }
    var datesF = el("div", "v2-field"); datesF.appendChild(el("span", null, "When?"));
    var grid = el("div", "v2-dates");
    var ds = el("input", "v2-input date"); ds.type = "date"; ds.value = f.start; ds.disabled = f.noDates; ds.setAttribute("aria-label", "Departure date"); ds.addEventListener("change", function () { f.start = ds.value; });
    var de = el("input", "v2-input date"); de.type = "date"; de.value = f.end; de.disabled = f.noDates; de.setAttribute("aria-label", "Return date"); de.addEventListener("change", function () { f.end = de.value; });
    grid.appendChild(ds); grid.appendChild(de); datesF.appendChild(grid);
    var nd = el("label", "v2-checkline"); var ndi = document.createElement("input"); ndi.type = "checkbox"; ndi.checked = f.noDates; ndi.addEventListener("change", function () { f.noDates = ndi.checked; rerender(); }); nd.appendChild(ndi); nd.appendChild(document.createTextNode("I don't know my dates yet")); datesF.appendChild(nd);
    wrap.appendChild(datesF);
    var who = el("div", "v2-field"); who.appendChild(el("span", null, "Who's going?"));
    var choices = el("div", "v2-choices"); choices.setAttribute("role", "radiogroup"); choices.setAttribute("aria-label", "Who's going");
    PROFILES.forEach(function (p) {
      var b = el("button", "v2-choice"); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", f.profile === p[0] ? "true" : "false");
      var ring = el("span", "ring"); ring.appendChild(el("i")); b.appendChild(ring);
      var ct = el("span", "ct"); ct.appendChild(el("b", null, p[1])); ct.appendChild(el("small", null, p[2])); b.appendChild(ct);
      b.addEventListener("click", function () { f.profile = p[0]; f.pick = {}; rerender(); });
      choices.appendChild(b);
    });
    who.appendChild(choices); wrap.appendChild(who);
    var src = f.profile ? STARTERS[f.profile] : UNIVERSAL;
    var sl = el("div", "v2-field");
    sl.appendChild(el("span", null, f.profile ? "Starter lists" : "We'll add three basics"));
    sl.appendChild(el("p", "v2-sub", "Tick what to add — nothing is added without you."));
    var box = el("div"); box.style.cssText = "display:flex;flex-direction:column;gap:8px";
    src.forEach(function (t) {
      var on = f.pick[t[0]] !== false;
      var b = el("button", "v2-starter"); b.type = "button"; b.setAttribute("role", "checkbox"); b.setAttribute("aria-checked", on ? "true" : "false");
      var bx = el("span", "box"); if (on) bx.appendChild(gsvg(G.tick, 3)); b.appendChild(bx);
      var st = el("span", "st"); st.appendChild(el("b", null, t[1] + "  " + t[0])); st.appendChild(el("small", null, t[3].length + " items")); b.appendChild(st);
      b.addEventListener("click", function () { f.pick[t[0]] = (f.pick[t[0]] === false); rerender(); });
      box.appendChild(b);
    });
    sl.appendChild(box); wrap.appendChild(sl);
  }
  function gCreateTrip() {
    var f = gform;
    if (!f.name.trim()) { f.err = "Give your trip a name."; return renderGuest(); }
    var trip = buildTripFromForm(f);
    S.trips.push(trip); S.curTrip = trip.id; S.curList = trip.lists[0].id; gform = null; gcat = "all";
    guestPersist(); gGo("trip");
    toast("Trip created on this device.");
  }
  function gToggleItem(listId, id) {
    var t = gTrip(); if (!t) return; var l = t.lists.filter(function (x) { return x.id === listId; })[0]; if (!l) return;
    var it = l.items.filter(function (i) { return i.id === id; })[0]; if (!it) return;
    it.state = it.state === "packed" ? "todo" : "packed"; if (it.state !== "packed") t.packedAt = null;
    guestPersist(); renderGuest();
  }
  function gSkipItem(listId, id) {
    var t = gTrip(); if (!t) return; var l = t.lists.filter(function (x) { return x.id === listId; })[0]; if (!l) return;
    var it = l.items.filter(function (i) { return i.id === id; })[0]; if (!it) return;
    it.state = it.state === "skip" ? "todo" : "skip"; guestPersist(); renderGuest();
  }
  function gAddItem(listId, name) {
    var t = gTrip(); if (!t) return; var l = t.lists.filter(function (x) { return x.id === listId; })[0]; if (!l) return;
    l.items.push({ id: nid(), emoji: "🧳", name: name, state: "todo" }); t.packedAt = null; guestPersist(); renderGuest();
  }

  function renderGuest() {
    if (gview === "new") return renderGNew();
    if (gview === "together") return renderGTogether();
    if (gview === "trips") return renderGTrips();
    if (gview === "trip" && gTrip()) return renderGTrip();
    if (gActive().length || (S && S.trips.length)) return renderGHome();
    return renderGWelcome();
  }
  function guestCreateAccount() { authMode = "signup"; guestSignIn(); }
  function gActive() { return S ? S.trips.filter(function (t) { return !t.archived; }) : []; }
  function gArchived() { return S ? S.trips.filter(function (t) { return t.archived; }) : []; }
  function gDaysUntil(t) { return daysUntil({ travelDate: t.start }); }
  function gCountdown(t) { var n = gDaysUntil(t); if (n == null) return "No dates yet"; if (n > 1) return "In " + n + " days"; if (n === 1) return "Tomorrow"; if (n === 0) return "Today"; return "Date passed"; }
  // The trip Home focuses on: soonest upcoming, then undated, then past; most recently created breaks ties.
  function gNextTrip() {
    var a = gActive().slice(); if (!a.length) return null;
    a.sort(function (x, y) { var dx = gDaysUntil(x), dy = gDaysUntil(y); var rx = dx == null ? 1e8 : dx < 0 ? 1e7 - dx : dx; var ry = dy == null ? 1e8 : dy < 0 ? 1e7 - dy : dy; return rx - ry || (y.created || 0) - (x.created || 0); });
    return a[0];
  }
  function gNewForm() { gform = { name: "", start: "", end: "", noDates: false, profile: null, pick: {}, err: "" }; gGo("new"); }
  function gShell(hasTabs) {
    document.body.className = "v2";
    var side = $("side"), scrim = $("scrim"); if (side) side.style.display = "none"; if (scrim) scrim.style.display = "none";   // hide v1 chrome in guest mode
    var main = $("main"); main.innerHTML = ""; main.className = "main v2";
    var wrap = el("div", "v2-wrap"); main.appendChild(wrap);
    if (hasTabs) wrap.style.paddingBottom = "96px";
    return wrap;
  }
  function gBrand(wrap, withSignIn, tagline) {
    var top = el("div", "v2-top");
    top.appendChild(brandEl(!!tagline));
    if (withSignIn) top.appendChild(btn("v2-link", "Sign in", guestSignIn));
    wrap.appendChild(top); return top;
  }
  function gTabbar() {
    var bar = el("nav", "v2-tabbar"); bar.setAttribute("aria-label", "Main");
    [["home", "Home", G.home], ["trips", "Trips", G.bag], ["together", "Together", G.people]].forEach(function (x) {
      var current = x[0] === "home" ? (gview === "home" || gview === "trip") : gview === x[0];
      var b = el("button"); b.type = "button"; if (current) b.setAttribute("aria-current", "page");
      var pill = el("span", "pill"); pill.appendChild(gsvg(x[2])); b.appendChild(pill); b.appendChild(el("span", null, x[1]));
      b.addEventListener("click", function () { gGo(x[0]); });
      bar.appendChild(b);
    });
    return bar;
  }
  function renderGTogether() {
    var wrap = gShell(true); gBrand(wrap, true);
    var em = el("div", "v2-empty");
    var icon = el("span"); icon.style.cssText = "width:56px;height:56px;border-radius:16px;background:var(--together-bg);color:var(--together-fg);display:flex;align-items:center;justify-content:center"; var big = gsvg(G.people, 2); big.setAttribute("width", 28); big.setAttribute("height", 28); icon.appendChild(big); em.appendChild(icon);
    em.appendChild(el("h1", "v2-h1", "Pack together"));
    em.appendChild(el("p", "v2-sub", "Create a free account to connect your family or group: see who's ready, share a list everyone packs from, and keep your own private items private. Your trips on this device move with you — nothing is lost."));
    em.appendChild(btn("v2-btn full", "Create an account", guestCreateAccount));
    em.appendChild(btn("v2-btn sec full", "I already have one — sign in", guestSignIn));
    wrap.appendChild(em);
    $("main").appendChild(gTabbar());
  }
  function renderGWelcome() {
    var wrap = gShell(false); gBrand(wrap, true, true);
    var hero = el("div", "v2-empty"); hero.style.paddingTop = "32px";
    var icon = el("span"); icon.style.cssText = "width:56px;height:56px;border-radius:16px;background:var(--together-bg);color:var(--together-fg);display:flex;align-items:center;justify-content:center"; var big = gsvg(G.bag, 2); big.setAttribute("width", 28); big.setAttribute("height", 28); icon.appendChild(big); hero.appendChild(icon);
    hero.appendChild(el("h1", "v2-h1", "Pack for your next trip, together."));
    hero.appendChild(el("p", "v2-sub", "Make a list for anything, see who's ready, and never forget the charger again. No account needed to start, and it all works offline."));
    var row = el("div"); row.style.cssText = "display:flex;flex-direction:column;gap:10px;width:100%;margin-top:8px";
    row.appendChild(btn("v2-btn full", "Plan a trip", function () { gform = { name: "", start: "", end: "", noDates: false, profile: null, pick: {}, err: "" }; gGo("new"); }));
    row.appendChild(btn("v2-btn sec full", "Try a sample trip", gSampleTrip));
    hero.appendChild(row); wrap.appendChild(hero);
  }
  function gSampleTrip() {
    gform = { name: "Weekend in Lisbon", start: "", end: "", noDates: true, profile: "solo_dom", pick: {}, err: "" };
    gCreateTrip();
  }
  function renderGNew() {
    var f = gform; var wrap = gShell(false);
    var top = gBrand(wrap, false); top.insertBefore(btnIcon(G.back, "Back", function () { gform = null; gGo(S.trips.length ? "home" : "welcome"); }), top.firstChild);
    wrap.appendChild(el("h1", "v2-h1", "Plan a trip"));
    tripFormFields(wrap, f, renderGNew);
    wrap.appendChild(btn("v2-btn full", "Create trip", gCreateTrip));
  }
  function gOpenTrip(t) { S.curTrip = t.id; gFix(); gcat = "all"; guestPersist(); gGo("trip"); }
  function gOpenList(t, listId) { S.curTrip = t.id; gFix(); gcat = listId; guestPersist(); gGo("trip"); }
  function gOtherList(t) { return t.lists.filter(function (l) { return l.kind !== "leave" && l.items.some(function (i) { return i.state === "todo"; }); })[0] || t.lists.filter(function (l) { return l.kind !== "leave"; })[0]; }
  function gLeaveList(t) { return t.lists.filter(function (l) { return l.kind === "leave"; })[0]; }

  function renderGHome() {
    var wrap = gShell(true); gBrand(wrap, true);
    var active = gActive();
    if (!active.length) {
      var em = el("div", "v2-empty");
      em.appendChild(el("h1", "v2-h1", "No active trips"));
      em.appendChild(el("p", "v2-sub", gArchived().length ? "Your trips are archived. Plan a new one, or reopen one from Trips." : "Plan your first trip to get started."));
      em.appendChild(btn("v2-btn full", "Plan a trip", gNewForm));
      if (gArchived().length) em.appendChild(btn("v2-btn sec full", "See archived trips", function () { gGo("trips"); }));
      wrap.appendChild(em); $("main").appendChild(gTabbar()); return;
    }
    var next = gNextTrip(), days = gDaysUntil(next), c = gCounts(next);
    // departure-day surfacing: on the day or the day before, lead with the final check
    var leave = gLeaveList(next);
    if (days != null && days >= 0 && days <= 1 && leave) {
      var open = leave.items.filter(function (i) { return i.state === "todo"; }).length;
      var dep = el("button", "v2-card"); dep.type = "button"; dep.style.cssText = "display:block;width:100%;text-align:start;cursor:pointer;background:var(--together-bg);border-color:var(--together)";
      dep.appendChild(el("div", "v2-kicker", (days === 0 ? "Leaving today" : "Leaving tomorrow") + " · " + next.name));
      dep.appendChild(el("div", "v2-h2", leave.emoji + " " + leave.name));
      dep.appendChild(el("p", "v2-sub", open ? (open + " thing" + (open === 1 ? "" : "s") + " left before you walk out the door.") : "You're all set — nothing left on this list."));
      dep.addEventListener("click", function () { gOpenList(next, leave.id); });
      wrap.appendChild(dep);
    }
    wrap.appendChild(el("div", "v2-kicker", "Next up"));
    var card = el("button", "v2-trip"); card.type = "button";
    card.appendChild(el("div", "tn", next.name));
    card.appendChild(el("div", "td", gCountdown(next) + (next.start ? " · " + next.start : "") + " · " + c.packed + "/" + c.need + " packed"));
    var pr = el("div", "v2-progress"); pr.setAttribute("role", "progressbar"); pr.setAttribute("aria-valuemin", "0"); pr.setAttribute("aria-valuemax", String(c.need)); pr.setAttribute("aria-valuenow", String(c.packed)); pr.style.margin = "12px 0 4px"; var fi = el("i"); fi.style.width = c.pct + "%"; pr.appendChild(fi); card.appendChild(pr);
    card.addEventListener("click", function () { gOpenTrip(next); });
    wrap.appendChild(card);
    var nextCd = v2Countdown(next, { mini: true }); if (nextCd) wrap.appendChild(nextCd);
    var ol = gOtherList(next);
    if (ol) wrap.appendChild(btn("v2-btn full", "Open " + ol.emoji + " " + ol.name, function () { gOpenList(next, ol.id); }));

    var others = active.filter(function (t) { return t.id !== next.id; });
    if (others.length) {
      wrap.appendChild(el("div", "v2-kicker", "Your other trips"));
      others.forEach(function (t) {
        var cc = gCounts(t); var row = el("button", "v2-trip"); row.type = "button"; row.style.background = "var(--bg)";
        row.appendChild(el("div", "tn", t.name)); row.appendChild(el("div", "td", gCountdown(t) + " · " + cc.packed + "/" + cc.need + " packed"));
        row.addEventListener("click", function () { gOpenTrip(t); }); wrap.appendChild(row);
      });
    }
    wrap.appendChild(btn("v2-btn sec full", "Plan another trip", gNewForm));
    $("main").appendChild(gTabbar());
  }

  function gDuplicateTrip(t) {
    var copy = JSON.parse(JSON.stringify(t));
    copy.id = nid(); copy.name = t.name + " (copy)"; copy.created = Date.now(); copy.packedAt = null; copy.archived = false;
    copy.start = null; copy.end = null; copy.travelDate = null;   // new dates for the new trip
    copy.lists.forEach(function (l) { l.id = nid(); l.items.forEach(function (i) { i.id = nid(); i.state = "todo"; }); });  // reset states; keep flags/qty
    S.trips.push(copy); S.curTrip = copy.id; gFix(); guestPersist(); gcat = "all"; gGo("trip");
    toast("Duplicated “" + t.name + "”. Set its dates.");
  }
  function gArchiveTrip(t) { t.archived = true; if (S.curTrip === t.id) { var a = gActive(); S.curTrip = a[0] ? a[0].id : null; } gFix(); guestPersist(); renderGuest(); toast("Archived “" + t.name + "”."); }
  function gUnarchive(t) { t.archived = false; guestPersist(); renderGuest(); }

  function renderGTrips() {
    var wrap = gShell(true); var top = gBrand(wrap, true);
    wrap.appendChild(el("h1", "v2-h1", "Trips"));
    var active = gActive();
    if (!active.length) wrap.appendChild(el("p", "v2-sub", "No active trips. Plan one below."));
    active.forEach(function (t) {
      var cc = gCounts(t); var card = el("div", "v2-card"); card.style.display = "flex"; card.style.flexDirection = "column"; card.style.gap = "10px";
      var open = el("button", "v2-trip"); open.type = "button"; open.style.cssText = "background:transparent;border:0;padding:0;text-align:start;cursor:pointer";
      open.appendChild(el("div", "tn", t.name)); open.appendChild(el("div", "td", gCountdown(t) + " · " + cc.packed + "/" + cc.need + " packed"));
      open.addEventListener("click", function () { gOpenTrip(t); }); card.appendChild(open);
      var acts = el("div"); acts.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
      acts.appendChild(btn("v2-btn sec", "Duplicate", function () { gDuplicateTrip(t); }));
      acts.appendChild(btn("v2-btn sec", "Archive", function () { gArchiveTrip(t); }));
      card.appendChild(acts); wrap.appendChild(card);
    });
    wrap.appendChild(btn("v2-btn full", "Plan a trip", gNewForm));
    var arch = gArchived();
    if (arch.length) {
      wrap.appendChild(el("div", "v2-kicker", "Archived"));
      arch.forEach(function (t) {
        var row = el("div", "v2-card"); row.style.cssText = "display:flex;align-items:center;gap:12px";
        row.appendChild(el("div", "tn", t.name)); var sp = el("div"); sp.style.flex = "1"; row.appendChild(sp);
        row.appendChild(btn("v2-btn sec", "Reopen", function () { gUnarchive(t); }));
        wrap.appendChild(row);
      });
    }
    $("main").appendChild(gTabbar());
  }
  function renderGTrip() {
    var t = gTrip(); var wrap = gShell(true); var top = gBrand(wrap, true);
    top.insertBefore(btnIcon(G.back, "Back", function () { gGo("home"); }), top.firstChild);
    wrap.appendChild(el("h1", "v2-h1", t.name));
    var c = gCounts(t);
    wrap.appendChild(v2Countdown(t, { onSet: gSetDate, onClear: gClearDate, counts: { t: c.need - c.packed } }));
    var prow = el("div"); prow.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;gap:10px";
    prow.appendChild(el("span", "v2-sub", c.packed + " of " + c.need + " packed"));
    prow.appendChild(el("span", "v2-pct", c.pct + "% packed")); wrap.appendChild(prow);
    var pr = el("div", "v2-progress"); pr.setAttribute("role", "progressbar"); pr.setAttribute("aria-valuemin", "0"); pr.setAttribute("aria-valuemax", String(c.need)); pr.setAttribute("aria-valuenow", String(c.packed)); var fi = el("i"); fi.style.width = c.pct + "%"; pr.appendChild(fi); wrap.appendChild(pr);
    // list tabs
    var tabs = el("div", "v2-listtabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Lists");
    var mk = function (id, label, count) { var b = el("button", "v2-tab"); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", gcat === id ? "true" : "false"); b.appendChild(document.createTextNode(label)); if (count != null) { var cc = el("span", "c", count); b.appendChild(cc); } b.addEventListener("click", function () { gcat = id; renderGuest(); }); return b; };
    tabs.appendChild(mk("all", "All"));
    t.lists.forEach(function (l) { var lc = l.items.filter(function (i) { return i.state === "packed"; }).length; tabs.appendChild(mk(l.id, (l.emoji ? l.emoji + " " : "") + l.name, lc + "/" + l.items.length)); });
    wrap.appendChild(tabs);
    // items
    var lists = gcat === "all" ? t.lists : t.lists.filter(function (l) { return l.id === gcat; });
    lists.forEach(function (l) {
      if (gcat === "all") { var h = el("div", "v2-listhead"); h.style.marginTop = "6px"; h.appendChild(el("h2", "v2-h2", (l.emoji ? l.emoji + " " : "") + l.name)); wrap.appendChild(h); }
      var ul = el("ul", "v2-rows"); ul.setAttribute("aria-label", l.name);
      if (!l.items.length) { var li0 = el("li"); li0.style.cssText = "background:var(--bg);padding:14px 16px;color:var(--slate);font-size:14px"; li0.textContent = "Nothing here yet."; ul.appendChild(li0); }
      l.items.forEach(function (it) {
        var li = el("li", "v2-item" + (it.state === "packed" ? " done" : it.state === "skip" ? " skip" : ""));
        var chk = el("button", "v2-check"); chk.type = "button"; chk.setAttribute("role", "checkbox"); chk.setAttribute("aria-checked", it.state === "packed" ? "true" : "false"); chk.setAttribute("aria-label", (it.state === "packed" ? "Packed: " : "Pack: ") + it.name);
        var bx = el("span", "box"); if (it.state === "packed") bx.appendChild(gsvg(G.tick, 3)); chk.appendChild(bx);
        chk.addEventListener("click", function () { gToggleItem(l.id, it.id); });
        var lab = el("button", "label"); lab.type = "button"; lab.setAttribute("aria-label", it.name);
        if (it.mnf) { var st = el("span", "star"); st.setAttribute("aria-label", "Must not forget"); st.appendChild(gsvg(G.star, 1.6)); lab.appendChild(st); }
        if (it.emoji) lab.appendChild(el("span", "emoji", it.emoji));
        lab.appendChild(el("span", "nm", it.name));
        if (it.qty && it.qty > 1) lab.appendChild(el("span", "qty", "×" + it.qty));
        var skip = el("button", "v2-skip"); skip.type = "button"; skip.setAttribute("aria-pressed", it.state === "skip" ? "true" : "false"); skip.setAttribute("aria-label", "Not needed: " + it.name); skip.title = "Not needed"; skip.appendChild(gsvg(G.skip));
        skip.addEventListener("click", function () { gSkipItem(l.id, it.id); });
        li.appendChild(chk); li.appendChild(lab); li.appendChild(skip); ul.appendChild(li);
      });
      wrap.appendChild(ul);
    });
    // quick add (to the current list, or the first list when on "All")
    var target = gcat === "all" ? t.lists[0] : t.lists.filter(function (l) { return l.id === gcat; })[0];
    if (target) {
      var form = document.createElement("form"); form.className = "v2-add";
      var inp = el("input", "v2-input"); inp.id = "gNewItem"; inp.maxLength = 80; inp.autocomplete = "off"; inp.placeholder = "Add to " + target.name + "…"; inp.setAttribute("aria-label", "New item");
      form.appendChild(inp); var add = el("button", "v2-btn", "Add"); add.type = "submit"; form.appendChild(add);
      form.addEventListener("submit", function (ev) { ev.preventDefault(); var v = inp.value.trim(); if (!v) { inp.focus(); return; } inp.value = ""; gAddItem(target.id, v); var n = $("gNewItem"); if (n) n.focus(); });
      wrap.appendChild(form);
    }
    $("main").appendChild(gTabbar());
  }
  function btnIcon(d, label, fn) { var b = el("button", "v2-link"); b.type = "button"; b.setAttribute("aria-label", label); b.style.cssText = "display:flex;align-items:center;justify-content:center;min-width:var(--tap);min-height:var(--tap);padding:0;margin-inline-start:-6px"; b.appendChild(gsvg(d)); if (fn) b.addEventListener("click", fn); return b; }

  /* ================= service worker ================= */
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    var updating = false, reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!updating || reloaded) return; reloaded = true;
      setTimeout(function () { location.reload(); }, 800);   // let the "Updated" toast show, then pick up the new assets
    });
    navigator.serviceWorker.register("/sw.js").then(function (reg) {
      function activate(sw) { updating = true; toast("Updated to the latest version."); sw.postMessage({ type: "SKIP_WAITING" }); }
      if (reg.waiting && navigator.serviceWorker.controller) activate(reg.waiting);
      reg.addEventListener("updatefound", function () {
        var sw = reg.installing; if (!sw) return;
        sw.addEventListener("statechange", function () { if (sw.state === "installed" && navigator.serviceWorker.controller) activate(sw); });
      });
    }).catch(function () { });
  }
  registerSW();
})();
