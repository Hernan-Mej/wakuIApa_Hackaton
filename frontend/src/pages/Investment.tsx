import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import type { InvestmentResponse } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import AnimatedNumber from "../components/AnimatedNumber";
import DashboardLayout from "../components/DashboardLayout";
import { cardStyle, colors, inputStyle, labelStyle, monoFont } from "../styles";

const COST_PER_KWP = 4_500_000;
const COST_PER_KWH_BATTERY = 2_800_000;
const COST_PER_KW_WIND = 12_000_000;

interface ScenarioPreset {
  id: string;
  label: string;
  emoji: string;
  description: string;
  add_solar_kwp: number;
  add_battery_kwh: number;
  add_wind_kw: number;
}

function presetsFor(monthlyConsumption: number, userType: string): ScenarioPreset[] {
  // Aproximación: 1 kWp en La Guajira genera ~160 kWh/mes (5.5 × 0.8 × 30 / efic)
  const kwpForFullCoverage = Math.max(1, Math.round(monthlyConsumption / 160));
  const small = Math.max(1, Math.round(kwpForFullCoverage * 0.3));
  const medium = Math.max(2, Math.round(kwpForFullCoverage * 0.6));
  const large = kwpForFullCoverage;

  if (userType === "person") {
    return [
      { id: "tiny", label: "Mini", emoji: "💡", description: "Para arrancar sin gran inversión",
        add_solar_kwp: 2, add_battery_kwh: 2.4, add_wind_kw: 0 },
      { id: "small", label: "Hogar básico", emoji: "🏠", description: `~${small} kWp + 1 batería`,
        add_solar_kwp: small, add_battery_kwh: 5, add_wind_kw: 0 },
      { id: "medium", label: "Autonomía media", emoji: "⚡", description: `~${medium} kWp + baterías`,
        add_solar_kwp: medium, add_battery_kwh: 10, add_wind_kw: 0 },
      { id: "full", label: "Casa autosuficiente", emoji: "🌟", description: `${large} kWp + respaldo total`,
        add_solar_kwp: large, add_battery_kwh: 15, add_wind_kw: 0 },
    ];
  }
  return [
    { id: "starter", label: "Inicial", emoji: "🌱", description: "Primer paso",
      add_solar_kwp: small, add_battery_kwh: 5, add_wind_kw: 0 },
    { id: "balanced", label: "Balanceado", emoji: "⚖️", description: "Buena cobertura, payback rápido",
      add_solar_kwp: medium, add_battery_kwh: 20, add_wind_kw: 0 },
    { id: "full", label: "Autosuficiente", emoji: "🌟", description: `Cubre ~100% con ${large} kWp`,
      add_solar_kwp: large, add_battery_kwh: 30, add_wind_kw: 0 },
    { id: "hybrid", label: "Solar + eólica", emoji: "🌬️", description: "Aprovecha vientos Guajira",
      add_solar_kwp: medium, add_battery_kwh: 20, add_wind_kw: 5 },
  ];
}

