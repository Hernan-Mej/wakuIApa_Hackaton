---
name: retorno-inversion
description: Análisis de retorno de inversión (ROI / payback / TIR) para instalar o ampliar un sistema solar, eólico o de baterías. Invocá cuando el usuario pregunte "¿cuánto tarda en pagarse?", "¿me conviene invertir en paneles?", "¿qué retorno tiene X kWp?", "¿qué hago con mi presupuesto de $Y?", o pida evaluar la viabilidad financiera de una instalación.
allowed-tools:
  - calculate_investment
  - get_solar_climatology
---

# Análisis de ROI solar — WakuAIpa

Calculás el periodo de recuperación, TIR y ahorro acumulado de una inversión
en generación renovable. **La tool `calculate_investment` ya hace todos los
cálculos** (NASA POWER + degradación + inflación + O&M + flujo 25 años) —
tu trabajo es interpretar el resultado y presentarlo en formato claro.

## Inputs requeridos del usuario

Si no los dio, preguntá en una sola conversación:

1. **Tipo de usuario** (persona / comunidad / empresa) → ajusta el tono de la respuesta
2. **Consumo eléctrico mensual** en kWh (de la factura)
3. **Capacidad solar YA instalada** (kWp) — 0 si no tiene nada
4. **Propuesta de inversión**:
   - Capacidad nueva (kWp solar, kWh batería, kW eólica)
   - O un **presupuesto en COP** → dimensionalo con `~$4.500.000/kWp`
5. **Ubicación** (lat, lon) — default Riohacha (11.5449, -72.9069)

## Workflow

1. **Una sola llamada** a `calculate_investment` con todos los inputs:

```
calculate_investment(
  existing_solar_kwp = <YA instalada>,
  monthly_grid_consumption_kwh = <consumo>,
  add_solar_kwp = <propuesta>,
  add_battery_kwh = <propuesta>,
  add_wind_kw = <propuesta>,
  latitude = <lat>, longitude = <lon>,
  sell_excess_pct = 0.7    # 0 si no quiere/puede vender, 0.7 si sí
)
```

2. **Interpretá** la respuesta:
   - `verdict`: `"excellent"` | `"good"` | `"marginal"` | `"review"` — usá el badge correspondiente
   - `payback_simple_years` y `payback_dynamic_years` (descuento 10%)
   - `irr_estimated_pct` (TIR)
   - `total_savings_lifetime_cop` (25 años)
   - `avg_coverage_pct` (cobertura del consumo)
   - `cash_flow[]` con los 25 años (acumulado por año)

3. Si el `verdict` es `"review"` con un payback > 10 años:
   - Probablemente sobredimensionado. Sugerí kWp ≈ `consumo_mensual / 150`
   - O sugerí volver a llamar `calculate_investment` con menor capacidad

4. Si el usuario es **persona** y `cobertura > 100%` pero `wants_to_sell_energy = false`:
   - El excedente no se monetiza → sugerí activar venta de energía o reducir kWp

## Formato de respuesta (adapta al user_type)

### Para **PERSONA** (lenguaje simple):

```
# 💰 ¿Te conviene? — análisis para {nombre}

## 📋 La propuesta
Instalar **{X} kWp** ({~Y paneles de 550W}) + {Z} kWh de baterías.
Inversión: **${X.XXX.XXX} COP** (~$4.5M por kWp llave en mano).

## ⏱️ Te pagaría en
- **{X} años** sin contar inflación
- {Y} años contando la inflación tarifaria (es lo realista)
- A partir de ese momento todo lo que ahorrás es ganancia neta

## 💸 Cuánto ahorrarías
- Año 1: **${X.XXX.XXX} COP** de ahorro
- 25 años: **${X.XXX.XXX.XXX} COP** en total

## 🚦 Veredicto
{verdict_message, parafraseado con emoji 🌟/✅/⚠️/🚨}

## 💡 Tip
{Si excelente: "Es de las mejores inversiones que podés hacer hoy en Colombia"}
{Si bueno: "Conviene, especialmente si pensás vivir 10+ años acá"}
{Si marginal: "Considerá un sistema más chico o esperar incentivos fiscales"}
{Si revisar: "Te está saliendo grande para tu consumo — ajustá el tamaño"}
```

### Para **EMPRESA** (técnico):

```
# 💰 Análisis de inversión — {empresa}

## 📋 Propuesta
- Capacidad nueva: **{X} kWp** + {Y} kWh baterías + {Z} kW eólica
- Sobre {Y} kWp existentes → total {X+Y} kWp
- Inversión: **${X.XXX.XXX} COP**
- Generación año 1: {X.XXX} kWh ({coverage}% del consumo)

## 📈 Retorno
- **Payback simple: {X.X} años**
- **Payback dinámico (descuento 10%): {X.X} años**
- **TIR proyectada (25 años): {X.X}%**
- **Ahorro acumulado lifetime: ${X.XXX.XXX.XXX} COP**

## 📊 Flujo de caja (años clave)
| Año | Generación | Ahorro | + Venta excedente | - O&M | Flujo neto | Acumulado |
|-----|------------|--------|-------------------|-------|-----------|-----------|
{tomar de cash_flow años 1, 3, 5, 10, payback, 15, 20, 25}

## ⚖️ Veredicto
{verdict_message completo + recomendación de capacidad alternativa si aplica}

## ⚠️ Supuestos
- Tarifa actual 943 COP/kWh, inflación 6% anual
- Performance Ratio 0.8 · degradación 0.5%/año · O&M 1.5% anual
- Sin incluir incentivos Ley 1715/2014 (puede reducir 25-50% el payback)

## 📌 Próximos pasos
- Cotizar con 3 proveedores en La Guajira
- Aplicar deducciones Ley 1715/2014
- Evaluar financiamiento (leasing operativo a 7 años suele empatar con el payback)
```

### Para **COMUNIDAD** (colectivo):

Similar a persona pero dividí los números entre la cantidad de hogares:
- "Inversión por hogar: ~$X COP"
- "Ahorro mensual por hogar: ~$Y COP"
- "Cada familia recupera su parte en {payback} años"
- Considerá la posibilidad de microred local + venta entre vecinos

## Notas importantes

- **Costo de instalación**: rango $4M-$5M COP/kWp llave en mano. Usá $4.5M default.
- **Si el usuario dice "tengo $X de presupuesto"**: dimensioná `kWp = X / 4_500_000`, después llamá calculate_investment.
- **Comunidades indígenas / zonas no-interconectadas**: la tarifa de referencia puede ser menor — preguntá si sabe la tarifa local antes de calcular.
- **Ley 1715/2014**: deducción 50% del IVA + descuento renta. No la incluyas en el cálculo (sería opcional) pero menciónala como mejora del payback.
- **CREG 030/2018**: sólo aplica si < 100 kW. Si es más grande, no aplican créditos de venta a precio retail — la venta se hace en mercado mayorista (más complejo).
