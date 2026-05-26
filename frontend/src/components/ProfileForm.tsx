import { useEffect, useMemo, type CSSProperties } from "react";
import type {
  BatteryType,
  CompanyProfile,
  ExtraData,
  GeneratorFuel,
  Sector,
  UserType,
} from "../api/types";
import LocationPicker from "./LocationPicker";
import { defaultsFor, fieldVisible, SECTOR_SCHEMAS, type FieldSpec } from "../sectorSchemas";
import { colors, inputStyle, labelStyle, monoFont } from "../styles";

export const SECTORS: { value: Sector; label: string }[] = [
  { value: "hotel", label: "Hotel" },
  { value: "industrial", label: "Industrial" },
  { value: "retail", label: "Retail / Comercial" },
  { value: "hospital", label: "Hospital / Clínica" },
  { value: "oficina", label: "Oficinas" },
  { value: "educacion", label: "Educación" },
  { value: "restaurante", label: "Restaurante" },
  { value: "otro", label: "Otro" },
];

const BATTERY_TYPES: { value: BatteryType; label: string }[] = [
  { value: "none", label: "No tengo" },
  { value: "lithium", label: "Litio (LiFePO4)" },
  { value: "lead_acid", label: "Plomo-ácido" },
  { value: "agm", label: "AGM" },
  { value: "gel", label: "Gel" },
  { value: "other", label: "Otro" },
];

const GEN_FUELS: { value: GeneratorFuel; label: string }[] = [
  { value: "none", label: "No tengo generador" },
  { value: "diesel", label: "Diésel" },
  { value: "gasoline", label: "Gasolina" },
  { value: "lpg", label: "Gas LP" },
  { value: "natural_gas", label: "Gas natural" },
];

interface Props {
  userType: UserType;
  value: CompanyProfile;
  onChange: (next: CompanyProfile) => void;
}

