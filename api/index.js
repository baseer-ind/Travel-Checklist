// Vercel serverless entry point: every /api/* request is routed here (see vercel.json).
const { createApp } = require("../lib/app");
module.exports = createApp(process.env);