export default function Investment() {
  const { user, logout } = useAuth();
  const profile = user?.profile;
  const userType = user?.user_type ?? "person";

  const presets = useMemo(
    () => presetsFor(profile?.monthly_grid_consumption_kwh ?? 250, userType),
    [profile?.monthly_grid_consumption_kwh, userType],
  );

  const [addSolar, setAddSolar] = useState(presets[1].add_solar_kwp);
  const [addBattery, setAddBattery] = useState(presets[1].add_battery_kwh);
  const [addWind, setAddWind] = useState(presets[1].add_wind_kw);
  const [sellExcess, setSellExcess] = useState(true);

  const [result, setResult] = useState<InvestmentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch<InvestmentResponse>("/api/investment/calculate", {
          method: "POST",
          body: {
            add_solar_kwp: addSolar,
            add_battery_kwh: addBattery,
            add_wind_kw: addWind,
            sell_excess_pct: sellExcess ? 0.7 : 0,
          },
        });
        if (!controller.signal.aborted) setResult(res);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Error desconocido");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350); // debounce
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [profile, addSolar, addBattery, addWind, sellExcess]);

  if (!profile) {
    return (
      <DashboardLayout user={user} onLogout={logout} subtitle="CALCULADORA DE INVERSIÓN">
        <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
          Completá tu perfil para usar la calculadora.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout user={user} onLogout={logout} subtitle="CALCULADORA DE INVERSIÓN">
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>
          💰 Simulador financiero
        </p>
        <h1 className="r-h1" style={{ margin: "4px 0 6px", fontWeight: 800 }}>
          ¿Cuánto te conviene invertir en solar?
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
          Probá distintos tamaños y ve al instante cuánto ahorrarías, en cuántos
          años se paga y qué retorno tiene la inversión.
        </p>
      </div>

      {/* Presets — quick scenarios */}
      <div className="r-kpi-grid" style={{ marginBottom: 18 }}>
        {presets.map((p) => {
          const active =
            addSolar === p.add_solar_kwp &&
            addBattery === p.add_battery_kwh &&
            addWind === p.add_wind_kw;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setAddSolar(p.add_solar_kwp);
                setAddBattery(p.add_battery_kwh);
                setAddWind(p.add_wind_kw);
              }}
              style={{
                ...cardStyle,
                minWidth: 0,
                cursor: "pointer",
                textAlign: "left",
                border: `2px solid ${active ? colors.accent : colors.border}`,
                background: active ? colors.accentSoft : colors.surface,
                color: colors.text,
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{p.emoji}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: active ? colors.accent : colors.text }}>
                {p.label}
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4, minHeight: 28 }}>
                {p.description}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: colors.textFaint, fontFamily: monoFont }}>
                {p.add_solar_kwp} kWp · {p.add_battery_kwh} kWh
                {p.add_wind_kw > 0 ? ` · ${p.add_wind_kw} kW eólica` : ""}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 18, marginBottom: 18 }}>
        {/* Sliders */}
        <div style={cardStyle}>
          <div style={{
            fontSize: 11, color: colors.textMuted, letterSpacing: "2px",
            textTransform: "uppercase", fontFamily: monoFont, marginBottom: 14,
          }}>
            Ajustá tu inversión
          </div>
          <div className="r-kpi-grid">
            <SliderField
              label="☀️ Paneles solares a sumar"
              suffix="kWp"
              value={addSolar}
              min={0}
              max={Math.max(100, Math.round((profile.monthly_grid_consumption_kwh ?? 250) / 80))}
              step={1}
              onChange={setAddSolar}
              hint={`Costo: ~$${(addSolar * COST_PER_KWP / 1_000_000).toFixed(1)}M COP`}
            />
            <SliderField
              label="🔋 Baterías a sumar"
              suffix="kWh"
              value={addBattery}
              min={0}
              max={Math.max(50, Math.round(addSolar * 4))}
              step={1}
              onChange={setAddBattery}
              hint={`Costo: ~$${(addBattery * COST_PER_KWH_BATTERY / 1_000_000).toFixed(1)}M COP`}
            />
            <SliderField
              label="🌬️ Turbina eólica"
              suffix="kW"
              value={addWind}
              min={0}
              max={20}
              step={1}
              onChange={setAddWind}
              hint={`Costo: ~$${(addWind * COST_PER_KW_WIND / 1_000_000).toFixed(1)}M COP · La Guajira tiene buenos vientos`}
            />
          </div>

          <label style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            background: colors.surfaceInput, border: `1px solid ${colors.borderStrong}`,
            borderRadius: 8, cursor: "pointer", fontSize: 13, marginTop: 10,
          }}>
            <input
              type="checkbox"
              checked={sellExcess}
              onChange={(e) => setSellExcess(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: colors.accent }}
            />
            💵 Vender el excedente a la red (créditos CREG 030/2018)
          </label>
        </div>
      </div>

      {/* Verdict & KPIs */}
      {error && (
        <div style={{
          ...cardStyle,
          background: colors.dangerSoft,
          border: `1px solid ${colors.dangerBorder}`,
          marginBottom: 18,
          color: colors.danger,
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Verdict big */}
          <div style={{
            ...cardStyle,
            marginBottom: 18,
            background: verdictBg(result.verdict),
            border: `1.5px solid ${verdictColor(result.verdict)}66`,
            position: "relative",
            overflow: "hidden",
          }}>
            <div style={badgeStyle(verdictColor(result.verdict))}>
              {verdictLabel(result.verdict)}
            </div>
            <h2 className="r-h2" style={{ margin: "10px 0 4px", color: verdictColor(result.verdict), fontWeight: 800 }}>
              {verdictTitle(result.verdict)}
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: colors.text, lineHeight: 1.55 }}>
              {result.verdict_message}
            </p>
            {loading && (
              <span style={{
                position: "absolute", top: 14, right: 16, fontSize: 10,
                color: colors.textFaint, fontFamily: monoFont,
              }}>
                actualizando…
              </span>
            )}
          </div>

          {/* KPIs */}
          <div className="r-kpi-grid" style={{ marginBottom: 18 }}>
            <BigKpi
              emoji="💵"
              label="Inversión total"
              value={
                <AnimatedNumber
                  value={result.total_investment_cop}
                  decimals={0}
                  prefix="$"
                  suffix=" COP"
                />
              }
              sub="Paneles + baterías + eólica"
              color={colors.text}
            />
            <BigKpi
              emoji="⏱️"
              label="Payback simple"
              value={
                result.payback_simple_years ? (
                  <>
                    <AnimatedNumber value={result.payback_simple_years} decimals={1} suffix=" años" />
                  </>
                ) : "—"
              }
              sub={
                result.payback_dynamic_years
                  ? `Dinámico (descuento 10%): ${result.payback_dynamic_years.toFixed(1)} años`
                  : "No se recupera en 25 años"
              }
              color={verdictColor(result.verdict)}
            />
            <BigKpi
              emoji="📈"
              label="TIR estimada"
              value={
                result.irr_estimated_pct !== null
                  ? <AnimatedNumber value={result.irr_estimated_pct} decimals={1} suffix="%" />
                  : "—"
              }
              sub="Retorno anual del capital invertido"
              color={colors.success}
            />
            <BigKpi
              emoji="💰"
              label="Ahorro total (25 años)"
              value={
                <AnimatedNumber
                  value={result.total_savings_lifetime_cop}
                  decimals={0}
                  prefix="$"
                  suffix=" COP"
                />
              }
              sub={`${result.avg_coverage_pct.toFixed(0)}% de cobertura del consumo`}
              color={colors.accent}
            />
          </div>

          {/* Cash flow chart */}
          <div style={{ ...cardStyle, marginBottom: 18 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700 }}>
              📊 Flujo de caja acumulado (25 años)
            </h3>
            <CashFlowChart cashFlow={result.cash_flow} investment={result.total_investment_cop} />
          </div>

          {/* Yearly table */}
          <div style={{ ...cardStyle, marginBottom: 18 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700 }}>
              📅 Proyección año a año
            </h3>
            <YearlyTable cashFlow={result.cash_flow} />
          </div>
        </>
      )}

      {!result && loading && (
        <div style={{ ...cardStyle, textAlign: "center", color: colors.textMuted, padding: 30 }}>
          Calculando…
        </div>
      )}

      {/* Back link */}
      <div style={{ textAlign: "center", marginTop: 24 }}>
        <Link to="/dashboard" style={{ color: colors.accent, fontSize: 13 }}>
          ← Volver al dashboard
        </Link>
      </div>
    </DashboardLayout>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SliderField({
  label, suffix, value, min, max, step, onChange, hint,
}: {
  label: string; suffix: string;
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div style={{
      padding: 12,
      borderRadius: 10,
      background: colors.surfaceStrong,
      border: `1px solid ${colors.border}`,
      minWidth: 0,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 8, gap: 8,
      }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.accent, fontFamily: monoFont }}>
          {value} {suffix}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--c-accent)" }}
        />
        <input
          type="number"
          min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ...inputStyle, width: 80, padding: "6px 8px" }}
        />
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 6 }}>{hint}</div>
      )}
    </div>
  );
}

