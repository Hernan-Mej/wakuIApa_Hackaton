import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import type { WeatherDay, WeatherForecastResponse } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import AnimatedNumber from "../components/AnimatedNumber";
import DashboardLayout from "../components/DashboardLayout";
import { cardStyle, colors, monoFont } from "../styles";

const SOLAR_EFFICIENCY = 0.8;
const TARIFA_COP_KWH = 943;

type Action = "harvest" | "store" | "supply" | "ration" | "neutral";

interface DayAnalysis {
  day: WeatherDay;
  solarKwh: number;          // generación solar esperada
  windKwh: number;           // generación eólica estimada
  totalKwh: number;
  dailyConsumption: number;
  coveragePct: number;
  excess: number;
  deficit: number;
  action: Action;
  actionLabel: string;
  actionDetail: string;
  actionEmoji: string;
}

const ACTION_THEMES: Record<Action, { color: string; bg: string; border: string }> = {
  harvest: { color: colors.success, bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.45)" },
  supply:  { color: colors.info,    bg: "rgba(6,182,212,0.12)", border: "rgba(6,182,212,0.45)" },
  store:   { color: colors.accent,  bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.45)" },
  ration:  { color: colors.danger,  bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.45)" },
  neutral: { color: colors.textMuted, bg: colors.surfaceStrong, border: colors.border },
};

export default function Forecast() {
  const { user, logout } = useAuth();
  const profile = user?.profile;

  const [forecast, setForecast] = useState<WeatherForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    apiFetch<WeatherForecastResponse>(
      `/api/weather/forecast?lat=${profile.latitude}&lon=${profile.longitude}&days=${days}`,
    )
      .then(setForecast)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [profile, days]);

  const analyses = useMemo(() => {
    if (!forecast || !profile) return [];
    return forecast.days.map((d) => analyseDay(d, profile));
  }, [forecast, profile]);

  if (!profile) {
    return (
      <DashboardLayout user={user} onLogout={logout} subtitle="PREDICCIÓN CLIMÁTICA">
        <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
          Completá tu perfil para usar las predicciones.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout user={user} onLogout={logout} subtitle="PREDICCIÓN CLIMÁTICA">
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>
          🌦️ Pronóstico solar + eólico
        </p>
        <h1 className="r-h1" style={{ margin: "4px 0 6px", fontWeight: 800 }}>
          ¿Qué hacer con tu energía esta semana?
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
          Combinamos NASA POWER + Open-Meteo + tu instalación para decirte cada día si conviene
          aprovechar, almacenar, vender o racionar.
        </p>
      </div>

      {/* Range selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[3, 7, 14].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            style={{
              padding: "8px 16px", borderRadius: 8,
              background: days === d ? colors.accent : colors.surface,
              color: days === d ? colors.textOnAccent : colors.text,
              border: `1px solid ${days === d ? colors.accent : colors.border}`,
              cursor: "pointer", fontSize: 12, fontWeight: 700,
              fontFamily: "inherit",
            }}
          >
            {d} días
          </button>
        ))}
        {forecast && (
          <span style={{
            marginLeft: "auto", alignSelf: "center", fontSize: 10,
            color: colors.textFaint, fontFamily: monoFont,
          }}>
            {forecast.source === "open-meteo" ? "✓ Open-Meteo real" : "datos referenciales"}
            {forecast.cached && " · cache"}
          </span>
        )}
      </div>

      {error && (
        <div style={{
          ...cardStyle, background: colors.dangerSoft,
          color: colors.danger, border: `1px solid ${colors.dangerBorder}`, marginBottom: 18,
        }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ ...cardStyle, textAlign: "center", padding: 30, color: colors.textMuted }}>
          Cargando pronóstico…
        </div>
      )}

      {forecast && analyses.length > 0 && (
        <>
          {/* Summary stats */}
          <div className="r-kpi-grid" style={{ marginBottom: 18 }}>
            <SummaryKpi
              emoji="☀️"
              label={`Generación esperada (${days} días)`}
              value={<AnimatedNumber value={analyses.reduce((s, a) => s + a.totalKwh, 0)} decimals={0} suffix=" kWh" />}
              sub="Solar + eólica combinadas"
              color={colors.success}
            />
            <SummaryKpi
              emoji="💧"
              label="Días con lluvia probable"
              value={<AnimatedNumber value={analyses.filter((a) => a.day.precipitation_probability_pct >= 50).length} decimals={0} suffix=" días" />}
              sub="Probabilidad ≥ 50%"
              color={colors.info}
            />
            <SummaryKpi
              emoji="🌬️"
              label="Viento promedio (80m)"
              value={
                <AnimatedNumber
                  value={analyses.reduce((s, a) => s + a.day.wind_speed_80m_max_ms, 0) / analyses.length}
                  decimals={1}
                  suffix=" m/s"
                />
              }
              sub="Excelente: > 7 m/s"
              color={colors.accent}
            />
            <SummaryKpi
              emoji="⚖️"
              label="Cobertura promedio"
              value={
                <AnimatedNumber
                  value={analyses.reduce((s, a) => s + a.coveragePct, 0) / analyses.length}
                  decimals={0}
                  suffix="%"
                />
              }
              sub="De tu consumo diario"
              color={colors.text}
            />
          </div>

          {/* Day-by-day analysis */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
            {analyses.map((a, i) => <DayCard key={i} analysis={a} />)}
          </div>
        </>
      )}

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <Link to="/dashboard" style={{ color: colors.accent, fontSize: 13 }}>
          ← Volver al dashboard
        </Link>
      </div>
    </DashboardLayout>
  );
}

