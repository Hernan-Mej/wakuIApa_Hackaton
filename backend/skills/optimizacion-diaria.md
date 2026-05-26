---
name: optimizacion-diaria
description: Plan operativo del día — recomienda qué cargas activar/desplazar y a qué horas según la radiación solar prevista. Invocá cuando el usuario pida "plan del día", "qué hago hoy", "cuándo encender X", "cómo aprovechar el sol hoy" u optimizar consumo según horario.
allowed-tools:
  - get_solar_daily
  - recommend_energy_action
  - compute_solar_projection
---

# Plan operativo diario — WakuAIpa

Generás un cronograma horario (24h) que alinea las cargas flexibles del
negocio con el pico de generación solar, tomando en cuenta el clima previsto.

> **Adaptá al `user_type`**:
> - `business`: cronograma técnico por hora, con cargas específicas del sector
> - `community`: ventanas grupales ("entre 10-14 todas las casas pueden lavar")
> - `person`: 3-4 consejos prácticos del día ("hoy es buen día para cargar el coche eléctrico")
>
> **Tip**: si la pregunta cubre varios días, mejor usar `plan-clima-semanal.md`.

## Inputs requeridos

- **Perfil del negocio**: empresa, sector, consumo_mensual, kWp, baterías,
  cargas críticas/flexibles
- **Fecha objetivo** (opcional, default = hoy): mes y día
- **Clima previsto** (opcional, default = sunny): `sunny | cloudy | rain | storm`
- **`extra_data`** sector-específico: muy útil para sugerencias concretas
  (ej. hotel → `rooms_standard`/`has_pool`; restaurante → `kitchen_appliances`)

## Workflow

1. **Radiación del día**: si el usuario especificó fecha, llamá
   `get_solar_daily(year=<año>, month=<mes>)` y extraé el valor del día. Si no
   especificó, usá el promedio del mes en curso desde
   `get_solar_climatology` (más rápido, una sola llamada).

2. **Cálculo de generación esperada del día**: llamá `compute_solar_projection`
   con la radiación del día y el clima previsto. Tomá `daily_generation_kwh`
   como techo de generación del día.

3. **Identificá la ventana solar útil**: en La Guajira el pico operativo
   típicamente es **10:00 – 14:30** (4-5 horas con > 70% de la radiación pico).
   Fuera de esa ventana la generación cae rápido.

4. **Plan horario**: llamá `recommend_energy_action` con
   `user_question = "Construí un cronograma horario (06:00–22:00) para
   {empresa} en {sector} considerando radiación de {X.XX} kWh/m²/día y clima
   {weather}. Indicá específicamente QUÉ cargas activar a QUÉ hora,
   priorizando uso directo de generación solar entre 10:00 y 14:30."`

5. **Adaptá al sector** (parsea o reescribe la respuesta del LLM con esto):
   - **Hotel**: precooling de habitaciones VIP 13:00–15:00, lavandería al
     mediodía, bombeo de piscina en pico solar
   - **Industrial / hielera**: carga máxima de compresores en pico solar,
     mantenimiento programado fuera de horas-punta de la red
   - **Hospital**: NO modificar cargas críticas; sí desplazar lavandería,
     climatización de oficinas administrativas, esterilización por lotes
   - **Retail**: encendido tardío de iluminación decorativa, programación de
     hornos de panadería al mediodía
   - **Restaurante**: prep de cocina entre 10–12, congeladores con cycling

## Formato de respuesta

```
# 📅 Plan operativo · {empresa} · {fecha}

## ☀️ Pronóstico solar
- Radiación: {X.XX} kWh/m²/día ({% vs media mensual})
- Clima: {emoji} {weather}
- Generación esperada: {X} kWh
- Ventana solar útil: 10:00–14:30 (~{X} kWh disponibles directo)

## ⏰ Cronograma horario

| Hora       | Acción | Razón |
|------------|--------|-------|
| 06:00–08:00 | {acción} | Demanda baja — usar baterías/red |
| 08:00–10:00 | {acción} | Generación arrancando |
| 10:00–14:30 | 🌞 {acción} | **PICO SOLAR — máximo aprovechamiento** |
| 14:30–17:00 | {acción} | Generación cayendo |
| 17:00–22:00 | {acción} | Sin sol — minimizar cargas no críticas |

## 💡 Acciones prioritarias del día
1. {Acción específica del sector}
2. {Acción 2}
3. {Acción 3}

## 💰 Impacto estimado
- Si seguís el plan: ahorro adicional ~${X} COP vs operación sin planificación
- Reducción de pico de demanda de red: ~{X}%

## ⚠️ Si cambia el clima
{breve nota: cómo ajustar el plan si llueve / aparece nube}
```

## Notas

- En modo **lluvia/tormenta** (radiación < 2 kWh/m²/día): el plan debe priorizar
  conservación, no aprovechamiento. Recomendá posponer cargas flexibles para el
  día siguiente y operar al mínimo.
- Si `solar_capacity_kwp = 0`: el plan se enfoca en evitar tarifa pico
  (típicamente 18:00–21:00 en Colombia) en vez de aprovechar generación propia.
- Mencioná siempre la **media mensual** como referencia para que el usuario
  sepa si el día es "típico" o atípico.
