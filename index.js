/**
 * Render HTTPS -> HTTP Bridge (OPEN)
 * ----------------------------------------------------
 * - La web (HTTPS) llama a este servicio
 * - Este servicio reenvía la request a tu API HTTP (RDP)
 * - Devuelve la respuesta TAL CUAL viene del RDP
 *
 * Target (RDP):
 *   http://194.59.31.166:5127
 *
 * ⚠️ SEGURIDAD:
 *   - NO usa x-bridge-key
 *   - NO hay autenticación
 *   - Bridge completamente abierto
 */

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createProxyMiddleware } = require("http-proxy-middleware");

// ----------------------------------------------------
// Load .env (solo para TARGET_API si quieres)
// ----------------------------------------------------
dotenv.config();

const app = express();

// Render asigna PORT automáticamente
const PORT = process.env.PORT || 10000;

// API destino (tu RDP HTTP)
const TARGET_API = process.env.TARGET_API || "http://194.59.31.166:5127";

// ----------------------------------------------------
// Body parsing (necesario para POST/PUT/PATCH)
// ----------------------------------------------------
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ----------------------------------------------------
// CORS (ABIERTO)
// ----------------------------------------------------
app.use(
  cors({
    origin: true, // permite todos los orígenes
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Type", "Content-Length"]
  })
);

// ----------------------------------------------------
// Health check (NO pasa por el proxy)
// ----------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    target: TARGET_API,
    auth: "disabled"
  });
});

// ----------------------------------------------------
// Proxy principal: TODO va directo al RDP
// ----------------------------------------------------
app.use(
  "/",
  createProxyMiddleware({
    target: TARGET_API,
    changeOrigin: true,
    secure: false, // upstream es HTTP
    logLevel: process.env.PROXY_LOG_LEVEL || "warn",
    proxyTimeout: 30_000,
    timeout: 30_000,

    /**
     * Reenviar body JSON al RDP
     * (express.json consume el stream)
     */
    onProxyReq: (proxyReq, req, _res) => {
      const method = (req.method || "").toUpperCase();

      if (method === "GET" || method === "HEAD") return;

      if (req.body && Object.keys(req.body).length > 0) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader("Content-Type", "application/json");
        proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    },

    onError: (err, _req, res) => {
      console.error("🚨 Proxy error:", err?.message || err);

      if (!res.headersSent) {
        res.status(502).json({
          error: "RDP_UNREACHABLE",
          message: "Could not reach RDP backend",
          detail: err?.message || String(err)
        });
      }
    }
  })
);

// ----------------------------------------------------
// Start server
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`🔁 Render Bridge running on port ${PORT}`);
  console.log(`➡️ Forwarding to ${TARGET_API}`);
  console.log("⚠️ AUTH DISABLED (OPEN BRIDGE)");
});
