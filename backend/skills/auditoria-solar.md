---
name: auditoria-solar
description: Auditoría solar completa para una empresa en Riohacha / La Guajira. Invocá cuando el usuario pida "auditar", "analizar mi situación solar", "reporte completo" o describa su empresa pidiendo un diagnóstico energético.
allowed-tools:
  - get_solar_climatology
  - compute_solar_projection
  - recommend_energy_action
---

# Auditoría solar completa — WakuAIpa

Generás un reporte ejecutivo de la situación solar de una empresa, combinando
datos satelitales NASA POWER + cálculos físicos + recomendación accionable.

> **Adaptá el tono al `user_type`**: para `business` reportá técnico y
> detallado (esta skill funciona principalmente para empresas). Si llega una
> `person` o `community`, redirigí a `comparacion-escenarios.md` que es más
> apropiada para esos casos.

## Datos que necesitás del usuario

Si no los dio, preguntale en orden:

1. **Empresa**: nombre + sector (hotel, industrial, retail, hospital, oficina,
   educación, restaurante)
2. **Consumo mensual** en kWh (factura promedio)
3. **Capacidad solar instalada** en kWp (0 si no tiene paneles)
4. **Baterías** en kWh y **generador** en kW (0 si no aplica)
5. **Cargas críticas / flexibles** (#)
6. *(Opcional)* ubicación: si no la mencionan, asumí **Riohacha (11.5449, -72.9069)**.

## Workflow

1. **Climatología**: llamá `get_solar_climatology(lat, lon)` para obtener los
   12 promedios mensuales y la media anual.
2. **Proyección mensual**: para CADA mes, llamá `compute_solar_projection`
   con `average_daily_radiation_kwh_m2` = monthly[mes] y los datos del perfil.
   Usá `weather="sunny"` y `performance_ratio=0.8` por default.
3. **Cálculo agregado**:
   - `annual_generation = sum(monthly_generation_kwh)` (acumulado de los 12 meses)
   - `annual_savings_cop = sum(monthly_actual_savings_cop)` (real, no techo)
   - `avg_coverage_pct = mean(coverage_pct)` (cobertura promedio del año)
   - Mes pico (más generación) y mes valle (menos)
4. **Recomendación**: llamá `recommend_energy_action` con el perfil completo y
   `user_question = "Dame las 3 acciones prioritarias que esta empresa debe
   ejecutar este mes para maximizar el aprovechamiento solar."`

## Formato del reporte

Devolvé un markdown estructurado así:

```
# Auditoría solar — {nombre_empresa}

## 📊 Resumen ejecutivo
- Consumo anual: {X.XXX} kWh · ${X.XXX.XXX} COP en factura
- Generación solar estimada: {X.XXX} kWh/año
- Cobertura promedio: {X}% del consumo
- Ahorro real anual: ${X.XXX.XXX} COP

## ☀️ Climatología NASA POWER
- Radiación anual promedio: {X.XX} kWh/m²/día
- Mes pico: {mes} ({X.XX} kWh/m²/día)
- Mes valle: {mes} ({X.XX} kWh/m²/día)

## 📅 Proyección mes a mes
| Mes | Radiación | Generación | Cobertura | Ahorro real |
|-----|-----------|------------|-----------|-------------|
| Ene | X.XX      | X.XXX kWh  | X%        | $X.XXX.XXX  |
| ...

## 🎯 Plan de acción
{respuesta de recommend_energy_action, parafraseada si es muy larga}

## 🚦 Veredicto
{una línea: "Sistema dimensionado correctamente" / "Subdimensionado en N%" /
"Sin instalación — potencial de ahorro $X/año"}
```

## Notas

- Si `solar_capacity_kwp = 0`: el reporte se enfoca en cuánto se ahorraría
  CON una instalación recomendada (sugerí kWp ≈ consumo_mensual / 150).
- Si `coverage_pct > 100` en algunos meses: mencioná que hay excedente para
  inyectar a la red o cargar baterías.
- Tarifa default Riohacha: **943 COP/kWh** — sólo override si el usuario
  especifica otra región.
