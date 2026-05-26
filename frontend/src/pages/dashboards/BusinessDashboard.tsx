import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/client";
import type { BlackoutStartResponse, ChatKind, CompanyProfile, DailyResponse, ExtraData } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import ChatPanel from "../../components/ChatPanel";
import DashboardFilters, {
  WEATHER_META,
  WEATHER_MULTIPLIERS,
  type FilterState,
  type WeatherMode,
} from "../../components/DashboardFilters";
import FloatingChatButton from "../../components/FloatingChatButton";
import { SECTOR_SCHEMAS, fieldVisible } from "../../sectorSchemas";
import { cardStyle, colors, monoFont } from "../../styles";

const TARIFA_COP_KWH = 943;
const SOLAR_EFFICIENCY = 0.8; // Performance Ratio típico para PV en La Guajira
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface Climatology {
  monthly: number[];
  annual: number | null;
  source: string;
  cached: boolean;
}

export default function BusinessDashboard() {
  const { user, logout } = useAuth();
  const profile = user?.profile ?? null;

  const [climatology, setClimatology] = useState<Climatology | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatKind, setChatKind] = useState<ChatKind>("general");
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);
  const [chatReloadKey, setChatReloadKey] = useState(0);
  const [blackout, setBlackout] = useState<BlackoutStartResponse | null>(null);
  const [blackoutLoading, setBlackoutLoading] = useState(false);

  // Filter defaults derive from profile + real-world values. The user can override
  // each one to run what-if simulations; the whole dashboard recomputes instantly.
  const defaultFilters: FilterState = useMemo(() => ({
    monthIndex: new Date().getMonth(),
    pr: SOLAR_EFFICIENCY,
    solarKwp: profile?.solar_capacity_kwp ?? 0,
    tariff: TARIFA_COP_KWH,
    weather: "sunny" as WeatherMode,
  }), [profile?.solar_capacity_kwp]);

  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  // Re-sync filters whenever the underlying profile defaults change (e.g. profile edit).
  useEffect(() => { setFilters(defaultFilters); }, [defaultFilters]);

  useEffect(() => {
    apiFetch<Climatology>("/api/solar/climatology")
      .then(setClimatology)
      .catch(() => setClimatology(null));
  }, []);

  // Daily breakdown for the selected month. Reference year = last full calendar year.
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const dailyYear = useMemo(() => {
    const now = new Date();
    // If we're in January, use two years back to ensure NASA has data
    return now.getMonth() === 0 ? now.getFullYear() - 2 : now.getFullYear() - 1;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDailyLoading(true);
    setDaily(null);
    const month = filters.monthIndex + 1; // backend wants 1..12
    apiFetch<DailyResponse>(
      `/api/solar/daily?lat=11.5449&lon=-72.9069&year=${dailyYear}&month=${month}`,
    )
      .then((res) => { if (!cancelled) setDaily(res); })
      .catch(() => { if (!cancelled) setDaily(null); })
      .finally(() => { if (!cancelled) setDailyLoading(false); });
    return () => { cancelled = true; };
  }, [filters.monthIndex, dailyYear]);

  const metrics = useMemo(
    () => computeMetrics(profile, climatology, filters),
    [profile, climatology, filters],
  );

  function openPrediction() {
    const rawRad = climatology?.monthly[filters.monthIndex] ?? 5.5;
    const weather = WEATHER_META[filters.weather];
    const effectiveRad = rawRad * WEATHER_MULTIPLIERS[filters.weather];
    const monthName = new Date(2024, filters.monthIndex, 1)
      .toLocaleDateString("es-CO", { month: "long" });
    setChatKind("prediction");
    const weatherClause = filters.weather === "sunny"
      ? `Condición climática: ${weather.emoji} cielo despejado.`
      : `⚠️ CONDICIÓN CLIMÁTICA SIMULADA: ${weather.emoji} ${weather.label.toUpperCase()} — ` +
        `la radiación efectiva cae a ${effectiveRad.toFixed(2)} kWh/m²/día ` +
        `(${(WEATHER_MULTIPLIERS[filters.weather] * 100).toFixed(0)}% de la normal de ${rawRad.toFixed(2)}). ` +
        `Asume que esta condición se mantiene varios días y ajusta TODA la recomendación a este escenario adverso ` +
        `(priorizar baterías/generador, posponer cargas flexibles, alertar al usuario sobre dependencia de red).`;
    setChatPrompt(
      `Genera la predicción de ahorro energético para ${monthName}. ` +
      weatherClause + " " +
      `Capacidad simulada: ${filters.solarKwp} kWp · PR ${(filters.pr * 100).toFixed(0)}% · ` +
      `tarifa $${filters.tariff} COP/kWh.`
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
      setChatPrompt(null); // already saved as chat message by backend; just reload history
      setChatReloadKey((k) => k + 1);
      setChatOpen(true);
    } catch (err) {
      alert("Error iniciando modo apagón: " + (err instanceof Error ? err.message : "desconocido"));
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

  if (!profile) {
    return (
      <Layout user={user} onLogout={logout}>
        <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
          <p style={{ marginBottom: 16 }}>Tu perfil de empresa no está completo.</p>
          <Link to="/profile" style={{
            background: colors.accent, color: colors.textOnAccent, borderRadius: 8, padding: "10px 18px",
            textDecoration: "none", fontWeight: 700, display: "inline-block",
          }}>Completar perfil</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout user={user} onLogout={logout}>
      {/* Hero — empresa & acciones rápidas */}
      <div className="r-hero">
        <div className="r-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: colors.accent, letterSpacing: "2px", fontFamily: monoFont }}>
              {(profile.sector ?? user?.user_type ?? "").toString().toUpperCase()} · {profile.operating_hours}
            </div>
            <h1 className="r-h1" style={{ margin: "8px 0 4px", fontWeight: 800 }}>
              {profile.display_name}
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
              {profile.critical_loads_count} cargas críticas · {profile.flexible_loads_count} flexibles ·
              consumo {profile.monthly_grid_consumption_kwh.toLocaleString()} kWh/mes
            </p>
          </div>
        </div>

        <div className="r-actions">
          <ActionButton
            tone="info" emoji="🔮" title="Predicción del día"
            subtitle="Recomendación IA personalizada"
            onClick={openPrediction}
          />
          <ActionButton
            tone="danger" emoji="🚨" title={blackoutLoading ? "Calculando..." : "Modo Apagón"}
            subtitle="Plan de triaje de emergencia"
            onClick={triggerBlackout}
            disabled={blackoutLoading}
          />
        </div>
      </div>

      {/* Filtros interactivos — todo el dashboard reacciona en tiempo real */}
      <DashboardFilters value={filters} defaults={defaultFilters} onChange={setFilters} />

      {/* Banner clima adverso */}
      {filters.weather !== "sunny" && (
        <WeatherBanner
          weather={filters.weather}
          rawRadiation={metrics.rawAvgRadiation}
          effectiveRadiation={metrics.avgRadiation}
          monthlyGenerationKwh={metrics.monthlySolarKwh}
          monthlyCeilingCop={metrics.monthlySavingsCeiling}
          monthName={MONTHS[filters.monthIndex]}
        />
      )}

      {/* KPI strip principal — consumo / activos */}
      <div className="r-kpi-grid">
        <Kpi label="Consumo mensual" value={`${profile.monthly_grid_consumption_kwh.toLocaleString()} kWh`}
          sub={`$${metrics.monthlyCost.toLocaleString()} COP`} accent={colors.accent} />
        <Kpi
          label="Capacidad solar"
          value={`${filters.solarKwp} kWp`}
          sub={
            filters.solarKwp !== (profile.solar_capacity_kwp ?? 0)
              ? `Simulando (instalada: ${(profile.solar_capacity_kwp ?? 0)} kWp)`
              : (profile.solar_capacity_kwp ?? 0) > 0 ? "Instalada" : "Sin instalación"
          }
          accent={colors.success}
        />
        <Kpi label="Baterías" value={`${(profile.battery_capacity_kwh ?? 0)} kWh`}
          sub={`~${metrics.batteryHours.toFixed(1)} h autonomía crítica`} accent="#a78bfa" />
        <Kpi label="Generador" value={`${profile.generator_capacity_kw} kW`}
          sub={profile.generator_capacity_kw > 0 ? "Disponible" : "No instalado"} accent={colors.info} />
      </div>

      {/* KPI strip secundario — proyecciones del mes seleccionado (NASA × capacidad) */}
      <div className="r-kpi-grid">
        <Kpi
          label={`Generación esperada · ${MONTHS[filters.monthIndex]}`}
          value={`${metrics.monthlySolarKwh.toFixed(0)} kWh`}
          sub={`~${metrics.dailySolarKwh.toFixed(1)} kWh/día · radiación ${metrics.avgRadiation.toFixed(2)} × ${filters.solarKwp} kWp × ${(filters.pr * 100).toFixed(0)}%`}
          accent={colors.success}
        />
        <Kpi
          label={`Techo de ahorro · ${MONTHS[filters.monthIndex]}`}
          value={`$${metrics.monthlySavingsCeiling.toLocaleString()} COP`}
          sub={`generación × ${filters.tariff} COP/kWh · ahorro real estimado $${metrics.monthlyActualSavings.toLocaleString()}`}
          accent={colors.accent}
        />
      </div>

      {/* Cobertura solar + Radiación NASA */}
      <div className="r-two-col">
        <Card title="Cobertura solar estimada">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: colors.success }}>
              {metrics.solarCoveragePct.toFixed(0)}%
            </span>
            <span style={{ fontSize: 13, color: colors.textMuted }}>de tu consumo</span>
          </div>
          <ProgressBar pct={metrics.solarCoveragePct} color={colors.success} />
          <div style={{ marginTop: 14, fontSize: 12, color: colors.textMuted, lineHeight: 1.6 }}>
            En <strong style={{ color: colors.text }}>{MONTHS[filters.monthIndex]}</strong>: generación esperada{" "}
            {metrics.monthlySolarKwh.toFixed(0)} kWh sobre consumo {profile.monthly_grid_consumption_kwh.toLocaleString()} kWh.
            {metrics.solarCoveragePct >= 100 ? (
              <> Excedente: <strong style={{ color: colors.success }}>
                {(metrics.monthlySolarKwh - profile.monthly_grid_consumption_kwh).toFixed(0)} kWh
              </strong> para inyectar a la red o cargar baterías.</>
            ) : (
              <> Restante: <strong style={{ color: colors.accent }}>
                {(profile.monthly_grid_consumption_kwh - metrics.monthlySolarKwh).toFixed(0)} kWh
              </strong> que dependerá de la red o baterías.</>
            )}
          </div>
        </Card>

        <Card title="Radiación solar — Riohacha (NASA POWER)">
          {climatology ? (
            <NasaChart
              monthly={climatology.monthly}
              selectedMonth={filters.monthIndex}
              requiredRadiation={metrics.requiredDailyRadiation}
              annualAvg={metrics.annualAvgRadiation}
              monthVsAnnualPct={metrics.monthVsAnnualPct}
              onSelectMonth={(m) => setFilters({ ...filters, monthIndex: m })}
            />
          ) : (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: colors.textFaint, fontSize: 12 }}>
              Cargando datos NASA POWER...
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 10, color: colors.textFaint, lineHeight: 1.5 }}>
            kWh/m²/día · {climatology?.source === "nasa" ? "✓ API NASA" : "⚠ datos de referencia"}
            {climatology?.cached && " · cache"}
            {metrics.requiredDailyRadiation > 0 && (
              <>
                {" · "}
                <span style={{ color: colors.info }}>línea punteada</span> = radiación que necesitarías
                ({metrics.requiredDailyRadiation.toFixed(1)} kWh/m²/día) para cubrir el 100% de tu consumo
              </>
            )}
          </div>

          {/* Daily breakdown for the selected month */}
          <DailySection
            monthLabel={MONTHS[filters.monthIndex]}
            year={dailyYear}
            data={daily}
            loading={dailyLoading}
            requiredRadiation={metrics.requiredDailyRadiation}
          />
        </Card>
      </div>

      {/* Sector-specific details */}
      <div style={{ marginBottom: 16 }}>
        <SectorDetailsCard profile={profile} />
      </div>

      {/* Loads breakdown */}
      <div style={{ marginBottom: 16 }}>
        <Card title="Distribución de cargas">
          <LoadsBar critical={profile.critical_loads_count} flexible={profile.flexible_loads_count} />
          <div className="r-auto-grid" style={{ marginTop: 16, fontSize: 12 }}>
            <InfoBox accent={colors.danger} title={`${profile.critical_loads_count} cargas críticas`}
              body="Equipos que NO deben quedar sin energía: refrigeración, servidores, equipos médicos." />
            <InfoBox accent={colors.success} title={`${profile.flexible_loads_count} cargas flexibles`}
              body="Cargas que pueden desplazarse al pico solar o apagarse durante apagones." />
          </div>
          {blackout && (
            <div style={{
              marginTop: 16, padding: 12,
              background: colors.dangerSoft, border: `1px solid ${colors.dangerBorder}`,
              borderRadius: 10, fontSize: 12, color: colors.textMuted,
            }}>
              <strong style={{ color: colors.danger }}>Última simulación apagón:</strong>{" "}
              autonomía ~{blackout.estimated_autonomy_hours.toFixed(1)} h · carga
              crítica {blackout.critical_load_kw.toFixed(2)} kW
            </div>
          )}
        </Card>
      </div>

      <FloatingChatButton onClick={openChat} hidden={chatOpen} />

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        initialKind={chatKind}
        initialPrompt={chatPrompt}
        reloadKey={chatReloadKey}
      />
    </Layout>
  );
}

