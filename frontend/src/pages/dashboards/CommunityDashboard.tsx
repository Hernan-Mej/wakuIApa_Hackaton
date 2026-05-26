import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "../../api/client";
import type {
  BlackoutStartResponse,
  ChatKind,
  CompanyProfile,
  NetMeteringResponse,
  WeatherForecastResponse,
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

export default function CommunityDashboard() {
  const { user, logout } = useAuth();
  const profile = user?.profile;

  const [forecast, setForecast] = useState<WeatherForecastResponse | null>(null);
  const [climatology, setClimatology] = useState<ClimateMonthly | null>(null);
  const [netMetering, setNetMetering] = useState<NetMeteringResponse | null>(null);
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
    if ((profile.solar_capacity_kwp ?? 0) > 0) {
      apiFetch<NetMeteringResponse>("/api/net-metering/balance")
        .then(setNetMetering).catch(() => setNetMetering(null));
    }
  }, [profile?.latitude, profile?.longitude, profile?.solar_capacity_kwp]);

  const metrics = useMemo(() => compute(profile, climatology), [profile, climatology]);

  if (!profile) {
    return (
      <DashboardLayout user={user} onLogout={logout}>
        <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
          Completá el perfil de la comunidad para empezar.
        </div>
      </DashboardLayout>
    );
  }

  const householdCount = (profile.extra_data?.household_count as number) ?? 1;
  const sharedItems = (profile.extra_data?.shared_infrastructure as string[]) ?? [];

  function openPrediction() {
    setChatKind("prediction");
    setChatPrompt(
      `Genera la predicción colectiva de energía para hoy. Considera que somos ` +
      `${householdCount} hogares compartiendo recursos. Lenguaje sencillo, con foco en ` +
      `cómo repartir mejor entre vecinos. Radiación: ${metrics.todayRadiation.toFixed(2)} kWh/m²/día.`,
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
    <DashboardLayout user={user} onLogout={logout} subtitle="COMUNIDAD · RIOHACHA">
      {/* Hero */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>
          🏘️ Comunidad
        </p>
        <h1 className="r-h1" style={{ margin: "4px 0 6px", fontWeight: 800 }}>
          {profile.display_name}
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
          {householdCount > 1
            ? `${householdCount} hogares · ${sharedItems.length} servicios compartidos`
            : "Energía colectiva para tu comunidad"}
        </p>
      </div>

      <div style={{ marginBottom: 18 }}>
        <StatusLight {...metrics.status} />
      </div>

      <div className="r-actions" style={{ marginBottom: 18 }}>
        <BigActionButton
          color={colors.info}
          emoji="🔮"
          title="Predicción colectiva"
          subtitle="Cómo repartir la energía hoy"
          onClick={openPrediction}
        />
        <BigActionButton
          color={colors.danger}
          emoji="🚨"
          title={blackoutLoading ? "Calculando..." : "Modo apagón"}
          subtitle="Plan de respaldo para todos"
          onClick={triggerBlackout}
          disabled={blackoutLoading}
        />
      </div>

      {/* KPIs colectivos */}
      <div className="r-kpi-grid" style={{ marginBottom: 18 }}>
        <BigKpi
          emoji="🏘️"
          label="Hogares conectados"
          value={<AnimatedNumber value={householdCount} decimals={0} />}
          sub={
            householdCount > 0 && metrics.monthlyGenerationKwh > 0
              ? `~${(metrics.monthlyGenerationKwh / householdCount).toFixed(0)} kWh/hogar/mes generados`
              : "Define cuántos hogares forman la comunidad"
          }
          color={colors.accent}
        />
        <BigKpi
          emoji="☀️"
          label="Energía solar hoy"
          value={<AnimatedNumber value={metrics.dailyGenerationKwh} decimals={1} suffix=" kWh" />}
          sub={
            metrics.dailyGenerationKwh > 0
              ? `Alcanza para ~${Math.round(metrics.equivalentHouseholdsToday)} hogares un día completo`
              : "Sin generación propia hoy"
          }
          color={colors.success}
        />
        <BigKpi
          emoji="🔌"
          label="Consumo del mes"
          value={
            <AnimatedNumber
              value={profile.monthly_grid_consumption_kwh}
              decimals={0}
              suffix=" kWh"
            />
          }
          sub={
            <>
              Factura colectiva ≈{" "}
              <AnimatedNumber value={metrics.monthlyCost} decimals={0} prefix="$" suffix=" COP" />
            </>
          }
          color={colors.text}
        />
        <BigKpi
          emoji="💰"
          label="Beneficio mensual"
          value={
            <AnimatedNumber
              value={netMetering?.annual_net_balance_cop
                ? netMetering.annual_net_balance_cop / 12
                : metrics.monthlySavingsCop}
              decimals={0}
              prefix="$"
              suffix=" COP"
            />
          }
          sub={
            netMetering && netMetering.annual_excess_kwh > 0
              ? `+ ${(netMetering.annual_excess_kwh / 12).toFixed(0)} kWh/mes para vender`
              : metrics.monthlySavingsCop > 0
              ? "Ahorrado colectivamente"
              : "Aún sin generación"
          }
          color={colors.success}
        />
      </div>

      {/* Reparto entre hogares */}
      {householdCount > 1 && metrics.monthlyGenerationKwh > 0 && (
        <div style={{ ...cardStyle, marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700 }}>
            👥 Reparto colectivo
          </h3>
          <ShareBar
            generated={metrics.monthlyGenerationKwh}
            consumed={profile.monthly_grid_consumption_kwh}
            households={householdCount}
            wantsToSell={profile.wants_to_sell_energy}
          />
        </div>
      )}

      {/* Pronóstico de la semana */}
      <div style={{ ...cardStyle, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, flexWrap: "wrap", gap: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🗓️ Esta semana</h3>
          <span style={{ fontSize: 11, color: colors.textFaint, fontFamily: monoFont }}>
            {forecast?.source === "open-meteo" ? "✓ pronóstico real" : "datos referenciales"}
          </span>
        </div>
        {forecast ? (
          <WeekForecast forecast={forecast} householdCount={householdCount} />
        ) : (
          <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", color: colors.textFaint, fontSize: 13 }}>
            Cargando pronóstico…
          </div>
        )}
      </div>

      {/* Infraestructura compartida */}
      {sharedItems.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>
            🏗️ Servicios compartidos
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {sharedItems.map((item, i) => (
              <span key={i} style={chipStyle}>
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...cardStyle, marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700 }}>
          💬 Consultá al agente
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: colors.textMuted, lineHeight: 1.6 }}>
          Preguntas típicas: <em>"¿cómo repartimos el excedente?"</em>,{" "}
          <em>"¿cuántas baterías más necesitamos?"</em>,{" "}
          <em>"si crece la comunidad a {householdCount + 10} hogares, ¿alcanza?"</em>
        </p>
        <button
          onClick={openChat}
          style={{
            background: colors.accent, color: colors.textOnAccent, border: "none",
            borderRadius: 10, padding: "12px 18px", fontWeight: 700, cursor: "pointer",
            fontSize: 14, fontFamily: "inherit",
          }}
        >
          💬 Abrir chat
        </button>
        {blackout && (
          <div
            style={{
              marginTop: 14, padding: 12,
              background: colors.dangerSoft,
              border: `1px solid ${colors.dangerBorder}`,
              borderRadius: 10, fontSize: 12, color: colors.textMuted,
            }}
          >
            <strong style={{ color: colors.danger }}>Autonomía colectiva estimada:</strong>{" "}
            ~{blackout.estimated_autonomy_hours.toFixed(1)}h con baterías + generador.
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

// ─── Reusable bits (mismos estilos que PersonalDashboard) ─────────────────

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
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = color;
        }
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
    <div style={{ ...cardStyle, minWidth: 0 }}>
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

function ShareBar({
  generated, consumed, households, wantsToSell,
}: {
  generated: number; consumed: number; households: number; wantsToSell: boolean;
}) {
  const total = Math.max(generated, consumed);
  const selfConsumed = Math.min(generated, consumed);
  const excess = Math.max(0, generated - consumed);
  const deficit = Math.max(0, consumed - generated);

  const selfPct = (selfConsumed / total) * 100;
  const excessPct = (excess / total) * 100;
  const deficitPct = (deficit / total) * 100;

  return (
    <div>
      <div
        style={{
          display: "flex", height: 28, borderRadius: 14, overflow: "hidden",
          background: colors.surfaceStrong, border: `1px solid ${colors.border}`,
        }}
      >
        {selfPct > 0 && (
          <div
            style={{
              width: `${selfPct}%`, background: colors.success, display: "flex",
              alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 11, fontWeight: 700, fontFamily: monoFont,
            }}
            title={`Auto-consumido: ${selfConsumed.toFixed(0)} kWh`}
          >
            {selfPct > 14 ? `${selfPct.toFixed(0)}% propia` : ""}
          </div>
        )}
        {excessPct > 0 && (
          <div
            style={{
              width: `${excessPct}%`, background: colors.info, display: "flex",
              alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 11, fontWeight: 700, fontFamily: monoFont,
            }}
            title={`Excedente: ${excess.toFixed(0)} kWh`}
          >
            {excessPct > 14 ? `${excessPct.toFixed(0)}% excedente` : ""}
          </div>
        )}
        {deficitPct > 0 && (
          <div
            style={{
              width: `${deficitPct}%`, background: colors.danger + "cc", display: "flex",
              alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 11, fontWeight: 700, fontFamily: monoFont,
            }}
            title={`Déficit (compra a la red): ${deficit.toFixed(0)} kWh`}
          >
            {deficitPct > 14 ? `${deficitPct.toFixed(0)}% red` : ""}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
          gap: 10, marginTop: 14, fontSize: 12,
        }}
      >
        <ShareCell
          color={colors.success}
          label="Auto-consumida"
          value={`${selfConsumed.toFixed(0)} kWh`}
          sub={`~${(selfConsumed / households).toFixed(0)} kWh por hogar`}
        />
        {excess > 0 && (
          <ShareCell
            color={colors.info}
            label={wantsToSell ? "💵 Excedente para vender" : "Excedente sin uso"}
            value={`${excess.toFixed(0)} kWh`}
            sub={
              wantsToSell
                ? `~$${Math.round(excess * TARIFA_COP_KWH * 0.55).toLocaleString()} COP potenciales`
                : "Activá venta de energía en el perfil"
            }
          />
        )}
        {deficit > 0 && (
          <ShareCell
            color={colors.danger}
            label="Comprado a la red"
            value={`${deficit.toFixed(0)} kWh`}
            sub={`~$${Math.round(deficit * TARIFA_COP_KWH).toLocaleString()} COP`}
          />
        )}
      </div>
    </div>
  );
}

function ShareCell({ color, label, value, sub }: { color: string; label: string; value: string; sub: string }) {
  return (
    <div
      style={{
        padding: 12, borderRadius: 10,
        background: colors.surfaceStrong, border: `1px solid ${color}55`,
      }}
    >
      <div style={{ fontSize: 10, color: colors.textFaint, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: monoFont }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function WeekForecast({ forecast, householdCount }: { forecast: WeatherForecastResponse; householdCount: number }) {
  const maxRad = Math.max(...forecast.days.map((d) => d.radiation_kwh_m2));
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(min(110px, 100%), 1fr))`,
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
          <div key={d.date} style={dayCellStyle}>
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
            {householdCount > 0 && d.radiation_kwh_m2 > 0 && (
              <div style={{ fontSize: 9, color: colors.textMuted, marginTop: 2 }}>
                ≈ {Math.round((d.radiation_kwh_m2 * 5) / Math.max(1, householdCount))} kWh/hogar
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

const chipStyle: CSSProperties = {
  padding: "6px 12px",
  background: colors.surfaceStrong,
  border: `1px solid ${colors.border}`,
  borderRadius: 999,
  fontSize: 12,
  color: colors.text,
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

interface CommunityMetrics {
  todayRadiation: number;
  dailyGenerationKwh: number;
  monthlyGenerationKwh: number;
  coveragePct: number;
  monthlySavingsCop: number;
  monthlyCost: number;
  equivalentHouseholdsToday: number;
  status: { level: StatusLevel; title: string; message: string; detail?: string; emoji?: string };
}

function compute(
  profile: CompanyProfile | null | undefined,
  clim: ClimateMonthly | null,
): CommunityMetrics {
  const today = new Date().getMonth();
  const todayRad = clim ? clim.monthly[today] : 5.5;
  const kwp = profile?.solar_capacity_kwp ?? 0;
  const dailyGen = kwp * todayRad * SOLAR_EFFICIENCY;
  const monthlyGen = dailyGen * 30;
  const consumption = profile?.monthly_grid_consumption_kwh ?? 0;
  const householdCount = ((profile?.extra_data?.household_count as number) ?? 1);
  const avgKwhPerHomeDay = consumption / 30 / householdCount; // kWh/hogar/día
  const equivalentHouseholds = avgKwhPerHomeDay > 0 ? dailyGen / avgKwhPerHomeDay : 0;
  const coverage = consumption > 0 ? Math.min(100, (monthlyGen / consumption) * 100) : 0;
  const savings = Math.round(Math.min(monthlyGen, consumption) * TARIFA_COP_KWH);
  const monthlyCost = Math.round(consumption * TARIFA_COP_KWH);

  let status: CommunityMetrics["status"];
  if (!profile?.has_any_renewable) {
    status = {
      level: "yellow",
      title: "La comunidad depende 100% de la red",
      message:
        `Aún no tienen fuentes propias. Con energía colectiva podrían ahorrar ` +
        `~$${monthlyCost.toLocaleString()} COP/mes y blindarse de cortes.`,
      detail: `${householdCount} hogares conectados`,
      emoji: "🏘️",
    };
  } else if (coverage >= 80) {
    status = {
      level: "green",
      title: "La comunidad casi se autoabastece",
      message:
        `Cubren el ${coverage.toFixed(0)}% del consumo colectivo con energía propia. ` +
        `Estamos en muy buen camino ✨`,
      detail: `${monthlyGen.toFixed(0)} kWh/mes generados · ${householdCount} hogares beneficiados`,
      emoji: "🌟",
    };
  } else if (coverage >= 40) {
    status = {
      level: "yellow",
      title: "Buena base, ampliar conviene",
      message:
        `Cubren ${coverage.toFixed(0)}% del consumo. Sumando paneles o turbinas se ` +
        `puede reducir mucho la factura grupal.`,
      detail: `${monthlyGen.toFixed(0)} kWh/mes propios · ${consumption.toLocaleString()} kWh consumidos`,
      emoji: "🌤️",
    };
  } else {
    status = {
      level: "red",
      title: "La generación colectiva queda corta",
      message:
        coverage > 0
          ? `Solo ${coverage.toFixed(0)}% del consumo viene de fuentes propias. ` +
            `Vale la pena planificar una ampliación.`
          : "Sin generación propia este mes — revisemos el sistema.",
      detail: `${householdCount} hogares · consumo total ${consumption.toLocaleString()} kWh/mes`,
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
    equivalentHouseholdsToday: equivalentHouseholds,
    status,
  };
}
