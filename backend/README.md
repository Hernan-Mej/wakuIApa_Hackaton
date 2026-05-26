# Backend — Hackaton Solar API

## Setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## MySQL

Need a running MySQL with a database named `hackaton`.

**Opción A — Docker (recomendado):**

```powershell
docker run -d --name hackaton-mysql `
  -e MYSQL_ROOT_PASSWORD= -e MYSQL_ALLOW_EMPTY_PASSWORD=yes `
  -e MYSQL_DATABASE=hackaton `
  -p 3306:3306 mysql:8
```

**Opción B — XAMPP/WAMP/MySQL local:** crear la DB manualmente:

```sql
CREATE DATABASE hackaton CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Si tu usuario/password es distinto, editar `database_url` en `app/core/config.py`
o crear un `.env` en `backend/`:

```
DATABASE_URL=mysql+pymysql://miuser:mipass@127.0.0.1:3306/hackaton?charset=utf8mb4
JWT_SECRET=cambia-esto-por-algo-aleatorio-de-32-chars-min
```

## Redis (opcional)

Cache de NASA POWER. Sin Redis, cae a memoria. Para levantarlo:

```powershell
docker run -d --name hackaton-redis -p 6379:6379 redis:7-alpine
```

## LM Studio

El endpoint de chat llama a LM Studio en `http://127.0.0.1:1234/v1`. Cargá el
modelo `qwen/qwen3.5-9b` (o cualquier otro chat-completable). Si no está
disponible, los endpoints caen a respuestas calculadas localmente.

## Correr

```powershell
uvicorn app.main:app --reload
```

Docs en http://localhost:8000/docs

## Seed data

8 empresas reales de Riohacha con datos coherentes (hoteles, hielera, clínica,
mall, universidad, restaurante, supermercado, hospital público).

```powershell
# Idempotente — agrega solo las que no existen
python -m app.seeds.seed

# Resetea todo y vuelve a sembrar (útil entre demos)
python -m app.seeds.seed --reset

# Además agrega historial de chat de ejemplo en algunas cuentas
python -m app.seeds.seed --reset --with-chat
```

Todas las cuentas usan password **`demo1234`**. Logins disponibles:

| Email                              | Empresa                              | Sector       |
|------------------------------------|--------------------------------------|--------------|
| `hoteltaroa@riohacha.demo`         | Hotel Taroa                          | hotel        |
| `hielera@riohacha.demo`            | Hielera del Norte Guajira            | industrial   |
| `clinica@riohacha.demo`            | Clínica Renacer                      | hospital     |
| `suchiimma@riohacha.demo`          | Centro Comercial Suchiimma           | retail       |
| `universidad@riohacha.demo`        | Universidad de La Guajira            | educación    |
| `brisas@riohacha.demo`             | Restaurante Brisas del Caribe        | restaurante  |
| `olimpica@riohacha.demo`           | Supermercado Olímpica                | retail       |
| `remedios@riohacha.demo`           | Hospital Nuestra Señora de los R.    | hospital     |

## MCP Server (Model Context Protocol)

WakuAIpa expone sus capacidades como un servidor MCP sobre **SSE** en
`GET /sse`. Cualquier cliente MCP (Claude Desktop, OpenAI Agents, Cursor,
Continue.dev, plugins de IDE, etc.) puede conectarse y usar las herramientas.

**Endpoints:**
- `GET /sse` — stream Server-Sent Events (servidor → cliente)
- `POST /mcp/messages/?session_id=...` — mensajes JSON-RPC (cliente → servidor)

**Tools expuestas:**
| Tool | Descripción |
|---|---|
| `get_solar_climatology(lat, lon)` | Promedios mensuales NASA POWER (cacheado en Redis) |
| `get_solar_daily(year, month, lat, lon)` | Radiación diaria de un mes específico |
| `compute_solar_projection(...)` | Cálculo puro: generación, cobertura, ahorros, demanda |
| `recommend_energy_action(...)` | Recomendación personalizada vía LM Studio |
| `simulate_blackout_plan(...)` | Plan de triaje de apagón con autonomía estimada |

**Configurar Claude Desktop** (ejemplo `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "wakuaipa": {
      "url": "http://localhost:8000/sse",
      "transport": "sse"
    }
  }
}
```

**Probar con cliente MCP Python:**

```python
import asyncio
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client

async def main():
    async with sse_client("http://localhost:8000/sse") as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            print([t.name for t in tools.tools])
            res = await session.call_tool("get_solar_climatology", {})
            print(res.content[0].text)

asyncio.run(main())
```

## Endpoints clave

- `POST /api/auth/signup` — crea user + perfil de empresa, devuelve JWT
- `POST /api/auth/login` — OAuth2 form (`username` = email, `password`), devuelve JWT
- `GET  /api/auth/me` — datos del usuario actual + perfil
- `GET/PUT /api/profile` — leer/actualizar perfil de empresa
- `POST /api/chat/send` — manda mensaje al chatbot, devuelve respuesta + persiste historial
- `GET  /api/chat/history` — historial completo
- `POST /api/blackout/start` — calcula autonomía + plan de triaje vía LLM
- `GET  /api/solar/climatology?lat=&lon=` — datos NASA POWER cacheados