// ─── Layout ─────────────────────────────────────────────────────────────────
// Usa el DashboardLayout compartido (header + nav común a todos los dashboards).

import DashboardLayout from "../../components/DashboardLayout";

function Layout({ user, onLogout, children }: { user: { email: string; user_type: string } | null; onLogout: () => void; children: React.ReactNode }) {
  return (
    <DashboardLayout user={user} onLogout={onLogout}>
      {children}
    </DashboardLayout>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={{
        fontSize: 11, color: colors.textMuted, letterSpacing: "2px", textTransform: "uppercase",
        marginBottom: 14, fontFamily: monoFont,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div style={{ ...cardStyle, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: colors.textFaint, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div className="r-kpi-value" style={{ fontWeight: 800, color: accent, fontFamily: monoFont, wordBreak: "break-word" }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function ActionButton({
  tone, emoji, title, subtitle, onClick, disabled,
}: {
  tone: "danger" | "info"; emoji: string; title: string; subtitle: string;
  onClick: () => void; disabled?: boolean;
}) {
  const bg = tone === "danger" ? colors.dangerSoft : colors.infoSoft;
  const border = tone === "danger" ? "rgba(239,68,68,0.4)" : colors.infoBorder;
  const accent = tone === "danger" ? colors.danger : colors.info;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: 14,
      cursor: disabled ? "not-allowed" : "pointer", textAlign: "left",
      color: colors.text, fontFamily: "inherit", opacity: disabled ? 0.6 : 1,
      transition: "transform 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>{emoji}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: accent }}>{title}</div>
          <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 5, overflow: "hidden" }}>
      <div style={{
        width: `${clamped}%`, height: "100%",
        background: `linear-gradient(to right, ${color}88, ${color})`,
        transition: "width 0.6s",
      }} />
    </div>
  );
}

function LoadsBar({ critical, flexible }: { critical: number; flexible: number }) {
  const total = Math.max(critical + flexible, 1);
  const cPct = (critical / total) * 100;
  return (
    <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
      <div style={{ width: `${cPct}%`, background: colors.danger }} title={`Críticas: ${critical}`} />
      <div style={{ width: `${100 - cPct}%`, background: colors.success }} title={`Flexibles: ${flexible}`} />
    </div>
  );
}

function InfoBox({ accent, title, body }: { accent: string; title: string; body: string }) {
  return (
    <div style={{
      border: `1px solid ${colors.border}`, borderLeft: `3px solid ${accent}`,
      borderRadius: 8, padding: 12, background: "rgba(255,255,255,0.02)",
    }}>
      <div style={{ fontWeight: 700, color: accent, marginBottom: 4 }}>{title}</div>
      <div style={{ color: colors.textMuted, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function SectorDetailsCard({ profile }: { profile: CompanyProfile }) {
  if (!profile.sector) return null;
  const schema = SECTOR_SCHEMAS[profile.sector];
  const visibleFields = schema.fields.filter((f) => fieldVisible(f, profile.extra_data));
  if (visibleFields.length === 0) return null;

  return (
    <div style={cardStyle}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14,
      }}>
        <div style={{
          fontSize: 11, color: colors.textMuted, letterSpacing: "2px",
          textTransform: "uppercase", fontFamily: monoFont,
        }}>
          {schema.title}
        </div>
        <Link to="/profile" style={{
          fontSize: 11, color: colors.accent, textDecoration: "none", fontFamily: monoFont,
        }}>
          ✎ Editar
        </Link>
      </div>
      <div className="r-auto-grid">
        {visibleFields.map((f) => (
          <SectorDetailItem
            key={f.key}
            label={f.label}
            value={formatExtraValue(profile.extra_data[f.key], f.type)}
          />
        ))}
      </div>
    </div>
  );
}

function SectorDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", border: `1px solid ${colors.border}`,
      borderRadius: 8, padding: "10px 12px",
    }}>
      <div style={{ fontSize: 10, color: colors.textFaint, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, fontFamily: monoFont }}>
        {value}
      </div>
    </div>
  );
}

function formatExtraValue(value: ExtraData[string] | undefined, type: string): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (type === "number" && typeof value === "number") {
    return value === 0 ? "—" : value.toLocaleString();
  }
  return String(value);
}

interface NasaChartProps {
  monthly: number[];
  /** Which month is highlighted (defaults to real current month). */
  selectedMonth?: number;
  /** Daily kWh/m² needed for solar to cover monthly consumption — drawn as a
   *  dashed horizontal "demand line" overlaid on the bars. */
  requiredRadiation?: number;
  /** Annual mean radiation for the location — used to flag months above/below avg. */
  annualAvg?: number;
  /** Selected month's percentage difference vs annual avg (for the arrow badge). */
  monthVsAnnualPct?: number;
  /** Called when the user clicks a bar — lets parents bind it to the month filter. */
  onSelectMonth?: (monthIndex: number) => void;
}

const MONTHS_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function NasaChart({
  monthly,
  selectedMonth,
  requiredRadiation = 0,
  annualAvg,
  monthVsAnnualPct = 0,
  onSelectMonth,
}: NasaChartProps) {
  const current = selectedMonth ?? new Date().getMonth();
  const [hovered, setHovered] = useState<number | null>(null);
  const maxBar = Math.max(...monthly);
  const chartMax = requiredRadiation > 0
    ? Math.min(maxBar * 3, Math.max(maxBar * 1.12, requiredRadiation * 1.08))
    : maxBar * 1.05;
  const chartHeight = 170;
  const demandPct = requiredRadiation > 0 ? Math.min(100, (requiredRadiation / chartMax) * 100) : 0;
  const demandReachable = requiredRadiation > 0 && requiredRadiation <= maxBar;

  const above = monthVsAnnualPct >= 0;
  const arrow = above ? "↑" : "↓";
  const deltaColor = above ? colors.success : colors.info;

  // Hovered month info for tooltip
  const focused = hovered ?? current;
  const focusedValue = monthly[focused];
  const focusedVsAnnual = annualAvg !== undefined && annualAvg > 0
    ? ((focusedValue - annualAvg) / annualAvg) * 100
    : 0;
  const focusedMeets = requiredRadiation > 0 && focusedValue >= requiredRadiation;

  return (
    <div>
      {/* Tooltip — fixed slot above the chart so layout doesn't jump */}
      <div style={{
        minHeight: 46,
        marginBottom: 6,
        padding: "8px 12px",
        background: colors.surfaceStrong,
        border: `1px solid ${hovered !== null ? colors.accentBorder : colors.border}`,
        borderRadius: 10,
        fontSize: 11,
        color: colors.textMuted,
        fontFamily: monoFont,
        transition: "border-color 0.2s",
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <span style={{
          color: colors.text, fontWeight: 700, fontSize: 13, minWidth: 76,
        }}>
          {MONTHS_FULL[focused]}{hovered === null && " · seleccionado"}
        </span>
        <span>
          <span style={{ color: colors.textFaint }}>Radiación</span>{" "}
          <strong style={{ color: colors.accent }}>{focusedValue.toFixed(2)}</strong>{" "}
          kWh/m²/día
        </span>
        {annualAvg !== undefined && (
          <span>
            <span style={{ color: colors.textFaint }}>vs anual</span>{" "}
            <strong style={{ color: focusedVsAnnual >= 0 ? colors.success : colors.info }}>
              {focusedVsAnnual >= 0 ? "↑" : "↓"} {Math.abs(focusedVsAnnual).toFixed(1)}%
            </strong>
          </span>
        )}
        {requiredRadiation > 0 && (
          <span>
            <span style={{ color: colors.textFaint }}>demanda</span>{" "}
            <strong style={{ color: focusedMeets ? colors.success : colors.accent }}>
              {focusedMeets
                ? "✓ cubierta"
                : `falta ${(requiredRadiation - focusedValue).toFixed(2)} kWh/m²`}
            </strong>
          </span>
        )}
      </div>

      {/* Chart area */}
      <div
        style={{ position: "relative", height: chartHeight }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Demand line overlay */}
        {requiredRadiation > 0 && (
          <>
            <div
              style={{
                position: "absolute",
                left: 0, right: 0,
                bottom: `${demandPct}%`,
                borderTop: `1.5px dashed ${colors.info}`,
                opacity: 0.85,
                zIndex: 2,
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: 0,
                bottom: `calc(${demandPct}% + 4px)`,
                fontSize: 9,
                color: colors.info,
                fontFamily: monoFont,
                background: colors.surfaceStrong,
                padding: "1px 6px",
                borderRadius: 4,
                border: `1px solid ${colors.infoBorder}`,
                zIndex: 3,
                pointerEvents: "none",
              }}
            >
              Demanda · {requiredRadiation.toFixed(1)} kWh/m²
            </div>
          </>
        )}

        {/* Bars */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: "100%" }}>
          {monthly.map((v, i) => {
            const pct = (v / chartMax) * 100;
            const active = i === current;
            const isHovered = hovered === i;
            const meetsDemand = requiredRadiation > 0 && v >= requiredRadiation;
            const interactive = onSelectMonth !== undefined;
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHovered(i)}
                onFocus={() => setHovered(i)}
                onClick={() => onSelectMonth?.(i)}
                aria-label={`${MONTHS_FULL[i]}: ${v.toFixed(2)} kWh/m²/día`}
                style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end",
                  position: "relative", minWidth: 0,
                  background: "transparent", border: "none", padding: 0,
                  cursor: interactive ? "pointer" : "default",
                  outline: "none",
                }}
              >
                {/* Arrow badge — only on the selected month */}
                {active && annualAvg !== undefined && !isHovered && (
                  <div style={{
                    position: "absolute",
                    bottom: `calc(${pct}% + 4px)`,
                    fontSize: 10, fontWeight: 700, color: deltaColor,
                    fontFamily: monoFont, background: colors.surface,
                    border: `1px solid ${deltaColor}`, borderRadius: 6,
                    padding: "2px 6px", whiteSpace: "nowrap", zIndex: 4,
                    pointerEvents: "none",
                  }}>
                    {arrow} {Math.abs(monthVsAnnualPct).toFixed(1)}%
                  </div>
                )}
                {/* Value label — shown on selected month AND on hover */}
                <div style={{
                  position: "absolute",
                  bottom: `calc(${pct}% + ${active && annualAvg !== undefined && !isHovered ? 26 : 4}px)`,
                  fontSize: 10,
                  color: active || isHovered ? colors.accent : "transparent",
                  fontFamily: monoFont, fontWeight: 700,
                  pointerEvents: "none",
                  transition: "color 0.15s",
                }}>
                  {v.toFixed(2)}
                </div>
                {/* Bar */}
                <div style={{
                  width: "100%",
                  height: `${pct}%`,
                  borderRadius: "4px 4px 0 0",
                  background: active
                    ? `linear-gradient(to top, ${colors.accent}, ${colors.accentStrong})`
                    : meetsDemand
                    ? `linear-gradient(to top, ${colors.success}, rgba(34,197,94,0.6))`
                    : "rgba(245,158,11,0.25)",
                  border: active
                    ? `1px solid ${colors.accentBorder}`
                    : meetsDemand
                    ? `1px solid ${colors.success}`
                    : "1px solid rgba(245,158,11,0.1)",
                  outline: isHovered ? `2px solid ${colors.accent}` : "none",
                  outlineOffset: isHovered ? 1 : 0,
                  filter: isHovered ? "brightness(1.15)" : "none",
                  transform: isHovered ? "scaleY(1.04)" : "scaleY(1)",
                  transformOrigin: "bottom",
                  transition: "filter 0.15s, transform 0.15s, outline 0.15s",
                }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Month labels */}
      <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
        {MONTHS.map((m, i) => (
          <div key={m} style={{
            flex: 1, textAlign: "center", fontSize: 9,
            color: i === current ? colors.accent : i === hovered ? colors.text : colors.textFaint,
            fontFamily: monoFont,
            fontWeight: i === current || i === hovered ? 700 : 400,
            transition: "color 0.15s",
          }}>{m}</div>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12,
        fontSize: 10, color: colors.textMuted, fontFamily: monoFont,
      }}>
        <LegendDot color={colors.accent} label={`Seleccionado (${MONTHS[current]})`} />
        {requiredRadiation > 0 && demandReachable && (
          <LegendDot color={colors.success} label="Cubre 100% demanda" />
        )}
        <LegendDot color="rgba(245,158,11,0.5)" label="Otros meses" />
        {requiredRadiation > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 16, height: 0, borderTop: `1.5px dashed ${colors.info}` }} />
            Línea de demanda
          </span>
        )}
        {onSelectMonth && (
          <span style={{ marginLeft: "auto", color: colors.textFaint, fontSize: 9 }}>
            💡 Click en una barra para seleccionar el mes
          </span>
        )}
      </div>
    </div>
  );
}

