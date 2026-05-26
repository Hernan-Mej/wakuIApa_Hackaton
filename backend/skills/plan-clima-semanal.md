---
name: plan-clima-semanal
description: Plan de acción energético para los próximos 3-14 días basado en el pronóstico real del clima. Invocá cuando el usuario pregunte "¿qué hago esta semana?", "viene mucha lluvia, ¿qué pasa con mi energía?", "¿conviene racionar?", "¿almaceno o vendo el excedente?", o pida planificar consumos/exports con anticipación.
allowed-tools:
  - get_weather_forecast
  - compute_solar_projection
  - calculate_net_metering
---

# Plan semanal según clima — WakuAIpa

Combinás pronóstico real (Open-Meteo) + perfil del usuario para decirle día a
día si conviene **aprovechar**, **almacenar**, **vender** o **racionar** energía.
Es la skill clave para no tener déficits ni desperdiciar excedentes.

## Inputs requeridos

1. **Tipo de usuario** y datos básicos del perfil:
   - Capacidad solar instalada (kWp) y/o eólica (kW)
   - Capacidad de baterías (kWh)
   - Consumo mensual (kWh)
   - Generador de respaldo (kW, opcional)
   - `wants_to_sell_energy` (true/false)
2. **Ubicación** (lat, lon) — default Riohacha
3. **Días a planificar** (default 7, máx 14)

## Workflow

1. **Pronóstico** del clima: `get_weather_forecast(lat, lon, days)`.
   Devuelve para cada día: `radiation_kwh_m2`, `wind_speed_80m_max_ms`,
   `precipitation_mm`, `precipitation_probability_pct`, `weather_code`.

2. Para **cada día** del pronóstico, calculá:
   - **Generación solar esperada** = `kWp × radiation_kwh_m2 × 0.8` (kWh/día)
   - **Generación eólica esperada** (si tiene turbinas):
     - Si `v < 3 m/s` → 0
     - Si `3 ≤ v < 12` → `capFactor = ((v-3)/9)²`
     - Si `12 ≤ v < 25` → `capFactor = 1.0`
     - Si `v ≥ 25` → 0 (cut-out por seguridad)
     - `kWh/día = wind_kw × 24 × capFactor × 0.5` (factor 0.5 = pico no es 24h)
   - **Total** = solar + eólica
   - **Cobertura** = total / (consumo_mensual / 30) × 100

3. **Clasificá** el día con un **modo** de acción:
   - 🌟 **HARVEST** (verde) — `coverage >= 90%`: día ideal, programar cargas pesadas
   - 💵 **SUPPLY** (cyan) — `coverage >= 130%` y `wants_to_sell=true`: vender excedente
   - 🔋 **STORE** (ámbar) — `coverage >= 130%` y hay baterías: cargar baterías
   - ☀️ **HARVEST PARCIAL** (verde claro) — `coverage 50-90%`: desplazar cargas al pico solar
   - ⚠️ **RATION** (amarillo) — `coverage 25-50%` o `precip ≥ 60%`: posponer cargas no esenciales
   - 🚨 **RATION FUERTE** (rojo) — `coverage < 25%`: usar generador, evitar todo lo no crítico

4. **Estrategia integrada de la semana**:
   - Identificá los 1-2 mejores días → "Acumulá tareas pesadas para {días}"
   - Identificá los 1-2 peores días → "Reservá baterías cargadas para {días}"
   - Si hay >3 días seguidos de lluvia: advertencia explícita + plan de racionamiento + sugerir generador
   - Si hay >3 días seguidos de sol pleno + baterías llenas + `wants_to_sell=true`:
     llamá `calculate_net_metering` para mostrar cuánto puede generar de venta

## Formato de respuesta

### Para **PERSONA / COMUNIDAD** (visual y sencillo):

```
# 🌦️ Tu semana energética · {fecha inicio} → {fecha fin}

## 📊 Resumen
- ☀️ Energía esperada total: **{X} kWh** ({X/días} kWh/día promedio)
- 💧 Días con lluvia probable: **{N}** de {días}
- 🌬️ Viento promedio: **{X} m/s** {si > 7: "(excelente para eólica)"}
- ⚖️ Cubrirás aproximadamente **{X}%** de tu consumo con energía propia

## 📅 Día por día

| Día | Clima | Energía esperada | Acción |
|-----|-------|------------------|--------|
| Lun 27 | ☀️ Soleado | 25 kWh ✓ cubre todo | 🌟 APROVECHAR — usá lavadora, bombeo |
| Mar 28 | 🌧️ Lluvia | 9 kWh (~36% consumo) | ⚠️ RACIONAR — luces LED, evitá A/A día |
| Mié 29 | ⛈️ Tormenta | 4 kWh (~16%) | 🚨 GENERADOR si tenés, batería al mínimo |
| ...

## 🎯 Estrategia de la semana
1. {Identificar mejor día}: "El {día} acumulá las cargas pesadas"
2. {Identificar peor día}: "El {día} llegá con baterías al 100%"
3. {Si hay tormentas}: "Cargá el generador de respaldo, vas a usarlo"
```

### Para **EMPRESA** (técnico + financiero):

Igual al anterior pero agregando:
- Generación esperada en MWh totales
- Estimación de **costo evitado** ($COP por día y por semana)
- Estimación de **kWh comprados a la red** vs **generados internamente**
- Si `wants_to_sell_energy = true` y hay excedente: estimar créditos según CREG 030
- Recomendaciones sector-específicas (hotel → precool habitaciones VIP; clínica →
  desplazar lavandería; industrial → programar compresores al mediodía)

### Para **COMUNIDAD**:

- Mostrar la energía esperada como "X kWh suficiente para Y hogares un día completo"
- Si hay venta activa: "Si el {mejor día} exportamos el excedente, ingresan ~$Z COP al fondo común"
- Plan de racionamiento priorizando servicios compartidos (escuela, bomba de agua, centro de salud)

## Notas

- **Open-Meteo a veces falla** → la tool devuelve un `source: "fallback"` con
  pronóstico "típico" (~5.5 kWh/m²/día y 9 m/s viento). Si ves fallback,
  aclarar al usuario que es estimativo.
- **El factor 0.5 en eólica** es conservador para micro-eólicas en La Guajira.
  Para turbinas industriales (Jepírachi-style >100m de altura) usar 0.7-0.85.
- **No prometás** clima exacto — siempre decí "probabilidad" / "esperado" /
  "estimado". El pronóstico baja precisión más allá de 7-10 días.
