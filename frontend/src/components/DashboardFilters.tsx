import type { CSSProperties } from "react";
import { colors, monoFont } from "../styles";

export type WeatherMode = "sunny" | "cloudy" | "rain" | "storm";

export const WEATHER_MULTIPLIERS: Record<WeatherMode, number> = {
  sunny: 1.0,
  cloudy: 0.6,
  rain: 0.3,
  storm: 0.15,
};

export const WEATHER_META: Record<WeatherMode, { label: string; emoji: string; hint: string }> = {
  sunny:  { label: "Sol",      emoji: "☀️", hint: "Cielo despejado · radiación 100%" },
  cloudy: { label: "Nublado",  emoji: "⛅", hint: "Cielo cubierto · radiación ~60%" },
  rain:   { label: "Lluvia",   emoji: "🌧️", hint: "Lluvia intensa · radiación ~30%" },
  storm:  { label: "Tormenta", emoji: "⛈️", hint: "Tormenta · radiación ~15%" },
};

export interface FilterState {
  monthIndex: number;
  pr: number;          // Performance Ratio 0..1
  solarKwp: number;
  tariff: number;
  weather: WeatherMode;
}

interface Props {
  value: FilterState;
  defaults: FilterState;
  onChange: (next: FilterState) => void;
}

const MONTHS_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function DashboardFilters({ value, defaults, onChange }: Props) {
  const isSim =
    value.monthIndex !== defaults.monthIndex ||
    value.pr !== defaults.pr ||
    value.solarKwp !== defaults.solarKwp ||
    value.tariff !== defaults.tariff ||
    value.weather !== defaults.weather;

  function patch<K extends keyof FilterState>(k: K, v: FilterState[K]) {
    onChange({ ...value, [k]: v });
  }

  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${isSim ? colors.accentBorder : colors.border}`,
        borderRadius: 14,
        padding: "clamp(12px, 2.5vw, 18px)",
        marginBottom: 16,
        boxShadow: colors.shadow,
        transition: "border-color 0.25s",
      }}
    >
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, gap: 10, flexWrap: "wrap",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          fontSize: 11, color: colors.textMuted, letterSpacing: "2px",
          textTransform: "uppercase", fontFamily: monoFont,
        }}>
          <span>Filtros · Simulación en tiempo real</span>
          {isSim && (
            <span style={{
              fontSize: 9, padding: "2px 8px", borderRadius: 999,
              background: colors.accentSoft, color: colors.accent,
              border: `1px solid ${colors.accentBorder}`, letterSpacing: "1px",
            }}>
              🔬 SIMULANDO
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(defaults)}
          disabled={!isSim}
          style={{
            background: "transparent",
            color: isSim ? colors.accent : colors.textFaint,
            border: `1px solid ${isSim ? colors.accentBorder : colors.border}`,
            borderRadius: 8, padding: "6px 12px", fontSize: 11,
            cursor: isSim ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            opacity: isSim ? 1 : 0.5,
          }}
        >
          ↻ Restablecer
        </button>
      </div>

      <div style={gridStyle}>
        {/* Month */}
        <FilterField label="Mes" hint={`Real: ${MONTHS_FULL[defaults.monthIndex]}`}
          highlight={value.monthIndex !== defaults.monthIndex}>
          <select
            value={value.monthIndex}
            onChange={(e) => patch("monthIndex", Number(e.target.value))}
            style={selectStyle}
          >
            {MONTHS_FULL.map((m, i) => (
              <option key={m} value={i} style={{ background: colors.bg, color: colors.text }}>
                {m}{i === defaults.monthIndex ? " (actual)" : ""}
              </option>
            ))}
          </select>
        </FilterField>

        {/* Performance Ratio */}
        <FilterField
          label="Performance ratio"
          hint={`Eficiencia del sistema · default ${(defaults.pr * 100).toFixed(0)}%`}
          value={`${(value.pr * 100).toFixed(0)}%`}
          highlight={value.pr !== defaults.pr}
        >
          <input
            type="range" min={0.5} max={0.95} step={0.01}
            value={value.pr}
            onChange={(e) => patch("pr", Number(e.target.value))}
            style={rangeStyle}
          />
        </FilterField>

        {/* Solar kWp (what-if) */}
        <FilterField
          label="Capacidad solar (what-if)"
          hint={`Instalada: ${defaults.solarKwp} kWp`}
          value={`${value.solarKwp.toFixed(0)} kWp`}
          highlight={value.solarKwp !== defaults.solarKwp}
        >
          <input
            type="range"
            min={0}
            max={Math.max(500, Math.ceil(defaults.solarKwp * 2.5))}
            step={1}
            value={value.solarKwp}
            onChange={(e) => patch("solarKwp", Number(e.target.value))}
            style={rangeStyle}
          />
        </FilterField>

        {/* Tariff */}
        <FilterField
          label="Tarifa eléctrica"
          hint="Default Riohacha 943 COP/kWh"
          value={`$${value.tariff} COP`}
          highlight={value.tariff !== defaults.tariff}
        >
          <input
            type="range" min={500} max={1800} step={25}
            value={value.tariff}
            onChange={(e) => patch("tariff", Number(e.target.value))}
            style={rangeStyle}
          />
        </FilterField>

        {/* Weather condition (rain mode) */}
        <FilterField
          label="Condición climática"
          hint={WEATHER_META[value.weather].hint}
          value={`${WEATHER_META[value.weather].emoji} ${(WEATHER_MULTIPLIERS[value.weather] * 100).toFixed(0)}%`}
          highlight={value.weather !== defaults.weather}
        >
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginTop: 4,
          }}>
            {(Object.keys(WEATHER_META) as WeatherMode[]).map((mode) => {
              const active = value.weather === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => patch("weather", mode)}
                  title={WEATHER_META[mode].hint}
                  aria-pressed={active}
                  style={{
                    padding: "6px 4px",
                    fontSize: 14,
                    background: active ? colors.accentSoft : colors.surfaceInput,
                    border: `1px solid ${active ? colors.accentBorder : colors.borderStrong}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    color: colors.text,
                    transition: "background 0.15s, border-color 0.15s",
                  }}
                >
                  {WEATHER_META[mode].emoji}
                </button>
              );
            })}
          </div>
        </FilterField>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function FilterField({
  label, hint, value, highlight, children,
}: {
  label: string;
  hint?: string;
  value?: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      minWidth: 0,
      padding: 10,
      borderRadius: 10,
      background: highlight ? colors.accentSoft : "transparent",
      border: `1px solid ${highlight ? colors.accentBorder : colors.border}`,
      transition: "background 0.2s, border-color 0.2s",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 8, marginBottom: 6,
      }}>
        <span style={{
          fontSize: 10, color: colors.textMuted, fontFamily: monoFont,
          letterSpacing: "1px", textTransform: "uppercase",
        }}>
          {label}
        </span>
        {value && (
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: highlight ? colors.accent : colors.text,
            fontFamily: monoFont,
          }}>
            {value}
          </span>
        )}
      </div>
      {children}
      {hint && (
        <div style={{ fontSize: 9, color: colors.textFaint, marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
}

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
  gap: 10,
};

const selectStyle: CSSProperties = {
  width: "100%", minWidth: 0,
  background: colors.surfaceInput,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 8, padding: "8px 10px",
  color: colors.text, fontFamily: "inherit", fontSize: 13,
  outline: "none",
};

const rangeStyle: CSSProperties = {
  width: "100%",
  accentColor: "var(--c-accent)",
  marginTop: 4,
};