function WeatherBanner({
  weather, rawRadiation, effectiveRadiation, monthlyGenerationKwh, monthlyCeilingCop, monthName,
}: {
  weather: WeatherMode;
  rawRadiation: number;
  effectiveRadiation: number;
  monthlyGenerationKwh: number;
  monthlyCeilingCop: number;
  monthName: string;
}) {
  const meta = WEATHER_META[weather];
  const pct = WEATHER_MULTIPLIERS[weather] * 100;
  const isSevere = weather === "rain" || weather === "storm";
  const accentColor = isSevere ? colors.info : colors.accent;

  return (
    <div
      role="status"
      style={{
        marginBottom: 16,
        padding: "12px 16px",
        background: isSevere ? colors.infoSoft : colors.accentSoft,
        border: `1px solid ${isSevere ? colors.infoBorder : colors.accentBorder}`,
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        animation: "fadeIn 0.3s ease",
      }}
    >
      <div style={{ fontSize: 30, lineHeight: 1 }}>{meta.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, color: accentColor, fontWeight: 700, letterSpacing: "1px",
          textTransform: "uppercase", fontFamily: monoFont, marginBottom: 4,
        }}>
          Modo {meta.label} activo · radiación efectiva {pct.toFixed(0)}%
        </div>
        <div style={{ fontSize: 13, color: colors.text, lineHeight: 1.5 }}>
          En {monthName} la radiación cae de{" "}
          <strong>{rawRadiation.toFixed(2)}</strong> a{" "}
          <strong style={{ color: accentColor }}>{effectiveRadiation.toFixed(2)}</strong>{" "}
          kWh/m²/día. Generación esperada: {monthlyGenerationKwh.toFixed(0)} kWh/mes ·
          techo de ahorro ${monthlyCeilingCop.toLocaleString()} COP.
          {isSevere && (
            <span style={{ color: colors.textMuted }}>
              {" "}— Considera priorizar baterías/generador y posponer cargas flexibles.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
      {label}
    </span>
  );
}

// ─── Daily breakdown section ────────────────────────────────────────────────

interface DailySectionProps {
  monthLabel: string;
  year: number;
  data: DailyResponse | null;
  loading: boolean;
  requiredRadiation: number;
}

function DailySection({ monthLabel, year, data, loading, requiredRadiation }: DailySectionProps) {
  return (
    <div style={{
      marginTop: 16,
      paddingTop: 14,
      borderTop: `1px dashed ${colors.border}`,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 10, gap: 8, flexWrap: "wrap",
      }}>
        <div style={{
          fontSize: 11, color: colors.textMuted, letterSpacing: "1.5px",
          textTransform: "uppercase", fontFamily: monoFont,
        }}>
          Detalle diario · {monthLabel} {year}
        </div>
        {data && data.average !== null && (
          <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: monoFont }}>
            <span style={{ color: colors.textFaint }}>media</span>{" "}
            <strong style={{ color: colors.accent }}>{data.average.toFixed(2)}</strong>{" "}
            kWh/m²/día
          </div>
        )}
      </div>

      {loading && (
        <div style={{
          height: 110, display: "flex", alignItems: "center", justifyContent: "center",
          color: colors.textFaint, fontSize: 12,
        }}>
          Cargando datos diarios NASA POWER...
        </div>
      )}

      {!loading && !data && (
        <div style={{ fontSize: 12, color: colors.textFaint, padding: "12px 0" }}>
          No se pudieron cargar los datos diarios.
        </div>
      )}

      {!loading && data && (
        <DailyChart entries={data.daily} monthlyAverage={data.average} requiredRadiation={requiredRadiation} />
      )}

      {data && (
        <div style={{ marginTop: 8, fontSize: 9, color: colors.textFaint }}>
          {data.source === "nasa" ? "✓ NASA POWER daily" : "⚠ datos de referencia"}
          {data.cached && " · cache"}
        </div>
      )}
    </div>
  );
}