// ─── Components ─────────────────────────────────────────────────────────────

function SummaryKpi({
  emoji, label, value, sub, color,
}: {
  emoji: string; label: string; value: React.ReactNode; sub: React.ReactNode; color: string;
}) {
  return (
    <div style={{ ...cardStyle, minWidth: 0 }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{emoji}</div>
      <div style={{ fontSize: 10, color: colors.textFaint, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: "clamp(18px, 3vw, 22px)", fontWeight: 800, color, fontFamily: monoFont, wordBreak: "break-word" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function DayCard({ analysis }: { analysis: DayAnalysis }) {
  const t = ACTION_THEMES[analysis.action];
  const date = new Date(analysis.day.date + "T00:00:00");
  const weekday = date.toLocaleDateString("es-CO", { weekday: "long" });
  const dayLabel = date.toLocaleDateString("es-CO", { day: "numeric", month: "short" });

  return (
    <div
      style={{
        ...cardStyle,
        borderLeft: `5px solid ${t.color}`,
        background: t.bg,
        padding: "clamp(14px, 3vw, 18px)",
      }}
    >
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))",
        gap: 14, alignItems: "center",
      }}>
        {/* Date + weather */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <div style={{ fontSize: 44, lineHeight: 1 }}>{weatherEmoji(analysis.day.weather_code)}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 11, color: colors.textFaint, letterSpacing: "1px",
              textTransform: "uppercase", fontFamily: monoFont,
            }}>
              {weekday} · {dayLabel}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.text, textTransform: "capitalize" }}>
              {analysis.day.weather_label}
            </div>
            <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
              {analysis.day.temperature_min_c.toFixed(0)}–{analysis.day.temperature_max_c.toFixed(0)}°C ·
              💧 {analysis.day.precipitation_probability_pct.toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Weather details */}
        <div style={{ minWidth: 0 }}>
          <Stat label="Radiación solar" value={`${analysis.day.radiation_kwh_m2.toFixed(2)} kWh/m²`} />
          <Stat label="Viento 80m" value={`${analysis.day.wind_speed_80m_max_ms.toFixed(1)} m/s`} />
          <Stat label="Lluvia" value={`${analysis.day.precipitation_mm.toFixed(1)} mm`} />
        </div>

        {/* Generation */}
        <div style={{ minWidth: 0 }}>
          <Stat label="Solar" value={`${analysis.solarKwh.toFixed(1)} kWh`} color={colors.accent} />
          {analysis.windKwh > 0 && (
            <Stat label="Eólica" value={`${analysis.windKwh.toFixed(1)} kWh`} color={colors.info} />
          )}
          <Stat
            label="Cobertura"
            value={`${analysis.coveragePct.toFixed(0)}%`}
            color={
              analysis.coveragePct >= 100 ? colors.success :
              analysis.coveragePct >= 60 ? colors.accent : colors.danger
            }
          />
        </div>

        {/* Action */}
        <div
          style={{
            background: colors.surface,
            border: `2px solid ${t.color}66`,
            borderRadius: 10, padding: 12, minWidth: 0,
          }}
        >
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "3px 8px", borderRadius: 999,
            background: t.bg, border: `1px solid ${t.color}88`,
            fontSize: 10, fontWeight: 700, color: t.color, fontFamily: monoFont,
            letterSpacing: "1px", marginBottom: 6,
          }}>
            {analysis.actionEmoji} {analysis.actionLabel}
          </div>
          <div style={{ fontSize: 12, color: colors.text, lineHeight: 1.5 }}>
            {analysis.actionDetail}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <span style={{ fontSize: 10, color: colors.textFaint, marginRight: 6 }}>{label}:</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color ?? colors.text, fontFamily: monoFont }}>
        {value}
      </span>
    </div>
  );
}

function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code >= 45 && code <= 48) return "🌫️";
  if (code >= 51 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 95) return "⛈️";
  return "🌤️";
}

// ─── Analysis logic ─────────────────────────────────────────────────────────

