# Skills de WakuAIpa

**Skills** = instrucciones reutilizables que le enseñan a Claude / OpenAI cómo
orquestar las herramientas (tools) del MCP server de WakuAIpa para resolver una
tarea concreta. El usuario solo dice "quiero X" → el modelo carga la skill →
ejecuta el flujo definido → devuelve un resultado consistente.

> Este proyecto corre **en local**. El MCP server vive en `http://localhost:8000/sse`
> y las skills están pensadas para cargarlas en **Claude Desktop** local.

---

## 📋 Anatomía de una skill

Una skill es un archivo `.md` con **frontmatter YAML** + **cuerpo Markdown**.

### Frontmatter (cabecera entre `---`)

```yaml
---
name: nombre-de-la-skill              # OBLIGATORIO. Kebab-case. Único.
description: Cuándo invocar esta skill # OBLIGATORIO. 1 frase larga.
allowed-tools:                         # OPCIONAL pero recomendado.
  - get_solar_climatology              # Lista de tools del MCP que puede usar.
  - calculate_investment               # Claude restringe a estas tools.
---
```

**Campos del frontmatter:**

| Campo | ¿Obligatorio? | Para qué sirve |
|---|---|---|
| `name` | sí | Identificador único (kebab-case). Debe coincidir con el filename sin `.md`. |
| `description` | sí | Texto que Claude lee para decidir si **activar** la skill. Cuanto más concreto el "cuándo invocar", mejor. |
| `allowed-tools` | recomendado | Whitelist de tools del MCP. Si no la ponés, Claude puede usar cualquier tool conectada (más permisivo). |

### Cuerpo Markdown (después del frontmatter)

El cuerpo es **el system prompt que se le inyecta a Claude** cuando la skill se
activa. Estructura recomendada:

```markdown
# Título descriptivo de la skill

Resumen 1-2 líneas de qué hace la skill.

## Inputs requeridos
Datos que la skill necesita del usuario. Si faltan, preguntalos.

## Workflow
1. Numerá los pasos.
2. Indicá qué tool llamar en cada paso (con los args).
3. Especificá cómo agregar / interpretar los resultados.

## Formato de respuesta
Template del output (tablas, secciones, emojis…) — esto da consistencia.

## Notas
Edge cases, advertencias, supuestos, regulaciones aplicables.
```

### Patrón de los nombres

Las 7 skills de WakuAIpa usan **kebab-case en español**:

- `auditoria-solar.md` → `name: auditoria-solar`
- `comparacion-escenarios.md` → `name: comparacion-escenarios`
- etc.

El filename y el `name:` **deben coincidir** para evitar confusión.

---

## 🛠️ Pre-requisito: conectar el MCP server local

Las skills llaman tools del MCP server de WakuAIpa. Tenés que tenerlo corriendo y
conectado a Claude Desktop:

### 1. Arrancar el backend

```powershell
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload
```

Verificá que responde: `http://localhost:8000/api/health` → `{"status":"ok"}`.

### 2. Conectar Claude Desktop al MCP

