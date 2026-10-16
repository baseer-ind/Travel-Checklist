// Local development server: serves public/ and routes /api/* to lib/app.js with a JSON-file store.
// Usage: node server.js   (or npm run dev)   → http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");
const { createApp } = require("./lib/app");

const env = Object.assign({
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "change-me-admin",
  FAMILY_CODE: "family",
}, process.env);

const PORT = Number(env.PORT || 3000);
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2" };

function createServer(e) {
  const app = createApp(e || env);
  const PUB = (e && e.PUBLIC_DIR) || PUBLIC;   // tests can point this at a temp copy to simulate an update
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/")) return app(req, res);
    let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p === "/" || p === "\\") p = "/index.html";
    const file = path.join(PUB, p);
    if (!file.startsWith(PUB)) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.statusCode = 404; res.setHeader("Content-Type", "text/plain"); return res.end("Not found"); }
      res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(data);
    });
  });
}

if (require.main === module) {
  createServer(env).listen(PORT, () => {
    console.log("Family Travel Checklist → http://localhost:" + PORT);
    console.log("Admin: " + env.ADMIN_USERNAME + " / " + env.ADMIN_PASSWORD + "   Family code: " + env.FAMILY_CODE);
  });
}
module.exports = { createServer };