function analyseDay(
  day: WeatherDay,
  profile: NonNullable<ReturnType<typeof useAuth>["user"]>["profile"],
): DayAnalysis {
  if (!profile) {
    return {
      day, solarKwh: 0, windKwh: 0, totalKwh: 0,
      dailyConsumption: 0, coveragePct: 0, excess: 0, deficit: 0,
      action: "neutral",
      actionLabel: "—",
      actionDetail: "Sin datos de perfil",
      actionEmoji: "❓",
    };
  }

  const kwp = profile.solar_capacity_kwp ?? 0;
  const windKw = profile.wind_capacity_kw ?? 0;
  const wantsToSell = profile.wants_to_sell_energy;
  const batteryKwh = profile.battery_capacity_kwh ?? 0;
  const dailyConsumption = (profile.monthly_grid_consumption_kwh ?? 0) / 30;

  // Solar = kWp × radiación × PR
  const solarKwh = kwp * day.radiation_kwh_m2 * SOLAR_EFFICIENCY;

  // Wind: aproximación con curva de potencia simple (cap factor según velocidad)
  // capFactor(v) ≈ ((v - 3) / 9)^2 clamp 0..1, viable entre 3 y 12 m/s
  const v = day.wind_speed_80m_max_ms;
  let capFactor = 0;
  if (v >= 3 && v < 12) capFactor = Math.pow((v - 3) / 9, 2);
  else if (v >= 12 && v < 25) capFactor = 1;
  // Las turbinas operan ~promedio 50% del día al pico, así que tomamos ese factor
  const windKwh = windKw * 24 * capFactor * 0.5;

  const totalKwh = solarKwh + windKwh;
  const coverage = dailyConsumption > 0 ? (totalKwh / dailyConsumption) * 100 : 0;
  const excess = Math.max(0, totalKwh - dailyConsumption);
  const deficit = Math.max(0, dailyConsumption - totalKwh);

  // Decisión: action + detail
  let action: Action;
  let actionLabel: string;
  let actionDetail: string;
  let actionEmoji: string;

  if (kwp === 0 && windKw === 0) {
    action = "neutral";
    actionLabel = "SIN GENERACIÓN PROPIA";
    actionEmoji = "💡";
    actionDetail = `Consumirás ~${dailyConsumption.toFixed(0)} kWh de la red. ` +
      `Para arrancar a ahorrar usá la calculadora de inversión.`;
  } else if (coverage >= 130 && wantsToSell) {
    action = "supply";
    actionLabel = "VENDER EXCEDENTE";
    actionEmoji = "💵";
    const credit = excess * TARIFA_COP_KWH * 0.55;
    actionDetail = `Generación supera el consumo en ~${excess.toFixed(0)} kWh. ` +
      `Si exportás a la red, recibirías ~$${Math.round(credit).toLocaleString()} COP de crédito.`;
  } else if (coverage >= 130 && batteryKwh > 0) {
    action = "store";
    actionLabel = "ALMACENAR EXCEDENTE";
    actionEmoji = "🔋";
    const willStore = Math.min(excess, batteryKwh);
    actionDetail = `Excedente de ~${excess.toFixed(0)} kWh. Cargá baterías ` +
      `(podés almacenar ~${willStore.toFixed(0)} kWh) para los días nublados.`;
  } else if (coverage >= 90) {
    action = "harvest";
    actionLabel = "DÍA IDEAL — APROVECHAR";
    actionEmoji = "🌟";
    actionDetail = `Tu generación cubre prácticamente todo (${coverage.toFixed(0)}%). ` +
      `Programá lavandería, bombas, A/A para el mediodía.`;
  } else if (coverage >= 50) {
    action = "harvest";
    actionLabel = "BUEN DÍA SOLAR";
    actionEmoji = "☀️";
    actionDetail = `Cubrís ${coverage.toFixed(0)}% de tu consumo. ` +
      `Desplazá cargas pesadas a las 10:00–14:30 para minimizar la compra a la red.`;
  } else if (coverage >= 25 || day.precipitation_probability_pct >= 60) {
    action = "ration";
    actionLabel = "DÍA DE RACIONAR";
    actionEmoji = "⚠️";
    actionDetail = `Solo cubrís ${coverage.toFixed(0)}% del consumo y hay ${day.precipitation_probability_pct.toFixed(0)}% de lluvia. ` +
      `Aplazá cargas no esenciales y reservá batería para la noche.`;
  } else {
    action = "ration";
    actionLabel = "RACIONAR FUERTE";
    actionEmoji = "🚨";
    actionDetail = `Generación muy baja (${totalKwh.toFixed(0)} kWh vs ${dailyConsumption.toFixed(0)} consumidos). ` +
      `Considerá usar generador de respaldo si tenés, y evitar cargas no críticas.`;
  }

  return {
    day,
    solarKwh, windKwh, totalKwh,
    dailyConsumption, coveragePct: coverage,
    excess, deficit,
    action, actionLabel, actionDetail, actionEmoji,
  };
}