function DailyChart({
  entries, monthlyAverage, requiredRadiation,
}: {
  entries: DailyResponse["daily"];
  monthlyAverage: number | null;
  requiredRadiation: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...entries.map((e) => e.value), monthlyAverage ?? 0, requiredRadiation);
  const chartMax = max * 1.1;
  const chartHeight = 110;
  const avgPct = monthlyAverage ? (monthlyAverage / chartMax) * 100 : 0;
  const demandPct = requiredRadiation > 0 ? Math.min(100, (requiredRadiation / chartMax) * 100) : 0;

  const focusedEntry = hovered !== null ? entries[hovered] : null;

  return (
    <div>
      {/* Tooltip slot */}
      <div style={{
        minHeight: 28, marginBottom: 6, fontSize: 11, fontFamily: monoFont,
        color: colors.textMuted, display: "flex", alignItems: "center", gap: 12,
      }}>
        {focusedEntry ? (
          <>
            <span style={{ color: colors.text, fontWeight: 700, minWidth: 60 }}>
              Día {focusedEntry.day}
            </span>
            <span>
              <span style={{ color: colors.textFaint }}>radiación</span>{" "}
              <strong style={{ color: colors.accent }}>{focusedEntry.value.toFixed(2)}</strong>{" "}
              kWh/m²/día
            </span>
            {monthlyAverage !== null && (
              <span>
                <span style={{ color: colors.textFaint }}>vs media</span>{" "}
                <strong style={{
                  color: focusedEntry.value >= monthlyAverage ? colors.success : colors.info,
                }}>
                  {focusedEntry.value >= monthlyAverage ? "↑" : "↓"}{" "}
                  {Math.abs(((focusedEntry.value - monthlyAverage) / monthlyAverage) * 100).toFixed(1)}%
                </strong>
              </span>
            )}
          </>
        ) : (
          <span style={{ color: colors.textFaint }}>
            Pasá el mouse por los días para ver el detalle
          </span>
        )}
      </div>

      {/* Chart */}
      <div
        style={{ position: "relative", height: chartHeight }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Monthly average line */}
        {monthlyAverage !== null && (
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: `${avgPct}%`,
            borderTop: `1px dashed ${colors.accentBorder}`,
            opacity: 0.6, zIndex: 2, pointerEvents: "none",
          }} />
        )}
        {/* Demand line */}
        {requiredRadiation > 0 && demandPct <= 100 && (
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: `${demandPct}%`,
            borderTop: `1.5px dashed ${colors.info}`,
            opacity: 0.85, zIndex: 2, pointerEvents: "none",
          }} />
        )}

        {/* Day bars */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: "100%" }}>
          {entries.map((e, i) => {
            const pct = (e.value / chartMax) * 100;
            const isHovered = hovered === i;
            const meetsDemand = requiredRadiation > 0 && e.value >= requiredRadiation;
            return (
              <button
                key={e.day}
                type="button"
                onMouseEnter={() => setHovered(i)}
                onFocus={() => setHovered(i)}
                aria-label={`Día ${e.day}: ${e.value.toFixed(2)} kWh/m²/día`}
                title={`Día ${e.day} · ${e.value.toFixed(2)} kWh/m²/día`}
                style={{
                  flex: 1, minWidth: 0, height: "100%",
                  background: "transparent", border: "none", padding: 0,
                  display: "flex", alignItems: "flex-end", cursor: "pointer", outline: "none",
                }}
              >
                <div style={{
                  width: "100%",
                  height: `${pct}%`,
                  borderRadius: "2px 2px 0 0",
                  background: meetsDemand
                    ? `linear-gradient(to top, ${colors.success}, rgba(34,197,94,0.55))`
                    : `linear-gradient(to top, ${colors.accent}, ${colors.accentStrong})`,
                  opacity: hovered === null || isHovered ? 1 : 0.45,
                  outline: isHovered ? `1.5px solid ${colors.text}` : "none",
                  outlineOffset: 1,
                  transition: "opacity 0.15s, outline 0.15s",
                }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Day axis: show 1, 5, 10, 15, 20, 25, last */}
      <div style={{
        display: "flex", marginTop: 6, fontSize: 9, color: colors.textFaint, fontFamily: monoFont,
      }}>
        {entries.map((e, i) => {
          const last = i === entries.length - 1;
          const major = e.day === 1 || e.day === 5 || e.day === 10 || e.day === 15 || e.day === 20 || e.day === 25 || last;
          return (
            <div key={e.day} style={{
              flex: 1, textAlign: "center", minWidth: 0,
              color: hovered === i ? colors.text : colors.textFaint,
              fontWeight: hovered === i ? 700 : 400,
              transition: "color 0.15s",
            }}>
              {major ? e.day : ""}
            </div>
          );
        })}
      </div>

      {/* Legend for daily chart */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8,
        fontSize: 10, color: colors.textMuted, fontFamily: monoFont,
      }}>
        {monthlyAverage !== null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 16, height: 0, borderTop: `1px dashed ${colors.accentBorder}` }} />
            Media del mes
          </span>
        )}
        {requiredRadiation > 0 && demandPct <= 100 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 16, height: 0, borderTop: `1.5px dashed ${colors.info}` }} />
            Demanda
          </span>
        )}
        {requiredRadiation > 0 && (
          <LegendDot color={colors.success} label="Cubre demanda" />
        )}
      </div>
    </div>
  );
}

