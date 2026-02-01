/**
 * Render HTTPS -> HTTP Bridge
 * ----------------------------------------------------
 * - La web (HTTPS) llama a este servicio
 * - Este servicio reenvía la request a tu API HTTP (RDP)
 * - Devuelve la respuesta TAL CUAL viene del RDP
 *
 * Target (RDP):
 *   http://194.59.31.166:5127
 *
 * Seguridad:
 *   Requiere header:
 *     x-bridge-key: <BRIDGE_KEY>
 *
 * Ventaja:
 *   - Permite que una web HTTPS hable con un backend HTTP
 *   - Render actúa como puente seguro
 */

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createProxyMiddleware } = require("http-proxy-middleware");

// ----------------------------------------------------
// Load .env
// ----------------------------------------------------
dotenv.config();

const app = express();

// ----------------------------------------------------
// Render asigna el PORT automáticamente
// ----------------------------------------------------
const PORT = process.env.PORT || 10000;

// ----------------------------------------------------
// API destino (tu RDP en HTTP)
// ----------------------------------------------------
const TARGET_API = process.env.TARGET_API || "http://194.59.31.166:5127";

// ----------------------------------------------------
// Clave compartida (DEBE coincidir con el frontend)
// ----------------------------------------------------
const BRIDGE_KEY = process.env.BRIDGE_KEY || "change-me";

// ----------------------------------------------------
// CORS opcional (dominios permitidos)
// Si está vacío => permite todos
// ----------------------------------------------------
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// ----------------------------------------------------
// Body parsing
// IMPORTANTE: necesario para reenviar JSON al RDP
// ----------------------------------------------------
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ----------------------------------------------------
// CORS
// ----------------------------------------------------
app.use(
  cors({
    origin: function (origin, cb) {
      // Permite requests sin origin (curl, server-to-server)
      if (!origin) return cb(null, true);

      // Si no hay lista, permite todo
      if (ALLOWED_ORIGINS.length === 0) return cb(null, true);

      return cb(null, ALLOWED_ORIGINS.includes(origin));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-bridge-key"],
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
    bridge_key_configured: !!BRIDGE_KEY
  });
});

// ----------------------------------------------------
// VALIDACIÓN DE x-bridge-key
// Da errores EXPLICATIVOS (no ciegos)
// ----------------------------------------------------
app.use((req, res, next) => {
  const receivedKey = req.headers["x-bridge-key"];

  // ❌ Header NO enviado
  if (!receivedKey) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      reason: "MISSING_HEADER",
      message: "Required header 'x-bridge-key' was not sent",
      expected_header: "x-bridge-key",
      example: "x-bridge-key: YOUR_SHARED_SECRET",
      hint: "Revisa si el interceptor del frontend está activo"
    });
  }

  // ❌ Header enviado pero incorrecto
  if (receivedKey !== BRIDGE_KEY) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      reason: "INVALID_HEADER_VALUE",
      message: "The provided 'x-bridge-key' is invalid",
      hint: "La clave no coincide con la configurada en Render (env BRIDGE_KEY)"
    });
  }

  // ✅ Todo correcto
  next();
});

// ----------------------------------------------------
// Proxy principal: TODO lo demás va al RDP
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
     * IMPORTANTE:
     * express.json() consume el body,
     * así que hay que reenviarlo manualmente al RDP
     */
    onProxyReq: (proxyReq, req, _res) => {
      const method = (req.method || "").toUpperCase();

      // GET / HEAD no llevan body
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

  if (ALLOWED_ORIGINS.length) {
    console.log(`🔒 CORS allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
  } else {
    console.log("🌐 CORS: all origins allowed");
  }
});
