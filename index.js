/**
 * Render HTTPS -> HTTP Bridge
 * - Web calls this service over HTTPS
 * - This service forwards the request to your HTTP API (RDP)
 * - Returns the upstream response as-is
 *
 * Target (RDP):
 *   http://194.59.31.166:5127
 *
 * Security:
 *   Requires header: x-bridge-key: <BRIDGE_KEY>
 */

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createProxyMiddleware } = require("http-proxy-middleware");

dotenv.config();

const app = express();

// Render sets PORT automatically
const PORT = process.env.PORT || 10000;

// Your RDP API (HTTP)
const TARGET_API = process.env.TARGET_API || "http://194.59.31.166:5127";

// Simple shared secret (header)
const BRIDGE_KEY = process.env.BRIDGE_KEY || "change-me";

// Optional: Restrict CORS to your domains (comma-separated). If empty -> "*"
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

// Request body parsing (needed to re-stream JSON bodies through the proxy)
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// CORS
app.use(cors({
  origin: function(origin, cb) {
    // allow requests with no origin (curl, server-to-server)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.length === 0) return cb(null, true);
    return cb(null, ALLOWED_ORIGINS.includes(origin));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-bridge-key"],
  exposedHeaders: ["Content-Type", "Content-Length"]
}));

// Health check (must be BEFORE proxy middleware)
app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    target: TARGET_API
  });
});

// Bridge key check (protects from being an open proxy)
app.use((req, res, next) => {
  const key = req.headers["x-bridge-key"];
  if (key !== BRIDGE_KEY) {
    return res.status(401).json({ error: "INVALID_BRIDGE_KEY" });
  }
  next();
});

// Proxy all remaining routes to TARGET_API
app.use(
  "/",
  createProxyMiddleware({
    target: TARGET_API,
    changeOrigin: true,
    secure: false, // upstream is HTTP
    logLevel: process.env.PROXY_LOG_LEVEL || "warn",
    proxyTimeout: 30_000,
    timeout: 30_000,

    /**
     * Re-send parsed JSON body to upstream when present.
     * Without this, express.json() consumes the stream and upstream would receive an empty body.
     */
    onProxyReq: (proxyReq, req, res) => {
      // Only re-write body for requests that can have one
      const method = (req.method || "").toUpperCase();
      if (method === "GET" || method === "HEAD") return;

      if (req.body && Object.keys(req.body).length > 0) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader("Content-Type", "application/json");
        proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    },

    onError: (err, req, res) => {
      console.error("Proxy error:", err && err.message ? err.message : err);
      if (!res.headersSent) {
        res.status(502).json({
          error: "RDP_UNREACHABLE",
          detail: (err && err.message) ? err.message : String(err)
        });
      }
    }
  })
);

app.listen(PORT, () => {
  console.log(`🔁 Render Bridge running on port ${PORT}`);
  console.log(`➡️ Forwarding to ${TARGET_API}`);
  if (ALLOWED_ORIGINS.length) console.log(`🔒 CORS allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
