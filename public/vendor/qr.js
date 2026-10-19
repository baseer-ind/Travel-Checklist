/*! BaggoQR — a tiny QR Code generator (byte mode, EC level L, versions 1–5).
 * Vendored static file (no npm runtime dependency). MIT License, © Baggo.
 * Implements ISO/IEC 18004 byte-mode encoding, Reed–Solomon ECC over GF(256),
 * the function patterns, data masking (8 masks, penalty scoring) and format info.
 * Exposes window.BaggoQR.{ matrix(text), canvas(text, px) }.
 */
(function () {
  "use strict";
  // ---- GF(256), primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11d) ----
  var EXP = [], LOG = [];
  (function () { var x = 1; for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }
  function rsGen(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var c = EXP[i], ng = new Array(g.length + 1);
      for (var k = 0; k <= g.length; k++) ng[k] = ((k > 0 ? g[k - 1] : 0)) ^ (k < g.length ? mul(g[k], c) : 0);
      g = ng;
    }
    return g.reverse();   // gen[0] = leading (x^n) coefficient = 1
  }
  function ecc(data, n) {
    var gen = rsGen(n), res = data.concat(new Array(n).fill(0));
    for (var i = 0; i < data.length; i++) { var coef = res[i]; if (coef !== 0) for (var j = 0; j < gen.length; j++) res[i + j] ^= mul(gen[j], coef); }
    return res.slice(data.length);
  }
  // ---- Version capacities for EC level L, single block ----
  //                 v1   v2   v3   v4    v5
  var TOTAL = { 1: 26, 2: 44, 3: 70, 4: 100, 5: 134 };
  var ECCW = { 1: 7, 2: 10, 3: 15, 4: 20, 5: 26 };
  var ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30] };
  function dataCW(v) { return TOTAL[v] - ECCW[v]; }

  function toBytes(str) {
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else if (c >= 0xd800 && c <= 0xdbff) { var c2 = str.charCodeAt(++i); var cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff); out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); }
      else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    }
    return out;
  }
  function chooseVersion(nbytes) {
    for (var v = 1; v <= 5; v++) { if (nbytes + 2 <= dataCW(v)) return v; }   // +2 ≈ mode nibble + 8-bit count
    return 0;
  }
  function encodeData(bytes, v) {
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); }
    put(0x4, 4);              // byte mode
    put(bytes.length, 8);     // char count (8 bits for v1–9, byte mode)
    for (var i = 0; i < bytes.length; i++) put(bytes[i], 8);
    var cap = dataCW(v) * 8;
    for (i = 0; i < 4 && bits.length < cap; i++) bits.push(0);   // terminator
    while (bits.length % 8 !== 0) bits.push(0);
    var cws = [];
    for (i = 0; i < bits.length; i += 8) { var b = 0; for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; cws.push(b); }
    var pad = [0xec, 0x11], p = 0;
    while (cws.length < dataCW(v)) cws.push(pad[p++ % 2]);
    return cws.concat(ecc(cws, ECCW[v]));
  }
  // ---- Matrix ----
  function build(v) {
    var n = v * 4 + 17, m = [], fn = [], r, c;
    for (r = 0; r < n; r++) { m[r] = []; fn[r] = []; for (c = 0; c < n; c++) { m[r][c] = 0; fn[r][c] = false; } }
    function set(r, c, val) { m[r][c] = val ? 1 : 0; fn[r][c] = true; }
    function finder(r0, c0) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var r = r0 + dr, c = c0 + dc; if (r < 0 || r >= n || c < 0 || c >= n) continue;
        var inB = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        var ring = (dr === 0 || dr === 6 || dc === 0 || dc === 6);
        var core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        set(r, c, inB && (ring || core) ? 1 : 0);
      }
    }
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
    for (c = 8; c < n - 8; c++) { set(6, c, c % 2 === 0 ? 1 : 0); set(c, 6, c % 2 === 0 ? 1 : 0); }   // timing
    var a = ALIGN[v];
    for (var i = 0; i < a.length; i++) for (var j = 0; j < a.length; j++) {
      var ar = a[i], ac = a[j];
      if ((ar <= 7 && ac <= 7) || (ar <= 7 && ac >= n - 8) || (ar >= n - 8 && ac <= 7)) continue;   // overlaps a finder
      for (var dr2 = -2; dr2 <= 2; dr2++) for (var dc2 = -2; dc2 <= 2; dc2++) {
        var rr = ar + dr2, cc = ac + dc2, edge = Math.max(Math.abs(dr2), Math.abs(dc2));
        set(rr, cc, (edge === 2 || edge === 0) ? 1 : 0);
      }
    }
    set(n - 8, 8, 1);   // dark module
    // reserve format-info areas (filled later)
    for (i = 0; i <= 8; i++) { if (!fn[8][i]) fn[8][i] = true; if (!fn[i][8]) fn[i][8] = true; }
    for (i = 0; i < 8; i++) { fn[8][n - 1 - i] = true; fn[n - 1 - i][8] = true; }
    return { m: m, fn: fn, n: n };
  }
  function placeData(G, cws) {
    var bits = [], i, k;
    for (i = 0; i < cws.length; i++) for (k = 7; k >= 0; k--) bits.push((cws[i] >> k) & 1);
    var n = G.n, m = G.m, fn = G.fn, idx = 0, upward = true;
    for (var col = n - 1; col > 0; col -= 2) {
      if (col === 6) col = 5;   // skip the vertical timing column
      for (var t = 0; t < n; t++) {
        var row = upward ? n - 1 - t : t;
        for (var s = 0; s < 2; s++) {
          var c = col - s;
          if (!fn[row][c]) { m[row][c] = (idx < bits.length) ? bits[idx] : 0; idx++; }
        }
      }
      upward = !upward;
    }
  }
  function maskFn(k) {
    return [
      function (i, j) { return (i + j) % 2 === 0; },
      function (i) { return i % 2 === 0; },
      function (i, j) { return j % 3 === 0; },
      function (i, j) { return (i + j) % 3 === 0; },
      function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0; },
      function (i, j) { return (i * j) % 2 + (i * j) % 3 === 0; },
      function (i, j) { return ((i * j) % 2 + (i * j) % 3) % 2 === 0; },
      function (i, j) { return ((i + j) % 2 + (i * j) % 3) % 2 === 0; }
    ][k];
  }
  function applyMask(G, k) {
    var f = maskFn(k), out = [], n = G.n;
    for (var r = 0; r < n; r++) { out[r] = []; for (var c = 0; c < n; c++) out[r][c] = G.m[r][c] ^ (!G.fn[r][c] && f(r, c) ? 1 : 0); }
    return out;
  }
  function formatBits(mask) {
    var data = (1 << 3) | mask;          // EC level L = 0b01 → (1<<3); 3-bit mask
    var v = data << 10;
    for (var i = 14; i >= 10; i--) if ((v >> i) & 1) v ^= (0x537 << (i - 10));
    return ((data << 10) | (v & 0x3ff)) ^ 0x5412;
  }
  function placeFormat(mat, fn, n, mask) {
    var bits = formatBits(mask);
    function b(i) { return (bits >> (14 - i)) & 1; }   // format info is placed MSB-first (bit 14 at the first cell)
    for (var i = 0; i <= 5; i++) { mat[8][i] = b(i); mat[i][8] = b(14 - i); }
    mat[8][7] = b(6); mat[8][8] = b(7); mat[7][8] = b(8);
    for (i = 9; i <= 14; i++) mat[14 - i][8] = b(i);
    for (i = 8; i <= 14; i++) mat[8][n - 15 + i] = b(i);
    for (i = 0; i <= 7; i++) mat[n - 1 - i][8] = b(i);
    void fn;
  }
  function penalty(mat, n) {
    var p = 0, r, c, run, i, j;
    for (r = 0; r < n; r++) { run = 1; for (c = 1; c < n; c++) { if (mat[r][c] === mat[r][c - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; } else run = 1; } }
    for (c = 0; c < n; c++) { run = 1; for (r = 1; r < n; r++) { if (mat[r][c] === mat[r - 1][c]) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; } else run = 1; } }
    for (r = 0; r < n - 1; r++) for (c = 0; c < n - 1; c++) { var v = mat[r][c]; if (v === mat[r][c + 1] && v === mat[r + 1][c] && v === mat[r + 1][c + 1]) p += 3; }
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function match(arr, get) { for (var s = 0; s + 11 <= n; s++) { var ok1 = true, ok2 = true; for (var x = 0; x < 11; x++) { var val = get(s + x); if (val !== pat1[x]) ok1 = false; if (val !== pat2[x]) ok2 = false; } if (ok1 || ok2) p += 40; } }
    for (r = 0; r < n; r++) match(0, function (x) { return mat[r][x]; });
    for (c = 0; c < n; c++) match(0, function (x) { return mat[x][c]; });
    var dark = 0; for (r = 0; r < n; r++) for (c = 0; c < n; c++) dark += mat[r][c];
    var pct = dark * 100 / (n * n); p += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return p;
  }
  function matrix(text) {
    var bytes = toBytes(String(text));
    var v = chooseVersion(bytes.length);
    if (!v) { bytes = toBytes(String(text).slice(0, 100)); v = 5; }   // extreme fallback
    var cws = encodeData(bytes, v);
    var G = build(v);
    placeData(G, cws);
    var best = null, bestMask = 0, bestP = Infinity;
    for (var k = 0; k < 8; k++) {
      var mm = applyMask(G, k);
      placeFormat(mm, G.fn, G.n, k);
      var pen = penalty(mm, G.n);
      if (pen < bestP) { bestP = pen; best = mm; bestMask = k; }
    }
    return { modules: best, size: G.n, version: v, mask: bestMask };
  }
  function canvas(text, px) {
    var q = matrix(text), n = q.size, quiet = 4, total = n + quiet * 2;
    px = px || 160; var scale = Math.max(1, Math.floor(px / total)), dim = scale * total;
    var cv = document.createElement("canvas"); cv.width = cv.height = dim;
    cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "QR code");
    var ctx = cv.getContext("2d");
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = "#171A1F";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.modules[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    return cv;
  }
  window.BaggoQR = { matrix: matrix, canvas: canvas };
})();
