import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "../../api/client";
import type {
  BlackoutStartResponse, ChatKind, CompanyProfile, WeatherForecastResponse,
} from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import AnimatedNumber from "../../components/AnimatedNumber";
import ChatPanel from "../../components/ChatPanel";
import DashboardLayout from "../../components/DashboardLayout";
import FloatingChatButton from "../../components/FloatingChatButton";
import StatusLight, { type StatusLevel } from "../../components/StatusLight";
import { cardStyle, colors, monoFont } from "../../styles";

const TARIFA_COP_KWH = 943;
const SOLAR_EFFICIENCY = 0.8;

interface ClimateMonthly {
  monthly: number[];
  annual: number | null;
  source: string;
  cached: boolean;
}

export default function PersonalDashboard() {
  const { user, logout } = useAuth();
  const profile = user?.profile;

  const [forecast, setForecast] = useState<WeatherForecastResponse | null>(null);
  const [climatology, setClimatology] = useState<ClimateMonthly | null>(null);
  const [blackout, setBlackout] = useState<BlackoutStartResponse | null>(null);
  const [blackoutLoading, setBlackoutLoading] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatKind, setChatKind] = useState<ChatKind>("general");
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);
  const [chatReloadKey, setChatReloadKey] = useState(0);

  useEffect(() => {
    if (!profile) return;
    apiFetch<ClimateMonthly>(
      `/api/solar/climatology?lat=${profile.latitude}&lon=${profile.longitude}`,
    ).then(setClimatology).catch(() => setClimatology(null));
    apiFetch<WeatherForecastResponse>(
      `/api/weather/forecast?lat=${profile.latitude}&lon=${profile.longitude}&days=7`,
    ).then(setForecast).catch(() => setForecast(null));
  }, [profile?.latitude, profile?.longitude]);

  const metrics = useMemo(() => compute(profile, climatology), [profile, climatology]);

  if (!profile) {
    return (
      <DashboardLayout user={user} onLogout={logout}>
        <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
          Completá tu perfil para empezar.
        </div>
      </DashboardLayout>
    );
  }

  function openPrediction() {
    setChatKind("prediction");
    setChatPrompt(
      `Genera mi predicción de energía de hoy con un lenguaje sencillo, usando analogías y emojis. ` +
      `Radiación esperada: ${metrics.todayRadiation.toFixed(2)} kWh/m²/día.`,
    );
    setChatReloadKey((k) => k + 1);
    setChatOpen(true);
  }

  async function triggerBlackout() {
    if (blackoutLoading) return;
    setBlackoutLoading(true);
    try {
      const res = await apiFetch<BlackoutStartResponse>("/api/blackout/start", { method: "POST" });
      setBlackout(res);
      setChatKind("blackout");
      setChatPrompt(null);
      setChatReloadKey((k) => k + 1);
      setChatOpen(true);
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : "desconocido"));
    } finally {
      setBlackoutLoading(false);
    }
  }

  function openChat() {
    setChatKind("general");
    setChatPrompt(null);
    setChatReloadKey((k) => k + 1);
    setChatOpen(true);
  }

  return (
    <DashboardLayout user={user} onLogout={logout} subtitle="MI ENERGÍA · RIOHACHA">
      {/* HERO con saludo + nombre */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>
          {greeting()}, 👋
        </p>
        <h1 className="r-h1" style={{ margin: "4px 0 6px", fontWeight: 800 }}>
          Hola, <span style={{ color: colors.accent }}>{profile.display_name}</span>
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
          {profile.has_any_renewable
            ? "Hoy te cuidamos del sol y la red eléctrica ☀️🔌"
            : "Aún no tienes paneles — te ayudamos a evaluar si te conviene 💡"}
        </p>
      </div>

      {/* SEMÁFORO grande arriba */}
      <div style={{ marginBottom: 18 }}>
        <StatusLight {...metrics.status} />
      </div>

      {/* 2 grandes botones de acción rápida */}
      <div className="r-actions" style={{ marginBottom: 18 }}>
        <BigActionButton
          color={colors.info}
          emoji="🔮"
          title="Predicción de hoy"
          subtitle="Qué va a pasar con tu energía hoy"
          onClick={openPrediction}
        />
        <BigActionButton
          color={colors.danger}
          emoji="🚨"
          title={blackoutLoading ? "Calculando..." : "¡Apagón!"}
          subtitle="Qué hacer si se va la luz"
          onClick={triggerBlackout}
          disabled={blackoutLoading}
        />
      </div>

      {/* KPIs grandes y simples */}
      <div className="r-kpi-grid" style={{ marginBottom: 18 }}>
        <BigKpi
          emoji="☀️"
          label="Tu sol de hoy"
          value={<AnimatedNumber value={metrics.dailyGenerationKwh} decimals={1} suffix=" kWh" />}
          sub={`Como tener ${Math.round(metrics.equivalentBulbs)} focos prendidos 5h`}
          color={colors.success}
        />
        <BigKpi
          emoji="🔌"
          label="Tu consumo del mes"
          value={
            <AnimatedNumber
              value={profile.monthly_grid_consumption_kwh}
              decimals={0}
              suffix=" kWh"
            />
          }
          sub={
            <>
              ≈ <AnimatedNumber
                value={metrics.monthlyCost}
                decimals={0}
                prefix="$"
                suffix=" COP"
              /> en factura
            </>
          }
          color={colors.accent}
        />
        <BigKpi
          emoji={metrics.coveragePct >= 80 ? "🌟" : metrics.coveragePct >= 40 ? "👍" : "🪫"}
          label="Cobertura solar"
          value={<AnimatedNumber value={metrics.coveragePct} decimals={0} suffix="%" />}
          sub="del consumo cubierto con tu propio sol"
          color={
            metrics.coveragePct >= 80 ? colors.success :
            metrics.coveragePct >= 40 ? colors.accent : colors.danger
          }
        />
        <BigKpi
          emoji="💰"
          label="Ahorro al mes"
          value={
            <AnimatedNumber
              value={metrics.monthlySavingsCop}
              decimals={0}
              prefix="$"
              suffix=" COP"
            />
          }
          sub={metrics.monthlySavingsCop > 0 ? "Lo que te ahorras gracias al sol" : "Aún no generas energía propia"}
          color={colors.success}
        />
      </div>

      {/* Pronóstico de la semana */}
      <div style={{ ...cardStyle, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, flexWrap: "wrap", gap: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🗓️ Esta semana en Riohacha</h3>
          <span style={{ fontSize: 11, color: colors.textFaint, fontFamily: monoFont }}>
            {forecast?.source === "open-meteo" ? "✓ pronóstico real" : "datos referenciales"}
          </span>
        </div>
        {forecast ? (
          <WeekForecast forecast={forecast} />
        ) : (
          <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", color: colors.textFaint, fontSize: 13 }}>
            Cargando pronóstico…
          </div>
        )}
      </div>

      {/* Recomendación amigable + chat info */}
      <div style={{ ...cardStyle, marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700 }}>
          💬 ¿Necesitas ayuda?
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: colors.textMuted, lineHeight: 1.6 }}>
          Pregúntale al agente cualquier cosa: <em>"¿me conviene comprar más paneles?"</em>,{" "}
          <em>"¿qué hago si llueve toda la semana?"</em>, <em>"¿cuánto ahorro si apago el aire de noche?"</em>
        </p>
        <button
          onClick={openChat}
          style={{
            background: colors.accent, color: colors.textOnAccent, border: "none",
            borderRadius: 10, padding: "12px 18px", fontWeight: 700, cursor: "pointer",
            fontSize: 14, fontFamily: "inherit",
          }}
        >
          💬 Chatear con WakuAIpa
        </button>
        {blackout && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: colors.dangerSoft,
              border: `1px solid ${colors.dangerBorder}`,
              borderRadius: 10,
              fontSize: 12,
              color: colors.textMuted,
            }}
          >
            <strong style={{ color: colors.danger }}>Última simulación apagón:</strong>{" "}
            te alcanza para ~{blackout.estimated_autonomy_hours.toFixed(1)} horas.
          </div>
        )}
      </div>

      <FloatingChatButton onClick={openChat} hidden={chatOpen} />
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        initialKind={chatKind}
        initialPrompt={chatPrompt}
        reloadKey={chatReloadKey}
      />
    </DashboardLayout>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function BigActionButton({
  color, emoji, title, subtitle, onClick, disabled,
}: {
  color: string; emoji: string; title: string; subtitle: string;
  onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: colors.surface,
        border: `2px solid ${color}55`,
        borderRadius: 14,
        padding: "clamp(14px, 3vw, 20px)",
        cursor: disabled ? "wait" : "pointer",
        textAlign: "left",
        color: colors.text,
        fontFamily: "inherit",
        opacity: disabled ? 0.6 : 1,
        transition: "transform 0.15s, border-color 0.15s",
        display: "flex", alignItems: "center", gap: 14,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}55`;
      }}
    >
      <div style={{ fontSize: 38, lineHeight: 1 }}>{emoji}</div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color }}>{title}</div>
        <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{subtitle}</div>
      </div>
    </button>
  );
}

function BigKpi({
  emoji, label, value, sub, color,
}: {
  emoji: string; label: string;
  value: React.ReactNode; sub: React.ReactNode; color: string;
}) {
  return (
    <div style={{ ...cardStyle, minWidth: 0, position: "relative", overflow: "hidden" }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{emoji}</div>
      <div style={{ fontSize: 11, color: colors.textFaint, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: "clamp(22px, 4vw, 28px)", fontWeight: 800, color, fontFamily: monoFont, wordBreak: "break-word" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function WeekForecast({ forecast }: { forecast: WeatherForecastResponse }) {
  const maxRad = Math.max(...forecast.days.map((d) => d.radiation_kwh_m2));
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100px, 100%), 1fr))`,
        gap: 8,
      }}
    >
      {forecast.days.map((d) => {
        const date = new Date(d.date + "T00:00:00");
        const weekday = date.toLocaleDateString("es-CO", { weekday: "short" });
        const dayNum = date.getDate();
        const emoji = weatherEmoji(d.weather_code);
        const radPct = maxRad > 0 ? (d.radiation_kwh_m2 / maxRad) * 100 : 0;
        const radColor =
          d.radiation_kwh_m2 >= 5.5 ? colors.success :
          d.radiation_kwh_m2 >= 3.5 ? colors.accent : colors.danger;
        return (
          <div
            key={d.date}
            style={dayCellStyle}
            title={`${d.weather_label} · ${d.precipitation_probability_pct.toFixed(0)}% lluvia`}
          >
            <div style={{ fontSize: 10, color: colors.textFaint, textTransform: "uppercase" }}>
              {weekday}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{dayNum}</div>
            <div style={{ fontSize: 28, lineHeight: 1, margin: "6px 0" }}>{emoji}</div>
            <div style={{ height: 4, width: "100%", background: colors.border, borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
              <div
                style={{
                  width: `${radPct}%`, height: "100%", background: radColor,
                  transition: "width 0.8s",
                }}
              />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: radColor, fontFamily: monoFont }}>
              {d.radiation_kwh_m2.toFixed(1)}
            </div>
            <div style={{ fontSize: 9, color: colors.textFaint }}>kWh/m²</div>
            {d.precipitation_probability_pct >= 60 && (
              <div style={{ fontSize: 9, color: colors.info, marginTop: 2 }}>
                💧 {d.precipitation_probability_pct.toFixed(0)}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const dayCellStyle: CSSProperties = {
  background: colors.surfaceStrong,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: "10px 6px",
  textAlign: "center",
  minWidth: 0,
};

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

// ─── Compute helpers ────────────────────────────────────────────────────────

interface PersonalMetrics {
  todayRadiation: number;
  dailyGenerationKwh: number;
  monthlyGenerationKwh: number;
  coveragePct: number;
  monthlySavingsCop: number;
  monthlyCost: number;
  equivalentBulbs: number;
  status: { level: StatusLevel; title: string; message: string; detail?: string; emoji?: string };
}

function compute(
  profile: CompanyProfile | null | undefined,
  clim: ClimateMonthly | null,
): PersonalMetrics {
  const today = new Date().getMonth();
  const todayRad = clim ? clim.monthly[today] : 5.5;
  const kwp = profile?.solar_capacity_kwp ?? 0;
  const dailyGen = kwp * todayRad * SOLAR_EFFICIENCY;
  const monthlyGen = dailyGen * 30;
  const consumption = profile?.monthly_grid_consumption_kwh ?? 0;
  const coverage = consumption > 0 ? Math.min(100, (monthlyGen / consumption) * 100) : 0;
  const savings = Math.round(Math.min(monthlyGen, consumption) * TARIFA_COP_KWH);
  const monthlyCost = Math.round(consumption * TARIFA_COP_KWH);
  const equivalentBulbs = dailyGen > 0 ? (dailyGen * 1000) / (10 * 5) : 0;

  let status: PersonalMetrics["status"];
  if (!profile?.has_any_renewable) {
    status = {
      level: "yellow",
      title: "Aún no aprovechas el sol",
      message:
        "Tu vivienda no tiene paneles solares. Podemos calcular cuánto ahorrarías si instalas algunos — sin compromiso.",
      detail: `Consumes ~${consumption.toLocaleString()} kWh/mes (~$${monthlyCost.toLocaleString()} COP)`,
      emoji: "💡",
    };
  } else if (coverage >= 80) {
    status = {
      level: "green",
      title: "¡Excelente! Tu sol te alcanza",
      message:
        `Tu sistema cubre el ${coverage.toFixed(0)}% de tu consumo. Estás ahorrando como un campeón ⚡`,
      detail: `Generación esperada: ${monthlyGen.toFixed(0)} kWh/mes · Ahorro: $${savings.toLocaleString()} COP`,
      emoji: "🌟",
    };
  } else if (coverage >= 40) {
    status = {
      level: "yellow",
      title: "Vas bien, pero hay margen",
      message:
        `Tu sol cubre el ${coverage.toFixed(0)}% de lo que gastas. Con un par de paneles más podrías subir mucho.`,
      detail: `Generación: ${monthlyGen.toFixed(0)} kWh/mes de ${consumption.toLocaleString()} consumidos`,
      emoji: "🌤️",
    };
  } else {
    status = {
      level: "red",
      title: "Tu sistema queda corto",
      message:
        coverage > 0
          ? `Solo el ${coverage.toFixed(0)}% de tu consumo viene del sol. Conviene ampliar paneles o baterías.`
          : "Tu sistema no está generando suficiente. Revisemos qué pasa.",
      detail: `Consumo ${consumption.toLocaleString()} kWh/mes vs generación ${monthlyGen.toFixed(0)} kWh/mes`,
      emoji: "⚡",
    };
  }

  return {
    todayRadiation: todayRad,
    dailyGenerationKwh: dailyGen,
    monthlyGenerationKwh: monthlyGen,
    coveragePct: coverage,
    monthlySavingsCop: savings,
    monthlyCost,
    equivalentBulbs,
    status,
  };
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}