Editá `claude_desktop_config.json` (`%APPDATA%\Claude\` en Windows, `~/Library/Application Support/Claude/` en macOS):

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

Reiniciá Claude Desktop. En el ícono 🔌 del input del chat tenés que ver
**wakuaipa** con las **9 tools** disponibles.

### 3. Cargar una skill

En Claude Desktop → ⚙️ **Settings → Capabilities → Skills → Upload skill** →
seleccioná uno o varios archivos `.md` de esta carpeta.

Una vez cargadas, en cualquier conversación Claude las activará automáticamente
cuando el mensaje del usuario coincida con la `description`. No hace falta
"invocarlas" explícitamente — el modelo las elige.

---

## 🧰 9 tools disponibles en el MCP

| Tool | Descripción |
|---|---|
| `get_solar_climatology(lat, lon)` | Promedios mensuales NASA POWER 2010-2020 |
| `get_solar_daily(year, month, lat, lon)` | Radiación diaria de un mes específico |
| `get_weather_forecast(lat, lon, days)` | Pronóstico Open-Meteo 1-14 días (radiación + viento + lluvia + temperatura) |
| `compute_solar_projection(...)` | Generación, cobertura, ahorros bajo cualquier clima |
| `calculate_investment(...)` | Payback + TIR + flujo 25 años con degradación e inflación |
| `calculate_net_metering(...)` | Balance neto mensual con créditos CREG 030/2018 |
| `recommend_energy_action(...)` | Recomendación personalizada vía LM Studio local |
| `simulate_blackout_plan(...)` | Plan de triaje ante apagón con autonomía estimada |
| `geocode_lookup(query \| lat+lon)` | Buscar ubicación o resolver coordenadas (Nominatim/OSM) |

---

## 👥 3 tipos de usuario

Las tools que llaman al LLM aceptan `user_type` que cambia el tono:

| `user_type` | Tono | Ejemplo |
|---|---|---|
| `"person"` | Amigable, analogías cotidianas | "Lo mismo que tener X focos prendidos toda la tarde" |
| `"community"` | Colectivo, decisiones grupales | "Cuántas familias se benefician, cómo repartir" |
| `"business"` | Técnico, números concretos | "Carga crítica de N kW en UCI, payback dinámico…" |

**Patrón clave en todas las skills**: la primera pregunta que hace el modelo es
**"¿sos persona/hogar, comunidad o empresa?"** para ajustar todo lo demás.

---

## 📚 Catálogo de skills

| Archivo | Para qué tipo | Cuándo se activa |
|---|---|---|
| [`auditoria-solar.md`](./auditoria-solar.md) | empresa (y comunidades grandes) | "Hacé una auditoría solar completa de mi empresa" |
| [`comparacion-escenarios.md`](./comparacion-escenarios.md) | todos | "¿Qué pasaría si instalo X kWp más?" / comparar opciones |
| [`respuesta-emergencia.md`](./respuesta-emergencia.md) | todos | "Hay un apagón / dame el plan de emergencia" |
| [`optimizacion-diaria.md`](./optimizacion-diaria.md) | todos | "Dame el plan del día / cuándo encender qué" |
| [`retorno-inversion.md`](./retorno-inversion.md) | persona / empresa | "¿Cuánto tarda en pagarse?" / "¿qué retorno tiene X kWp?" |
| [`plan-clima-semanal.md`](./plan-clima-semanal.md) | todos | "¿Qué hago esta semana con la lluvia que viene?" |
| [`energia-colectiva-comunidad.md`](./energia-colectiva-comunidad.md) | **comunidad** | "¿Cómo repartimos la energía entre hogares?" |

---

## 🧪 Cómo probar una skill localmente

### Opción A — Claude Desktop (uso real)

1. Cargá la skill en Settings (paso de arriba)
2. Abrí un chat nuevo
3. Escribí el trigger:
   - "Hacé una auditoría de Hotel Taroa" → activa `auditoria-solar`
   - "Hay un apagón en mi clínica" → activa `respuesta-emergencia`
   - "¿Qué pasa si instalo 10 kWp más?" → activa `comparacion-escenarios`
4. Claude llamará las tools del MCP (verás los logs en la terminal del backend)
   y devolverá la respuesta formateada según el template de la skill

### Opción B — MCP Inspector (debugging visual de tools)

```powershell
# Terminal 1: backend
cd backend; uvicorn app.main:app --reload

# Terminal 2: inspector
npx @modelcontextprotocol/inspector
```

Abre `http://localhost:6274` → Transport: `SSE` → URL: `http://localhost:8000/sse`
→ Connect. Te muestra las 9 tools con un form para ejecutarlas. No prueba la
skill como tal, pero sí valida que las tools devuelven lo que la skill espera.

### Opción C — Script Python (CI / automatización)

```python
import asyncio
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client

async def main():
    async with sse_client("http://localhost:8000/sse") as (r, w):
        async with ClientSession(r, w) as session:
            await session.initialize()
            # Listar tools
            print([t.name for t in (await session.list_tools()).tools])
            # Llamar una tool
            res = await session.call_tool("calculate_investment", {
                "existing_solar_kwp": 0,
                "monthly_grid_consumption_kwh": 250,
                "add_solar_kwp": 5, "add_battery_kwh": 5,
            })
            print(res.content[0].text)

asyncio.run(main())
```

---

## ✏️ Crear o editar una skill

1. Copiá una skill existente como template
2. Renombrá el archivo en kebab-case español
3. Actualizá el frontmatter:
   - `name:` = filename sin `.md`
   - `description:` = redactá un trigger explícito (Claude lo lee literal para decidir)
   - `allowed-tools:` = solo las tools que realmente necesitás
4. En el cuerpo, definí `Inputs requeridos`, `Workflow` paso a paso, y un
   `Formato de respuesta` con template fijo (tablas con headers, emojis,
   secciones con `##`)
5. Volvé a Claude Desktop → Skills → **Upload** la nueva versión
6. Reiniciá Claude Desktop si no la detecta

### Tips

- **`description` precisa** = mejor activación. Incluí frases textuales que el
  usuario diría ("¿cuánto tarda en pagarse?", "tengo un apagón").
- **`allowed-tools` restrictiva** = mejor predictibilidad. Si una skill no debe
  llamar al LLM, no incluyas `recommend_energy_action` ni `simulate_blackout_plan`.
- **Workflow numerado** = el modelo lo sigue al pie de la letra. Si está
  ambiguo, improvisará.
- **Notas / Edge cases** = bajan errores. Mencioná qué hacer con valores 0,
  qué normativa aplica, etc.
