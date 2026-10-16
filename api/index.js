// Vercel serverless entry point: every /api/* request is routed here (see vercel.json).
// The app lives in ../lib; load it lazily and surface any init/handler error as readable JSON
// instead of an opaque FUNCTION_INVOCATION_FAILED, so a misconfigured deploy is diagnosable.
let handler = null, initError = null;
function getHandler() {
  if (handler || initError) return handler;
  try { handler = require("../lib/app").createApp(process.env); }
  catch (e) { initError = e; }
  return handler;
}
function fail(res, label, e) {
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ error: label, message: String((e && e.message) || e), at: String(((e && e.stack) || "").split("\n")[1] || "").trim() }));
}
module.exports = function (req, res) {
  const h = getHandler();
  if (!h) return fail(res, "Server init failed", initError);
  try {
    const r = h(req, res);
    if (r && typeof r.catch === "function") r.catch((e) => { try { if (!res.headersSent) fail(res, "Request failed", e); } catch (_) {} });
    return r;
  } catch (e) { return fail(res, "Request threw", e); }
};