// ─── Compute metrics ────────────────────────────────────────────────────────

function computeMetrics(
  profile: CompanyProfile | null,
  clim: Climatology | null,
  filters: FilterState,
) {
  const rawAvgRad = clim ? clim.monthly[filters.monthIndex] : 5.5;
  const annualAvgRad = clim
    ? clim.monthly.reduce((a, b) => a + b, 0) / clim.monthly.length
    : 5.5;

  // Aplicar multiplicador del clima (sol=1.0, nublado=0.6, lluvia=0.3, tormenta=0.15)
  const weatherMul = WEATHER_MULTIPLIERS[filters.weather];
  const avgRad = rawAvgRad * weatherMul;

  if (!profile) {
    return {
      avgRadiation: avgRad, rawAvgRadiation: rawAvgRad,
      annualAvgRadiation: annualAvgRad,
      monthVsAnnualPct: 0, monthlyCost: 0,
      dailySolarKwh: 0, monthlySolarKwh: 0,
      solarCoveragePct: 0, monthlySavingsCeiling: 0, monthlyActualSavings: 0,
      requiredDailyRadiation: 0, batteryHours: 0,
      weatherMultiplier: weatherMul,
    };
  }

  // Generación teórica esperada: NASA × multiplicador clima × kWp × eficiencia
  const dailySolarKwh = filters.solarKwp * avgRad * filters.pr;
  const monthlySolarKwh = dailySolarKwh * 30;

  // Costos / ahorros usando la tarifa del filtro
  const monthlyCost = Math.round(profile.monthly_grid_consumption_kwh * filters.tariff);
  const monthlySavingsCeiling = Math.round(monthlySolarKwh * filters.tariff);
  const monthlyActualSavings = Math.round(
    Math.min(monthlySolarKwh, profile.monthly_grid_consumption_kwh) * filters.tariff,
  );

  const solarCoveragePct = profile.monthly_grid_consumption_kwh > 0
    ? Math.min(100, (monthlySolarKwh / profile.monthly_grid_consumption_kwh) * 100)
    : 0;

  // "Línea de demanda" — usa el kWp del filtro para que sliders muevan la línea
  const requiredDailyRadiation = filters.solarKwp > 0
    ? (profile.monthly_grid_consumption_kwh / 30) / (filters.solarKwp * filters.pr)
    : 0;

  const monthVsAnnualPct = annualAvgRad > 0
    ? ((avgRad - annualAvgRad) / annualAvgRad) * 100
    : 0;

  const avgHourlyKw = profile.monthly_grid_consumption_kwh / 720;
  const criticalKw = Math.max(profile.critical_loads_count * 0.4, avgHourlyKw * 0.3);
  const batteryHours = criticalKw > 0 ? (profile.battery_capacity_kwh ?? 0) / criticalKw : 0;

  return {
    avgRadiation: avgRad,
    rawAvgRadiation: rawAvgRad,
    annualAvgRadiation: annualAvgRad,
    monthVsAnnualPct,
    monthlyCost,
    dailySolarKwh,
    monthlySolarKwh,
    solarCoveragePct,
    monthlySavingsCeiling,
    monthlyActualSavings,
    requiredDailyRadiation,
    batteryHours,
    weatherMultiplier: weatherMul,
  };
}
