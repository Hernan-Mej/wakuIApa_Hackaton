import type { Sector } from "./api/types";

export type FieldType = "number" | "text" | "boolean" | "select";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  options?: string[];
  default?: string | number | boolean;
  /** Hide this field unless another field in the same form equals truthy/value. */
  showWhen?: { key: string; equals: unknown };
  /** Group fields visually under a sub-heading. */
  group?: string;
}

export interface SectorSchema {
  title: string;
  intro: string;
  fields: FieldSpec[];
}

/** Fields requested for every sector — always shown after the basics. */
const COMMON_ENERGY_FIELDS: FieldSpec[] = [
  {
    key: "has_wind_turbine",
    label: "¿Tienes turbina eólica?",
    type: "boolean",
    hint: "La Guajira tiene los mejores vientos de Colombia (8-10 m/s en costa).",
    default: false,
    group: "Generación adicional",
  },
  {
    key: "wind_turbine_kw",
    label: "Capacidad eólica instalada (kW)",
    type: "number",
    default: 0,
    showWhen: { key: "has_wind_turbine", equals: true },
    group: "Generación adicional",
  },
];

export const SECTOR_SCHEMAS: Record<Sector, SectorSchema> = {
  hotel: {
    title: "Detalles del hotel",
    intro: "Para calcular el pico de consumo por habitación según el tipo y la ocupación.",
    fields: [
      { key: "rooms_standard", label: "Habitaciones estándar (#)", type: "number", default: 0, group: "Habitaciones" },
      { key: "rooms_suite", label: "Habitaciones suite / VIP (#)", type: "number", default: 0, group: "Habitaciones" },
      {
        key: "avg_kwh_per_room_night",
        label: "Consumo promedio por habitación (kWh/noche)",
        type: "number",
        hint: "Típico Riohacha: 10-15 kWh por habitación con A/A funcionando.",
        default: 12,
        group: "Habitaciones",
      },
      { key: "avg_occupancy_pct", label: "Ocupación promedio (%)", type: "number", default: 65, group: "Habitaciones" },
      { key: "peak_season", label: "Temporada alta", type: "text", hint: "Ej: dic-feb, jun-jul", default: "dic-feb", group: "Habitaciones" },
      { key: "has_pool", label: "¿Tiene piscina?", type: "boolean", default: false, group: "Servicios" },
      { key: "pool_pump_kw", label: "Potencia bomba piscina (kW)", type: "number", default: 0, showWhen: { key: "has_pool", equals: true }, group: "Servicios" },
      { key: "has_restaurant", label: "¿Tiene restaurante propio?", type: "boolean", default: false, group: "Servicios" },
      { key: "has_spa", label: "¿Tiene spa / sauna?", type: "boolean", default: false, group: "Servicios" },
      ...COMMON_ENERGY_FIELDS,
    ],
  },
  industrial: {
    title: "Detalles industriales",
    intro: "Necesario para dimensionar consumos de compresores, líneas de producción y turnos.",
    fields: [
      { key: "shifts_per_day", label: "Turnos por día", type: "select", options: ["1", "2", "3"], default: "1" },
      { key: "production_lines", label: "Líneas de producción (#)", type: "number", default: 1 },
      { key: "compressors_total_kw", label: "Potencia total compresores (kW)", type: "number", default: 0 },
      { key: "cold_room_volume_m3", label: "Volumen total cuartos fríos (m³)", type: "number", default: 0 },
      { key: "main_equipment", label: "Equipo principal", type: "text", hint: "Ej: compresores de amoníaco, hornos eléctricos, molinos", default: "" },
      { key: "has_cogeneration", label: "¿Tiene cogeneración?", type: "boolean", default: false },
      ...COMMON_ENERGY_FIELDS,
    ],
  },
  hospital: {
    title: "Detalles del hospital / clínica",
    intro: "Para priorizar correctamente las cargas críticas en caso de apagón.",
    fields: [
      { key: "hospitalization_beds", label: "Camas hospitalización", type: "number", default: 0, group: "Capacidad" },
      { key: "icu_beds", label: "Camas UCI", type: "number", default: 0, group: "Capacidad" },
      { key: "neonatal_beds", label: "Cunas neonatales", type: "number", default: 0, group: "Capacidad" },
      { key: "surgery_rooms", label: "Quirófanos", type: "number", default: 0, group: "Capacidad" },
      { key: "imaging_machines", label: "Equipos imagenología (rayos X, TAC, RM)", type: "number", default: 0, group: "Equipamiento" },
      { key: "has_pharmacy_cold_chain", label: "¿Cadena de frío farmacia?", type: "boolean", default: true, group: "Equipamiento" },
      { key: "has_oxygen_plant", label: "¿Planta de oxígeno propia?", type: "boolean", default: false, group: "Equipamiento" },
      ...COMMON_ENERGY_FIELDS,
    ],
  },
  retail: {
    title: "Detalles del comercio",
    intro: "Para estimar refrigeración, iluminación y climatización del local.",
    fields: [
      { key: "floor_area_m2", label: "Área del local (m²)", type: "number", default: 0 },
      { key: "store_count", label: "# de locales (si es centro comercial)", type: "number", default: 0 },
      { key: "refrigeration_units", label: "Neveras / vitrinas refrigeradas (#)", type: "number", default: 0 },
      { key: "freezers", label: "Congeladores (#)", type: "number", default: 0 },
      { key: "cashier_stations", label: "Cajas registradoras (#)", type: "number", default: 0 },
      { key: "has_parking_lighting", label: "¿Iluminación parqueadero nocturna?", type: "boolean", default: false },
      { key: "has_food_court", label: "¿Plaza de comidas?", type: "boolean", default: false },
      { key: "food_court_kitchens", label: "Cocinas en plaza de comidas (#)", type: "number", default: 0, showWhen: { key: "has_food_court", equals: true } },
      { key: "has_bakery_ovens", label: "¿Hornos de panadería?", type: "boolean", default: false },
      { key: "bakery_oven_kw", label: "Potencia total hornos (kW)", type: "number", default: 0, showWhen: { key: "has_bakery_ovens", equals: true } },
      ...COMMON_ENERGY_FIELDS,
    ],
  },
  oficina: {
    title: "Detalles de oficinas",
    intro: "Para estimar consumo por empleado y climatización.",
    fields: [
      { key: "employees", label: "Empleados (#)", type: "number", default: 0 },
      { key: "floor_area_m2", label: "Área (m²)", type: "number", default: 0 },
      { key: "meeting_rooms_with_screens", label: "Salas de reuniones con TV/pantalla", type: "number", default: 0 },
      { key: "server_rack_kw", label: "Potencia rack de servidores (kW)", type: "number", default: 0 },
      ...COMMON_ENERGY_FIELDS,
    ],
  },
  educacion: {
    title: "Detalles de la institución educativa",
    intro: "Para estimar consumo por aula y laboratorio.",
    fields: [
      { key: "classrooms", label: "Aulas (#)", type: "number", default: 0 },
      { key: "labs", label: "Laboratorios (#)", type: "number", default: 0 },
      { key: "campus_area_hectares", label: "Área del campus (hectáreas)", type: "number", default: 0 },
      { key: "enrolled_students", label: "Estudiantes matriculados", type: "number", default: 0 },
      { key: "has_dormitory", label: "¿Tiene residencias estudiantiles?", type: "boolean", default: false },
      ...COMMON_ENERGY_FIELDS,
    ],
  },
  restaurante: {
    title: "Detalles del restaurante",
    intro: "Para estimar consumo de cocina y zona de comedor.",
    fields: [
      { key: "tables", label: "Mesas (#)", type: "number", default: 0 },
      { key: "seating_capacity", label: "Capacidad total de comensales", type: "number", default: 0 },
      { key: "kitchen_appliances", label: "Electrodomésticos en cocina (#)", type: "number", default: 0 },
      { key: "avg_meals_per_day", label: "Comidas servidas por día (promedio)", type: "number", default: 0 },
      { key: "has_wood_oven", label: "¿Horno de leña?", type: "boolean", default: false },
      { key: "has_walk_in_freezer", label: "¿Cuarto frío walk-in?", type: "boolean", default: false },
      ...COMMON_ENERGY_FIELDS,
    ],
  },
  otro: {
    title: "Detalles adicionales",
    intro: "Cualquier dato extra que ayude al agente a calibrar sus recomendaciones.",
    fields: [
      { key: "facility_area_m2", label: "Área del establecimiento (m²)", type: "number", default: 0 },
      { key: "main_use", label: "Uso principal", type: "text", default: "" },
      ...COMMON_ENERGY_FIELDS,
    ],
  },
};

/** Build defaults for a freshly-selected sector. */
export function defaultsFor(sector: Sector): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const f of SECTOR_SCHEMAS[sector].fields) {
    if (f.default !== undefined) out[f.key] = f.default;
  }
  return out;
}

/** Decide if a field should be visible given current values. */
export function fieldVisible(field: FieldSpec, values: Record<string, unknown>): boolean {
  if (!field.showWhen) return true;
  return values[field.showWhen.key] === field.showWhen.equals;
}
