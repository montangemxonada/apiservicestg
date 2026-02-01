# Render HTTP Bridge (HTTPS -> HTTP)

Este servicio es un **puente**: tu web (HTTPS) llama a Render, y Render reenvía la petición a tu API en tu RDP (HTTP) y devuelve la respuesta.

## Target (por defecto)
- `http://194.59.31.166:5127`

Puedes cambiarlo con `TARGET_API`.

---

## Variables de entorno (Render)
- `BRIDGE_KEY` (obligatoria) → clave que tu web debe mandar en el header `x-bridge-key`
- `TARGET_API` (opcional)
- `ALLOWED_ORIGINS` (opcional, recomendado) → restringe CORS a tus dominios

---

## Endpoints
### Health check
`GET /health`

### Proxy (todo lo demás)
Cualquier ruta que llames se reenviará al RDP.

Ejemplo:
- Web → `https://TU_BRIDGE.onrender.com/v1/apps/yapeks/popup/random?page=multiple`
- Render → `http://194.59.31.166:5127/v1/apps/yapeks/popup/random?page=multiple`

**Header requerido:**
- `x-bridge-key: <BRIDGE_KEY>`

---

## Deploy en Render
1) Subes este repo a GitHub
2) En Render: New → Web Service → conecta repo
3) Build: `npm install`
4) Start: `npm start`
5) Env: `BRIDGE_KEY=...` (y opcional `ALLOWED_ORIGINS=...`)
