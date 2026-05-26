---
name: comparacion-escenarios
description: Compara escenarios "what-if" para una empresa — distintas capacidades solares, baterías, climas o tarifas. Invocá cuando el usuario pregunte "qué pasaría si...", "¿me conviene instalar X kWp más?", "compará A vs B" o pida evaluar opciones de inversión.
allowed-tools:
  - get_solar_climatology
  - compute_solar_projection
---

# Comparación de escenarios — WakuAIpa

Ejecutás N proyecciones paralelas variando uno o más parámetros, y presentás
una tabla comparativa con deltas claros vs el escenario base.

> **Adaptá al `user_type`**: para `person`/`community` usá la skill
> [`retorno-inversion.md`](./retorno-inversion.md) si la pregunta es financiera, o
> esta skill si quieren explorar opciones técnicas. Para `business` esta es
> la skill principal de planificación estratégica.
>
> **Mejora**: ahora la tool `calculate_investment` ya calcula payback y TIR
> en una sola llamada — usala en vez de hacer cálculos manuales.

## Inputs requeridos

1. **Perfil base**: nombre, sector, consumo_mensual_kwh, capacidad_solar_kwp,
   batería_kwh, generador_kw.
2. **Escenarios a comparar**: 2 a 5 variantes. Cada uno modifica un subset de
   parámetros. Ejemplos típicos:
   - "Actual" (base)
   - "+50 kWp"
   - "+50 kWp + 80 kWh batería"
   - "Mismo sistema bajo lluvia"

Si el usuario sólo dijo "¿qué pasa si instalo X kWp?" → generá 3 escenarios:
**Actual / +X kWp / +2X kWp** para mostrar la curva.

## Workflow

1. Una llamada a `get_solar_climatology(lat, lon)` (default Riohacha).
2. Elegí el mes de referencia: `current month` o promedio anual de la
   climatología (`annual / 12 ≈ avgRad`).
3. Para **cada escenario** llamá `compute_solar_projection` con los overrides
   correspondientes. Mantené `tariff_cop_per_kwh=943` salvo que cambie.
4. Calculá deltas vs el escenario base:
   - Δ generación mensual (kWh y %)
   - Δ ahorro mensual (COP y %)
   - Δ cobertura (puntos porcentuales)
5. Si el escenario incluye inversión adicional (más kWp), estimá payback:
   `payback_meses = inversion_aproximada / (ahorro_mensual_extra)`.
   Costo orientativo La Guajira: **~$4.500.000 COP/kWp** instalado.

## Formato de respuesta

```
# Comparación de escenarios — {empresa}

## Inputs comunes
Consumo {X} kWh/mes · Tarifa $943 COP/kWh · Radiación {X.XX} kWh/m²/día

## Tabla comparativa
| Escenario       | kWp | Batería | Clima  | Generación/mes | Cobertura | Ahorro/mes  | Δ vs base   |
|-----------------|-----|---------|--------|----------------|-----------|-------------|-------------|
| Actual          | 25  | 30 kWh  | Sol    | 3.300 kWh      | 22%       | $3.110.000  | —           |
| +50 kWp         | 75  | 30 kWh  | Sol    | 9.900 kWh      | 68%       | $9.330.000  | +$6.220.000 |
| +50 kWp + bat.  | 75  | 110 kWh | Sol    | 9.900 kWh      | 68%       | $9.330.000  | +$6.220.000 |
| Bajo lluvia     | 25  | 30 kWh  | Lluvia | 990 kWh        | 7%        | $933.000    | -$2.177.000 |

## Análisis
- {comentario sobre el mejor escenario}
- {nota si hay diminishing returns}
- {payback estimado si aplica}

## Recomendación
{1-2 líneas: cuál escenario recomendás y por qué}
```

## Notas

- Si el usuario pide "comparar climas", varía `weather` entre los 4 valores
  (sunny / cloudy / rain / storm) manteniendo el resto fijo.
- Si pide "sensibilidad a tarifa", varía `tariff_cop_per_kwh` (ej. 800, 943, 1200).
- **No inventes precios de instalación** — usá el rango referencial de
  $4-5M COP/kWp y aclará que es estimativo.