function BigKpi({
  emoji, label, value, sub, color,
}: {
  emoji: string; label: string; value: React.ReactNode; sub: React.ReactNode; color: string;
}) {
  return (
    <div style={{ ...cardStyle, minWidth: 0 }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>{emoji}</div>
      <div style={{ fontSize: 11, color: colors.textFaint, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: "clamp(20px, 3.5vw, 24px)", fontWeight: 800, color, fontFamily: monoFont, wordBreak: "break-word" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function CashFlowChart({ cashFlow, investment }: { cashFlow: InvestmentResponse["cash_flow"]; investment: number }) {
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  // SVG viewport
  const W = 800;          // logical width
  const H = 280;          // logical height
  const PAD_L = 70;       // left padding for Y-axis labels
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 32;       // bottom padding for X-axis labels
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Y domain (always include 0 and the investment as floor)
  const values = cashFlow.map((c) => c.cumulative_cop);
  const yMax = Math.max(...values, 0);
  const yMin = Math.min(...values, -investment);
  const yRange = yMax - yMin || 1;
  const yToPx = (v: number) => PAD_T + ((yMax - v) / yRange) * innerH;
  const zeroY = yToPx(0);

  // X scale — one bar per year
  const n = cashFlow.length;
  const barW = innerW / n;
  const xCenter = (i: number) => PAD_L + barW * (i + 0.5);

  // Find payback year (first cumulative >= 0)
  const paybackIdx = cashFlow.findIndex((c) => c.cumulative_cop >= 0);

  // Y-axis ticks: 5 evenly-spaced values
  const ticks: number[] = [];
  const step = niceStep(yRange / 5);
  const startTick = Math.ceil(yMin / step) * step;
  for (let t = startTick; t <= yMax; t += step) ticks.push(t);
  if (!ticks.includes(0)) ticks.push(0);
  ticks.sort((a, b) => a - b);

  const hovered = hoverYear !== null ? cashFlow[hoverYear] : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: 280, display: "block", fontFamily: monoFont }}
        onMouseLeave={() => setHoverYear(null)}
      >
        {/* Grid lines + Y-axis labels */}
        {ticks.map((t, i) => {
          const y = yToPx(t);
          const isZero = t === 0;
          return (
            <g key={i}>
              <line
                x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
                stroke={isZero ? "var(--c-text-faint)" : "var(--c-border)"}
                strokeWidth={isZero ? 1.5 : 1}
                strokeDasharray={isZero ? "5 4" : "2 4"}
                opacity={isZero ? 0.9 : 0.55}
              />
              <text
                x={PAD_L - 8} y={y + 4}
                fontSize={10}
                fill="var(--c-text-faint)"
                textAnchor="end"
              >
                {formatCop(t)}
              </text>
            </g>
          );
        })}

        {/* Payback vertical marker */}
        {paybackIdx >= 0 && (
          <g>
            <line
              x1={xCenter(paybackIdx)} x2={xCenter(paybackIdx)}
              y1={PAD_T} y2={H - PAD_B}
              stroke="var(--c-accent)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.7}
            />
            <text
              x={xCenter(paybackIdx)} y={PAD_T - 4}
              fontSize={10}
              fill="var(--c-accent)"
              textAnchor="middle"
              fontWeight={700}
            >
              ✓ payback
            </text>
          </g>
        )}

        {/* Bars */}
        {cashFlow.map((c, i) => {
          const positive = c.cumulative_cop >= 0;
          const yTop = positive ? yToPx(c.cumulative_cop) : zeroY;
          const yBot = positive ? zeroY : yToPx(c.cumulative_cop);
          const height = Math.max(1, yBot - yTop);
          const fill = positive ? "var(--c-success)" : "var(--c-danger)";
          const isHover = hoverYear === i;
          return (
            <g key={c.year} onMouseEnter={() => setHoverYear(i)}>
              <rect
                x={xCenter(i) - barW * 0.4}
                y={yTop}
                width={barW * 0.8}
                height={height}
                fill={fill}
                opacity={isHover ? 1 : 0.85}
                rx={2}
              />
              {/* Larger invisible hit area */}
              <rect
                x={xCenter(i) - barW / 2}
                y={PAD_T}
                width={barW}
                height={innerH}
                fill="transparent"
                style={{ cursor: "pointer" }}
              />
            </g>
          );
        })}

        {/* Hover guide line */}
        {hovered && hoverYear !== null && (
          <line
            x1={xCenter(hoverYear)} x2={xCenter(hoverYear)}
            y1={PAD_T} y2={H - PAD_B}
            stroke="var(--c-text)" strokeWidth={1}
            opacity={0.3}
            pointerEvents="none"
          />
        )}

        {/* X-axis (years) */}
        {cashFlow.map((c, i) => {
          const show = c.year === 1 || c.year % 5 === 0 || c.year === n;
          if (!show) return null;
          return (
            <text
              key={c.year}
              x={xCenter(i)} y={H - PAD_B + 14}
              fontSize={10}
              fill={hoverYear === i ? "var(--c-text)" : "var(--c-text-faint)"}
              fontWeight={hoverYear === i ? 700 : 400}
              textAnchor="middle"
            >
              A{c.year}
            </text>
          );
        })}
      </svg>

      {/* Tooltip with hovered year details */}
      <div style={{
        marginTop: 8,
        minHeight: 36, padding: "8px 12px",
        background: colors.surfaceStrong,
        border: `1px solid ${hovered ? colors.accentBorder : colors.border}`,
        borderRadius: 8, fontSize: 12, color: colors.textMuted,
        fontFamily: monoFont,
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        transition: "border-color 0.2s",
      }}>
        {hovered ? (
          <>
            <span style={{ color: colors.text, fontWeight: 700, minWidth: 56 }}>
              Año {hovered.year}
            </span>
            <span>
              <span style={{ color: colors.textFaint }}>Acumulado</span>{" "}
              <strong style={{ color: hovered.cumulative_cop >= 0 ? colors.success : colors.danger }}>
                ${hovered.cumulative_cop.toLocaleString()}
              </strong>
            </span>
            <span>
              <span style={{ color: colors.textFaint }}>Flujo año</span>{" "}
              <strong style={{ color: colors.accent }}>${hovered.net_cash_flow_cop.toLocaleString()}</strong>
            </span>
            <span>
              <span style={{ color: colors.textFaint }}>Generación</span>{" "}
              <strong>{hovered.generation_kwh.toLocaleString()} kWh</strong>
            </span>
            <span>
              <span style={{ color: colors.textFaint }}>Tarifa</span>{" "}
              <strong>${Math.round(hovered.tariff_cop).toLocaleString()}/kWh</strong>
            </span>
          </>
        ) : (
          <span style={{ color: colors.textFaint }}>
            Pasá el mouse por las barras para ver el detalle de cada año.
          </span>
        )}
      </div>

      <div style={{
        marginTop: 10, display: "flex", gap: 16, fontSize: 11, color: colors.textMuted, flexWrap: "wrap",
      }}>
        <span><span style={{ ...dotStyle, background: colors.danger }} /> Inversión sin recuperar</span>
        <span><span style={{ ...dotStyle, background: colors.success }} /> Ganancia acumulada</span>
        <span><span style={{ ...dotStyle, background: colors.accent }} /> Punto de equilibrio</span>
      </div>
    </div>
  );
}

function formatCop(v: number): string {
  if (v === 0) return "$0";
  const abs = Math.abs(v);
  let s: string;
  if (abs >= 1_000_000_000) s = `${(v / 1_000_000_000).toFixed(1)}B`;
  else if (abs >= 1_000_000) s = `${(v / 1_000_000).toFixed(0)}M`;
  else if (abs >= 1_000) s = `${(v / 1_000).toFixed(0)}k`;
  else s = v.toFixed(0);
  return `$${s}`;
}

function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const norm = rough / base;
  let mult: number;
  if (norm <= 1) mult = 1;
  else if (norm <= 2) mult = 2;
  else if (norm <= 5) mult = 5;
  else mult = 10;
  return mult * base;
}

function YearlyTable({ cashFlow }: { cashFlow: InvestmentResponse["cash_flow"] }) {
  // Show years 1, 3, 5, 10, 15, 20, 25 (key milestones)
  const keyYears = [1, 3, 5, 10, 15, 20, 25];
  const rows = cashFlow.filter((c) => keyYears.includes(c.year));
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{
        width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: monoFont,
      }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            <th style={thStyle}>Año</th>
            <th style={thStyle}>Generación</th>
            <th style={thStyle}>Ahorro</th>
            <th style={thStyle}>+ Venta excedente</th>
            <th style={thStyle}>- O&M</th>
            <th style={thStyle}>Flujo neto</th>
            <th style={thStyle}>Acumulado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.year} style={{ borderBottom: `1px solid ${colors.border}` }}>
              <td style={tdStyle}>A{c.year}</td>
              <td style={tdStyle}>{c.generation_kwh.toLocaleString()} kWh</td>
              <td style={tdStyle}>${c.savings_cop.toLocaleString()}</td>
              <td style={tdStyle}>${c.excess_revenue_cop.toLocaleString()}</td>
              <td style={{ ...tdStyle, color: colors.danger }}>-${c.om_cost_cop.toLocaleString()}</td>
              <td style={{ ...tdStyle, color: colors.accent, fontWeight: 700 }}>
                ${c.net_cash_flow_cop.toLocaleString()}
              </td>
              <td style={{
                ...tdStyle, fontWeight: 700,
                color: c.cumulative_cop >= 0 ? colors.success : colors.danger,
              }}>
                ${c.cumulative_cop.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Styles & helpers ──────────────────────────────────────────────────────

const thStyle: CSSProperties = {
  textAlign: "left", padding: "8px 10px",
  color: colors.textFaint, fontSize: 10, letterSpacing: "1px",
  textTransform: "uppercase", whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "8px 10px",
  color: colors.text,
  whiteSpace: "nowrap",
};

const dotStyle: CSSProperties = {
  display: "inline-block",
  width: 10, height: 10, borderRadius: 2,
  marginRight: 4, verticalAlign: "middle",
};

function badgeStyle(color: string): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "4px 10px",
    background: colors.surface,
    border: `1px solid ${color}88`,
    borderRadius: 999, fontSize: 10, letterSpacing: "2px",
    fontWeight: 700, color, fontFamily: monoFont,
  };
}

function verdictColor(v: InvestmentResponse["verdict"]): string {
  switch (v) {
    case "excellent": return colors.success;
    case "good": return colors.success;
    case "marginal": return colors.accent;
    case "review": return colors.danger;
  }
}

function verdictBg(v: InvestmentResponse["verdict"]): string {
  switch (v) {
    case "excellent":
    case "good": return "rgba(34, 197, 94, 0.10)";
    case "marginal": return "rgba(245, 158, 11, 0.10)";
    case "review": return "rgba(239, 68, 68, 0.10)";
  }
}

function verdictLabel(v: InvestmentResponse["verdict"]): string {
  switch (v) {
    case "excellent": return "🌟 EXCELENTE";
    case "good": return "✅ BUENA";
    case "marginal": return "⚠️ MARGINAL";
    case "review": return "🚨 REVISAR";
  }
}

function verdictTitle(v: InvestmentResponse["verdict"]): string {
  switch (v) {
    case "excellent": return "Inversión muy atractiva";
    case "good": return "Inversión recomendable";
    case "marginal": return "Inversión justa";
    case "review": return "Esta inversión necesita ajuste";
  }
}
