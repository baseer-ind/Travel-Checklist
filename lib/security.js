// Password hashing (scrypt, salted) and signed login cookies (HMAC-SHA256). Node built-ins only.
const crypto = require("crypto");

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 32;

function scrypt(pw, salt) {
  return new Promise((res, rej) => crypto.scrypt(String(pw).normalize("NFC"), salt, KEYLEN, SCRYPT, (e, k) => (e ? rej(e) : res(k))));
}
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt);
  return "scrypt$" + SCRYPT.N + "$" + salt.toString("base64") + "$" + key.toString("base64");
}
async function verifyPassword(pw, stored) {
  try {
    const [algo, , salt, key] = String(stored || "").split("$");
    if (algo !== "scrypt" || !salt || !key) return false;
    const want = Buffer.from(key, "base64");
    const got = await scrypt(pw, Buffer.from(salt, "base64"));
    return want.length === got.length && crypto.timingSafeEqual(want, got);
  } catch (e) { return false; }
}
// Spend the same time on an unknown user as on a real one, so names can't be guessed by timing.
const DUMMY = Buffer.alloc(16);
async function fakeVerify(pw) { try { await scrypt(pw || "x", DUMMY); } catch (e) {} }

function hmac(secret, data) { return crypto.createHmac("sha256", secret).update(data).digest("base64url"); }
function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + hmac(secret, body);
}
function verify(token, secret) {
  if (typeof token !== "string") return null;
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const body = token.slice(0, i), sig = token.slice(i + 1);
  const want = hmac(secret, body);
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return p && typeof p.exp === "number" && p.exp > Date.now() ? p : null;
  } catch (e) { return null; }
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function pick(chars, n) { let o = ""; const bytes = crypto.randomBytes(n); for (let i = 0; i < n; i++) o += chars[bytes[i] % chars.length]; return o; }
const randomPassword = () => pick("abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", 10);
const randomCode = (n) => pick("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", n);

module.exports = { crypto, hashPassword, verifyPassword, fakeVerify, sign, verify, safeEqual, randomPassword, randomCode };