export default function ProfileForm({ userType, value, onChange }: Props) {
  const isBusiness = userType === "business";
  const schema = isBusiness && value.sector ? SECTOR_SCHEMAS[value.sector] : null;

  // Re-seed sector-specific defaults if the business changes sector
  useEffect(() => {
    if (!isBusiness || !value.sector) return;
    const merged: ExtraData = { ...defaultsFor(value.sector), ...value.extra_data };
    const newKeys = Object.keys(merged).filter((k) => !(k in value.extra_data));
    if (newKeys.length > 0) {
      onChange({ ...value, extra_data: merged });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.sector, isBusiness]);

  function patch<K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) {
    onChange({ ...value, [k]: v });
  }

  function patchExtra(k: string, v: string | number | boolean) {
    onChange({ ...value, extra_data: { ...value.extra_data, [k]: v } });
  }

  // Computed totals (for display only — server also computes them)
  const totalKwp = (value.solar_panels_count * value.solar_panel_watts) / 1000;
  const totalBatteryKwh = value.battery_count * value.battery_kwh_each;
  const totalWindKw = value.wind_turbine_count * value.wind_turbine_kw_each;

  const groupedFields = useMemo(
    () => (schema ? groupBy(schema.fields) : null),
    [schema],
  );

  const identityLabel = isBusiness
    ? "Nombre de la empresa"
    : userType === "community"
    ? "Nombre de la comunidad"
    : "Nombre o seudónimo";

  return (
    <>
      <Section title="Identidad y ubicación">
        <Field label={identityLabel}>
          <input
            required value={value.display_name}
            onChange={(e) => patch("display_name", e.target.value)}
            style={inputStyle}
            placeholder={
              userType === "person" ? "Ej: Familia Pérez" :
              userType === "community" ? "Ej: Ranchería Wayuu Mayapo" :
              "Ej: Hotel Taroa"
            }
          />
        </Field>

        <LocationPicker
          latitude={value.latitude}
          longitude={value.longitude}
          address={value.address}
          onChange={(loc) => onChange({ ...value, ...loc })}
        />
      </Section>

      {isBusiness && (
        <Section title="Datos del negocio">
          <Grid cols={2}>
            <Field label="Sector">
              <select
                value={value.sector ?? "otro"}
                onChange={(e) => patch("sector", e.target.value as Sector)}
                style={inputStyle}
              >
                {SECTORS.map((s) => (
                  <option key={s.value} value={s.value} style={{ background: colors.bg }}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Horario operativo">
              <input
                value={value.operating_hours}
                onChange={(e) => patch("operating_hours", e.target.value)}
                placeholder="24/7 · Lun-Vie 8-18"
                style={inputStyle}
              />
            </Field>
          </Grid>
          <Grid cols={2}>
            <Field
              label="Cargas críticas (#)"
              hint="Equipos que NO se pueden quedar sin energía"
            >
              <input
                type="number" min={0}
                value={value.critical_loads_count}
                onChange={(e) => patch("critical_loads_count", Number(e.target.value))}
                style={inputStyle}
              />
            </Field>
            <Field
              label="Cargas flexibles (#)"
              hint="Cargas que se pueden apagar o desplazar"
            >
              <input
                type="number" min={0}
                value={value.flexible_loads_count}
                onChange={(e) => patch("flexible_loads_count", Number(e.target.value))}
                style={inputStyle}
              />
            </Field>
          </Grid>
        </Section>
      )}

      <Section title="Consumo y generación mensual">
        <Grid cols={2}>
          <Field
            label="Consumo de la red eléctrica (kWh/mes)"
            hint={
              userType === "person"
                ? "Lo que paga tu factura mensual de electricidad"
                : userType === "community"
                ? "Suma del consumo de los hogares que reciben red"
                : "Consumo mensual total facturado"
            }
          >
            <input
              type="number" min={0} required
              value={value.monthly_grid_consumption_kwh}
              onChange={(e) =>
                patch("monthly_grid_consumption_kwh", Number(e.target.value))
              }
              style={inputStyle}
            />
          </Field>
          <Field
            label="Generación propia actual (kWh/mes)"
            hint="Si ya tienes paneles o eólica, cuánto generan al mes (0 si no tienes)"
          >
            <input
              type="number" min={0}
              value={value.monthly_self_generation_kwh}
              onChange={(e) =>
                patch("monthly_self_generation_kwh", Number(e.target.value))
              }
              style={inputStyle}
            />
          </Field>
        </Grid>
        <label
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            background: colors.surfaceInput, border: `1px solid ${colors.borderStrong}`,
            borderRadius: 8, cursor: "pointer", fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            checked={value.wants_to_sell_energy}
            onChange={(e) => patch("wants_to_sell_energy", e.target.checked)}
            style={{ width: 16, height: 16, accentColor: colors.accent }}
          />
          ¿Te interesa vender la energía excedente (a la red o a la comunidad)?
        </label>
      </Section>

      <Section title="Paneles solares" accent>
        <p style={hintParaStyle}>
          Si no tienes, dejá los campos en 0 — la plataforma sirve para calcular tu inversión.
        </p>
        <Grid cols={3}>
          <Field label="Cantidad de paneles">
            <input
              type="number" min={0} value={value.solar_panels_count}
              onChange={(e) => patch("solar_panels_count", Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Capacidad por panel (W)" hint="Típico: 400-600W">
            <input
              type="number" min={0} step="10" value={value.solar_panel_watts}
              onChange={(e) => patch("solar_panel_watts", Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Inversor (kW)" hint="Capacidad del inversor que tienes">
            <input
              type="number" min={0} step="0.1" value={value.inverter_kw}
              onChange={(e) => patch("inverter_kw", Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
        </Grid>
        <TotalsBadge label="Total solar instalado" value={`${totalKwp.toFixed(2)} kWp`} />
      </Section>

      <Section title="Baterías" accent>
        <Grid cols={3}>
          <Field label="Cantidad">
            <input
              type="number" min={0} value={value.battery_count}
              onChange={(e) => patch("battery_count", Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Capacidad cada una (kWh)" hint="Típico: 2.4 / 5 / 10 kWh">
            <input
              type="number" min={0} step="0.1" value={value.battery_kwh_each}
              onChange={(e) => patch("battery_kwh_each", Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Tipo de batería">
            <select
              value={value.battery_type}
              onChange={(e) => patch("battery_type", e.target.value as BatteryType)}
              style={inputStyle}
            >
              {BATTERY_TYPES.map((b) => (
                <option key={b.value} value={b.value} style={{ background: colors.bg }}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
        </Grid>
        <TotalsBadge label="Total baterías" value={`${totalBatteryKwh.toFixed(1)} kWh`} />
      </Section>

      <Section title="Turbinas eólicas" accent>
        <p style={hintParaStyle}>
          La Guajira es la región con mejores vientos de Colombia (8-10 m/s en costa).
        </p>
        <Grid cols={2}>
          <Field label="Cantidad">
            <input
              type="number" min={0} value={value.wind_turbine_count}
              onChange={(e) => patch("wind_turbine_count", Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Potencia cada una (kW)" hint="Micro-eólicas típicas: 3-10 kW">
            <input
              type="number" min={0} step="0.1" value={value.wind_turbine_kw_each}
              onChange={(e) => patch("wind_turbine_kw_each", Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
        </Grid>
        <TotalsBadge label="Total eólica" value={`${totalWindKw.toFixed(2)} kW`} />
      </Section>

      <Section title="Generador de respaldo" accent>
        <Grid cols={2}>
          <Field label="Potencia (kW)" hint="0 si no tienes generador">
            <input
              type="number" min={0} step="0.5" value={value.generator_capacity_kw}
              onChange={(e) => patch("generator_capacity_kw", Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Combustible">
            <select
              value={value.generator_fuel}
              onChange={(e) => patch("generator_fuel", e.target.value as GeneratorFuel)}
              style={inputStyle}
            >
              {GEN_FUELS.map((g) => (
                <option key={g.value} value={g.value} style={{ background: colors.bg }}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>
        </Grid>
      </Section>

      {/* Dynamic sector-specific block (only for business) */}
      {isBusiness && schema && groupedFields && (
        <Section title={schema.title} accent>
          <p style={hintParaStyle}>{schema.intro}</p>
          {Object.entries(groupedFields).map(([group, fields]) => (
            <div key={group} style={group !== "_" ? { marginBottom: 18 } : undefined}>
              {group !== "_" && (
                <div style={subgroupHeaderStyle}>{group}</div>
              )}
              <Grid cols={2}>
                {fields
                  .filter((f) => fieldVisible(f, value.extra_data as Record<string, unknown>))
                  .map((field) => (
                    <ExtraField
                      key={field.key}
                      field={field}
                      value={value.extra_data[field.key] as string | number | boolean | undefined}
                      onChange={(v) => patchExtra(field.key, v)}
                    />
                  ))}
              </Grid>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ExtraField({
  field, value, onChange,
}: {
  field: FieldSpec;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
}) {
  return (
    <Field label={field.label} hint={field.hint}>
      {field.type === "boolean" ? (
        <label
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
            background: colors.surfaceInput, border: `1px solid ${colors.borderStrong}`,
            borderRadius: 8, cursor: "pointer", fontSize: 13,
          }}
        >
          <input
            type="checkbox" checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: colors.accent }}
          />
          {value ? "Sí" : "No"}
        </label>
      ) : field.type === "select" ? (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        >
          {field.options?.map((opt) => (
            <option key={opt} value={opt} style={{ background: colors.bg }}>{opt}</option>
          ))}
        </select>
      ) : field.type === "number" ? (
        <input
          type="number" min={0} step={0.1}
          value={value as number | undefined ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
          style={inputStyle}
        />
      ) : (
        <input
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
    </Field>
  );
}

function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  const wrapStyle: CSSProperties = accent
    ? {
        marginBottom: 22, padding: 18,
        border: `1px solid ${colors.accentBorder}`,
        background: colors.accentSoft,
        borderRadius: 12,
      }
    : { marginBottom: 22 };
  return (
    <div style={wrapStyle}>
      <div
        style={{
          fontSize: 10, letterSpacing: "2px", color: colors.accent,
          textTransform: "uppercase", marginBottom: 12, fontFamily: monoFont,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(min(220px, 100%), 1fr))`,
        gap: 14, marginBottom: 4,
        maxWidth: cols >= 3 ? "100%" : undefined,
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, minWidth: 0 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && (
        <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 4, lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function TotalsBadge({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        marginTop: 4, padding: "6px 12px",
        background: colors.bg, border: `1px solid ${colors.border}`,
        borderRadius: 999, fontSize: 11, fontFamily: monoFont,
      }}
    >
      <span style={{ color: colors.textMuted }}>{label}:</span>
      <strong style={{ color: colors.accent }}>{value}</strong>
    </div>
  );
}

function groupBy(fields: FieldSpec[]): Record<string, FieldSpec[]> {
  const out: Record<string, FieldSpec[]> = {};
  for (const f of fields) {
    const g = f.group ?? "_";
    if (!out[g]) out[g] = [];
    out[g].push(f);
  }
  return out;
}

const hintParaStyle: CSSProperties = {
  margin: "0 0 14px", fontSize: 12, color: colors.textMuted, lineHeight: 1.55,
};

const subgroupHeaderStyle: CSSProperties = {
  fontSize: 10, color: colors.textFaint, letterSpacing: "1.5px",
  textTransform: "uppercase", marginBottom: 10, fontFamily: monoFont,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

export function emptyProfile(userType: UserType): CompanyProfile {
  return {
    display_name: "",
    latitude: 11.5449,
    longitude: -72.9069,
    address: "",
    monthly_grid_consumption_kwh: userType === "person" ? 250 : userType === "community" ? 1500 : 5000,
    monthly_self_generation_kwh: 0,
    wants_to_sell_energy: false,
    solar_panels_count: 0,
    solar_panel_watts: 0,
    battery_count: 0,
    battery_kwh_each: 0,
    battery_type: "none",
    wind_turbine_count: 0,
    wind_turbine_kw_each: 0,
    generator_capacity_kw: 0,
    generator_fuel: "none",
    inverter_kw: 0,
    sector: userType === "business" ? "otro" : null,
    operating_hours: "24/7",
    critical_loads_count: 0,
    flexible_loads_count: 0,
    extra_data: userType === "business" ? defaultsFor("otro") : {},
  };
}
