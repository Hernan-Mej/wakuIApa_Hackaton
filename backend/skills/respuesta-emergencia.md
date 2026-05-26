---
name: respuesta-emergencia
description: Plan de respuesta ante apagón eléctrico — calcula autonomía, prioriza cargas críticas y entrega un plan de triaje accionable. Invocá cuando el usuario diga "hay un apagón", "cortaron la luz", "modo emergencia", "qué hago en un blackout" o pida priorizar consumos urgentemente.
allowed-tools:
  - simulate_blackout_plan
  - recommend_energy_action
---

# Plan de emergencia ante apagón — WakuAIpa

Generás un plan de triaje completo: autonomía estimada, cargas a priorizar,
cargas a apagar de inmediato, y comunicación al equipo.

> **Adaptá al `user_type`**:
> - `business`: triaje por carga eléctrica (UCI, refri, servidores), comunicación al equipo
> - `community`: priorizar **servicios compartidos** (escuela, bomba de agua, centro de salud) antes que hogares; mensaje para grupo de WhatsApp comunal
> - `person`: lenguaje cotidiano ("dejá el ventilador, apagá la TV") + qué hacer si el corte se extiende

## Inputs requeridos

Si no los tenés, pedilos en una sola pregunta concisa:

- **Empresa + sector**
- **Consumo mensual** (kWh)
- **Capacidad baterías** (kWh) y **generador** (kW) — críticos para autonomía
- **# cargas críticas** (refrigeración, servidores, equipo médico, etc.)
- **# cargas flexibles** (A/A zonas comunes, iluminación decorativa)
- *(Opcional)* `extra_data`: especialmente útil — ej. para hospital `icu_beds`,
  `has_oxygen_plant`; para hielera `compressors_total_kw`; para restaurante
  `has_walk_in_freezer`.

## Workflow

1. **Una sola llamada** a `simulate_blackout_plan` con el perfil completo.
   Esta tool ya calcula autonomía (batería + generador) y pide al LLM el plan
   de triaje. Devuelve:
   - `critical_load_kw`
   - `battery_hours`, `generator_hours`, `estimated_autonomy_hours`
   - `plan` (texto del LLM)

2. **Estructurá** el plan en 4 secciones claras y reformatealo si viene mal
   estructurado:
   - 🚨 Cargas a apagar AHORA (lista priorizada)
   - ✅ Cargas a mantener (críticas)
   - ⚡ Activación de respaldos (orden: baterías → generador)
   - 📞 Comunicación interna sugerida

3. Si la **autonomía < 4 horas**: agregá una advertencia roja al principio y
   sugerí contactar a la empresa eléctrica + activar planes de contingencia
   (reubicar inventario perecedero, suspender servicios no críticos).

4. Si el sector es **hospital o clínica**: añadí explícitamente la prioridad
   de UCI, neonatos, quirófanos en curso y cadena de frío farmacéutica.

## Formato de respuesta

```
# 🚨 PLAN DE EMERGENCIA — {empresa}

## ⏱️ Autonomía estimada
- **{X.X} horas** totales (baterías {Y.Y}h + generador {Z.Z}h)
- Carga crítica que se está sosteniendo: ~{N} kW

{Si < 4h: ⚠️ AUTONOMÍA CRÍTICA — activar contingencia inmediata}

## 🚨 Apagar AHORA
1. {Carga 1}
2. {Carga 2}
3. ...

## ✅ Mantener encendido
1. {Crítica 1}
2. {Crítica 2}
3. ...

## ⚡ Activación de respaldos
1. Confirmar transferencia automática a baterías (UPS)
2. Si autonomía batería < 30 min restantes → arrancar generador
3. {sector-específico: ej. hospital → confirmar oxígeno de respaldo}

## 📞 Comunicación al equipo
> "Apagón eléctrico activo. Operamos en modo emergencia ~{X}h. {accion clave}."

## ↻ Próximos pasos
- Reportar a empresa eléctrica
- {sector-específico}
- Cuando vuelva la red: {recomendación de recarga ordenada}
```

## Notas

- **No esperes** los inputs uno por uno — pedilos todos en un solo mensaje.
  En una emergencia el tiempo importa.
- Si el usuario ya está en el dashboard de WakuAIpa, su perfil está en sesión
  → llamá `simulate_blackout_plan` directamente con esos datos.
- Si querés un plan más rico (recomendaciones extras), también podés llamar
  `recommend_energy_action` con `user_question = "Recomendaciones adicionales
  para extender autonomía durante este apagón"`.
