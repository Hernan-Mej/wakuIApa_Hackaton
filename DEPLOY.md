# Deploy WakuAIpa (free tier)

| Pieza | Plataforma | Costo |
|---|---|---|
| Frontend (Vite SPA) | Vercel | $0 (unlimited) |
| Backend (FastAPI + MCP) | Railway | $0–$5/mes (free $5 credit) |
| MySQL | Railway (incluido) | $0 (parte del credit) |
| Redis (cache NASA) | Upstash | $0 (10k req/día) |
| LM Studio | ngrok (local) | $0 |

Stack monorepo — Vercel y Railway entienden subcarpetas (`frontend/` y `backend/`).

---

## 1) Subir el código a GitHub

Si todavía no tenés repo:
```bash
git init
git add .
git commit -m "Initial WakuAIpa commit"
gh repo create wakuaipa --public --source=. --push
```

(o creá el repo en github.com y `git remote add origin … && git push -u origin main`)

---

## 2) Redis en Upstash

1. [console.upstash.com](https://console.upstash.com) → Create Database (Global, free tier)
2. Copia el `Redis URL` con formato `rediss://default:PASSWORD@host:6379` (TLS)
3. Guardalo — lo necesitás para Railway

---

## 3) Backend + MySQL en Railway

### a. Crear el proyecto

1. Entrá a [railway.com/new](https://railway.com/new) → **Deploy from GitHub repo** → elegí tu repo
2. Railway detecta varios servicios. Borrá los que no quieras dejar; el nuestro es **solo el backend**.
3. En el servicio del backend: **Settings → Source → Root Directory** = `backend`

Railway detecta el `Dockerfile` y `railway.json` automáticamente.

### b. Agregar MySQL

1. En el mismo proyecto → **+ New** → **Database** → **MySQL**
2. Railway inyecta automáticamente la variable `MYSQL_URL` (junto con `MYSQLHOST`, `MYSQLUSER`, etc.)

### c. Configurar variables de entorno del backend

En el servicio backend → **Variables** → agregá:

```bash
# Conexión a la DB Railway. ${{MySQL.MYSQL_URL}} resuelve la URL interna del MySQL del mismo proyecto.
# Convertimos el formato `mysql://` a `mysql+pymysql://` con un sed inline al startup.
DATABASE_URL=${{MySQL.MYSQL_URL}}?charset=utf8mb4

# Auth
JWT_SECRET=<generá un random de 64 chars — `openssl rand -hex 32`>
JWT_EXPIRE_MINUTES=10080

# Redis (Upstash) — usar rediss:// para TLS
REDIS_URL=rediss://default:PASSWORD@host:6379

# LM Studio expuesto por tu ngrok local
LMSTUDIO_URL=https://florinda-cislunar-attemptingly.ngrok-free.dev/v1
LMSTUDIO_MODEL=qwen/qwen3-vl-4b
LMSTUDIO_TIMEOUT=180
LMSTUDIO_MAX_TOKENS=2500

# CORS: agregá tu URL de Vercel cuando la tengas (paso 4)
CORS_ORIGINS=["https://TU-PROYECTO.vercel.app"]
```

⚠️ **Nota sobre `DATABASE_URL`**: SQLAlchemy/SQLModel requiere prefijo `mysql+pymysql://`,
no `mysql://`. Si Railway te da `mysql://...`, agregá esta línea en `backend/app/core/database.py`
ANTES de crear el engine, o cambialo a `DATABASE_URL` directamente con `mysql+pymysql://`:

```python
url = settings.database_url.replace("mysql://", "mysql+pymysql://", 1)
engine = create_engine(url, ...)
```

### d. Inicializar tablas + seed

Una vez que el deploy esté UP, abrí el **shell del servicio** (Railway → tu servicio → ⋮ → Shell) y corré:

```bash
python -m app.seeds.seed --reset --with-chat
```

### e. Generar dominio público

Railway → tu servicio → **Settings → Networking → Generate Domain**. Te queda algo como
`https://wakuaipa-backend.up.railway.app`. Copialo — lo necesita el frontend.

Probá que funciona: `https://wakuaipa-backend.up.railway.app/api/health` debería devolver `{"status":"ok"}`.

---

## 4) Frontend en Vercel

1. [vercel.com/new](https://vercel.com/new) → importá tu repo
2. **Root Directory** = `frontend`
3. **Framework Preset**: Vite (auto-detectado)
4. **Environment Variables** → agregá:
   ```
   VITE_API_URL=https://wakuaipa-backend.up.railway.app
   ```
5. **Deploy**

Vercel te asigna `https://wakuaipa.vercel.app`. Copiá esa URL y volvé al backend en Railway
para **agregarla a `CORS_ORIGINS`**:

```
CORS_ORIGINS=["https://wakuaipa.vercel.app"]
```

(El regex `https://.*\.vercel\.app` que ya viene por default acepta también los preview URLs
de Vercel cada vez que pusheás a una branch.)

---

## 5) LM Studio + ngrok

En tu máquina local con LM Studio corriendo:

```bash
# Cargá el modelo qwen/qwen3-vl-4b en LM Studio → Start Server (puerto 1234)
ngrok http 1234
```

Copiá la URL pública (ej. `https://florinda-cislunar-attemptingly.ngrok-free.dev`) y poné en Railway:
```
LMSTUDIO_URL=https://florinda-cislunar-attemptingly.ngrok-free.dev/v1
```

⚠️ El URL de ngrok-free cambia cada vez que reinicies. Si querés URL estable, considerá:
- ngrok paid ($8/mes con dominio fijo)
- Cloudflare Tunnel (free con dominio fijo si tenés dominio en Cloudflare)
- localtunnel / serveo (alternativas free pero menos estables)

---

## 6) MCP server en producción

El endpoint `GET /sse` queda público en tu Railway domain:
`https://wakuaipa-backend.up.railway.app/sse`

Para conectarlo en **Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "wakuaipa": {
      "url": "https://wakuaipa-backend.up.railway.app/sse",
      "transport": "sse"
    }
  }
}
```

Ahora cualquiera que use Claude con tu MCP cargado puede consumir las 9 tools
desde internet, llamando indirectamente a tu LM Studio local vía ngrok.

---

## Checklist post-deploy

- [ ] `https://wakuaipa-backend.up.railway.app/api/health` → `{"status":"ok"}`
- [ ] `https://wakuaipa-backend.up.railway.app/docs` → Swagger UI funcional
- [ ] `https://wakuaipa.vercel.app` carga el login
- [ ] Login con `hoteltaroa@riohacha.demo` / `demo1234` funciona
- [ ] El chat responde (ngrok está activo + LM Studio cargado)
- [ ] Conectaste el MCP en Claude Desktop y ves 9 tools

## Limitaciones del free tier

- **Railway $5 credit**: alcanza para 1 instancia 0.5GB RAM corriendo 24/7. Si te
  acercás al límite, dormí el servicio cuando no lo uses.
- **Upstash 10k req/día**: más que suficiente para el cache de NASA POWER (~50 keys distintas/día).
- **Vercel**: sin límite real para SPAs estáticas; bandwidth 100GB/mes.
- **ngrok free**: URL cambia, máx 1 túnel a la vez.

## Troubleshooting

- **Backend 500 al arrancar**: revisá los logs en Railway. Suele ser `DATABASE_URL` mal
  formateada (necesita `mysql+pymysql://`).
- **CORS error en frontend**: agregá tu dominio Vercel a `CORS_ORIGINS` en Railway env vars.
- **Chat timeout**: LM Studio está down o ngrok cambió de URL. Verificá `LMSTUDIO_URL`.
- **MCP /sse no conecta**: SSE necesita HTTP/1.1 con keep-alive. Railway lo soporta — verificá
  que el cliente MCP esté usando el dominio correcto.
