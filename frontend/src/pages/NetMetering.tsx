import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import type { NetMeteringResponse } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import AnimatedNumber from "../components/AnimatedNumber";
import DashboardLayout from "../components/DashboardLayout";
import { cardStyle, colors, monoFont } from "../styles";

export default function NetMetering() {
  const { user, logout } = useAuth();
  const profile = user?.profile;
  const isPerson = user?.user_type === "person";

  const [data, setData] = useState<NetMeteringResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    apiFetch<NetMeteringResponse>("/api/net-metering/balance")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [profile]);

  if (!profile) {
    return (
      <DashboardLayout user={user} onLogout={logout} subtitle="CARGA NETA">
        <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
          Completá tu perfil para ver el balance neto.
        </div>
      </DashboardLayout>
    );
  }

  const noSolar = (profile.solar_capacity_kwp ?? 0) === 0;

  return (
    <DashboardLayout user={user} onLogout={logout} subtitle="CARGA NETA">
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>
          ⚡ Balance neto con la red
        </p>
        <h1 className="r-h1" style={{ margin: "4px 0 6px", fontWeight: 800 }}>
          {isPerson ? "¿Cuánto te debe la red?" : "Carga neta mensual"}
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
          {isPerson
            ? "Si tus paneles producen de más, podés inyectar a la red y recibir créditos."
            : "Detalle mensual de generación, autoconsumo, excedente exportado y déficit comprado."}
        </p>
      </div>

      {noSolar && (
        <div style={{
          ...cardStyle,
          background: colors.accentSoft,
          border: `1px solid ${colors.accentBorder}`,
          marginBottom: 18,
        }}>
          <h3 style={{ margin: "0 0 6px", color: colors.accent }}>
            💡 Aún no tenés paneles solares
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: colors.text, lineHeight: 1.6 }}>
            La carga neta sólo aplica cuando ya tenés generación propia. Probá la{" "}
            <Link to="/investment" style={{ color: colors.accent, fontWeight: 700 }}>
              calculadora de inversión
            </Link>{" "}
            para ver cuánto ahorrarías y cuánto te pagaría la red por tus excedentes.
          </p>
        </div>
      )}

      {error && (
        <div style={{
          ...cardStyle, background: colors.dangerSoft, color: colors.danger,
          border: `1px solid ${colors.dangerBorder}`, marginBottom: 18,
        }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ ...cardStyle, textAlign: "center", padding: 30, color: colors.textMuted }}>
          Calculando balance anual…
        </div>
      )}

      {data && (
        <>
          {/* Annual KPIs */}
          <div className="r-kpi-grid" style={{ marginBottom: 18 }}>
            <BigKpi
              emoji="☀️"
              label="Generado en el año"
              value={
                <AnimatedNumber value={data.annual_generation_kwh} decimals={0} suffix=" kWh" />
              }
              sub="Tu producción solar anual"
              color={colors.success}
            />
            <BigKpi
              emoji="🔌"
              label="Consumido del año"
              value={
                <AnimatedNumber value={data.annual_consumption_kwh} decimals={0} suffix=" kWh" />
              }
              sub="Lo que necesitás operar"
              color={colors.text}
            />
            <BigKpi
              emoji="💵"
              label="Excedente vendible"
              value={
                <AnimatedNumber value={data.annual_excess_kwh} decimals={0} suffix=" kWh" />
              }
              sub={
                <>
                  Crédito ~{" "}
                  <AnimatedNumber
                    value={data.annual_export_credit_cop}
                    decimals={0}
                    prefix="$"
                    suffix=" COP"
                  />
                </>
              }
              color={colors.info}
            />
            <BigKpi
              emoji="📊"
              label="Balance neto anual"
              value={
                <AnimatedNumber
                  value={data.annual_net_balance_cop}
                  decimals={0}
                  prefix="$"
                  suffix=" COP"
                />
              }
              sub={
                data.annual_net_balance_cop >= 0
                  ? "🎉 Te genera dinero"
                  : "Aún te falta cubrir"
              }
              color={data.annual_net_balance_cop >= 0 ? colors.success : colors.danger}
            />
          </div>

          {/* CREG eligibility */}
          {data.eligible_for_creg_030 && (
            <div style={{
              ...cardStyle,
              background: colors.accentSoft,
              border: `1px solid ${colors.accentBorder}`,
              marginBottom: 18,
            }}>
              <strong style={{ color: colors.accent }}>
                ✓ Elegible para Resolución CREG 030/2018
              </strong>{" "}
              <span style={{ fontSize: 13, color: colors.textMuted }}>
                — al ser autogenerador a pequeña escala (&lt; 100 kW) podés vender
                excedentes a la red y recibir créditos por la energía exportada
                ({Math.round((data.export_rate_cop_per_kwh / data.tariff_cop_per_kwh) * 100)}%
                de la tarifa retail).
              </span>
            </div>
          )}

          {/* Monthly chart */}
          <div style={{ ...cardStyle, marginBottom: 18 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700 }}>
              📅 Producción vs consumo, mes a mes
            </h3>
            <MonthlyBars months={data.months} />
          </div>

          {/* Table */}
          <div style={{ ...cardStyle, marginBottom: 18 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700 }}>
              💰 Balance financiero mensual
            </h3>
            <MonthlyTable months={data.months} />
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

function MonthlyBars({ months }: { months: NetMeteringResponse["months"] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // SVG dimensions
  const W = 800;
  const H = 260;
  const PAD_L = 60;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 30;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const max = useMemo(
    () => Math.max(1, ...months.map((m) => Math.max(m.generation_kwh, m.consumption_kwh))),
    [months],
  );
  // round max to a nice number for ticks
  const yMax = niceCeil(max);
  const yToPx = (v: number) => PAD_T + ((yMax - v) / yMax) * innerH;

  const slot = innerW / months.length;
  const xCenter = (i: number) => PAD_L + slot * (i + 0.5);
  const barW = Math.min(slot * 0.42, 22);

  const ticks: number[] = [];
  const step = niceStep(yMax / 5);
  for (let t = 0; t <= yMax; t += step) ticks.push(t);

  const hovered = hoverIdx !== null ? months[hoverIdx] : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: 260, display: "block", fontFamily: monoFont }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Grid + Y labels */}
        {ticks.map((t, i) => {
          const y = yToPx(t);
          return (
            <g key={i}>
              <line
                x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
                stroke={t === 0 ? "var(--c-text-faint)" : "var(--c-border)"}
                strokeWidth={t === 0 ? 1.2 : 1}
                strokeDasharray={t === 0 ? "0" : "2 4"}
                opacity={t === 0 ? 0.8 : 0.55}
              />
              <text
                x={PAD_L - 8} y={y + 4}
                fontSize={10}
                fill="var(--c-text-faint)"
                textAnchor="end"
              >
                {t === 0 ? "0" : t.toLocaleString()}
              </text>
            </g>
          );
        })}
        <text
          x={12} y={PAD_T + innerH / 2}
          fontSize={9}
          fill="var(--c-text-faint)"
          transform={`rotate(-90 12 ${PAD_T + innerH / 2})`}
          textAnchor="middle"
        >
          kWh / mes
        </text>

        {/* Bars per month — gen | cons side by side */}
        {months.map((m, i) => {
          const cx = xCenter(i);
          const yGen = yToPx(m.generation_kwh);
          const yCons = yToPx(m.consumption_kwh);
          const baseY = yToPx(0);
          const isHover = hoverIdx === i;
          return (
            <g key={m.month_index} onMouseEnter={() => setHoverIdx(i)}>
              {/* Hit area */}
              <rect
                x={cx - slot / 2} y={PAD_T}
                width={slot} height={innerH}
                fill={isHover ? "var(--c-accent-soft)" : "transparent"}
                style={{ cursor: "pointer" }}
                opacity={isHover ? 0.4 : 1}
              />
              {/* Generation bar (success) */}
              <rect
                x={cx - barW - 1}
                y={yGen}
                width={barW}
                height={Math.max(1, baseY - yGen)}
                fill="var(--c-success)"
                opacity={isHover ? 1 : 0.85}
                rx={2}
              />
              {/* Consumption bar (accent) */}
              <rect
                x={cx + 1}
                y={yCons}
                width={barW}
                height={Math.max(1, baseY - yCons)}
                fill="var(--c-accent)"
                opacity={isHover ? 1 : 0.85}
                rx={2}
              />
              {/* Value labels (only on hover, to keep chart clean) */}
              {isHover && (
                <>
                  <text
                    x={cx - barW / 2 - 1} y={yGen - 4}
                    fontSize={9} fill="var(--c-success)"
                    textAnchor="middle" fontWeight={700}
                  >
                    {Math.round(m.generation_kwh).toLocaleString()}
                  </text>
                  <text
                    x={cx + barW / 2 + 1} y={yCons - 4}
                    fontSize={9} fill="var(--c-accent)"
                    textAnchor="middle" fontWeight={700}
                  >
                    {Math.round(m.consumption_kwh).toLocaleString()}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* X axis: month labels */}
        {months.map((m, i) => (
          <text
            key={m.month_index}
            x={xCenter(i)} y={H - PAD_B + 14}
            fontSize={10}
            fill={hoverIdx === i ? "var(--c-text)" : "var(--c-text-faint)"}
            fontWeight={hoverIdx === i ? 700 : 400}
            textAnchor="middle"
          >
            {m.month_label}
          </text>
        ))}
      </svg>

      {/* Hover tooltip */}
      <div style={{
        marginTop: 8, minHeight: 36, padding: "8px 12px",
        background: colors.surfaceStrong,
        border: `1px solid ${hovered ? colors.accentBorder : colors.border}`,
        borderRadius: 8, fontSize: 12, color: colors.textMuted,
        fontFamily: monoFont,
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        transition: "border-color 0.2s",
      }}>
        {hovered ? (
          <>
            <span style={{ color: colors.text, fontWeight: 700, minWidth: 48 }}>
              {hovered.month_label} ({hovered.days_in_month} días)
            </span>
            <span>
              <span style={{ color: colors.success }}>● Generó</span>{" "}
              <strong>{hovered.generation_kwh.toLocaleString()} kWh</strong>
            </span>
            <span>
              <span style={{ color: colors.accent }}>● Consumió</span>{" "}
              <strong>{hovered.consumption_kwh.toLocaleString()} kWh</strong>
            </span>
            {hovered.excess_kwh > 0 && (
              <span>
                <span style={{ color: colors.info }}>↑ Exportó</span>{" "}
                <strong>{hovered.excess_kwh.toLocaleString()} kWh</strong>
              </span>
            )}
            {hovered.deficit_kwh > 0 && (
              <span>
                <span style={{ color: colors.danger }}>↓ Faltante</span>{" "}
                <strong>{hovered.deficit_kwh.toLocaleString()} kWh</strong>
              </span>
            )}
            <span style={{ marginLeft: "auto" }}>
              <span style={{ color: colors.textFaint }}>Balance</span>{" "}
              <strong style={{
                color: hovered.net_balance_cop >= 0 ? colors.success : colors.danger,
              }}>
                ${hovered.net_balance_cop.toLocaleString()} COP
              </strong>
            </span>
          </>
        ) : (
          <span style={{ color: colors.textFaint }}>
            Pasá el mouse por un mes para ver el detalle.
          </span>
        )}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 11, color: colors.textMuted, flexWrap: "wrap" }}>
        <span><span style={{ ...dotStyle, background: colors.success }} /> Generación solar</span>
        <span><span style={{ ...dotStyle, background: colors.accent }} /> Consumo (factura)</span>
        <span style={{ marginLeft: "auto", color: colors.textFaint, fontSize: 10 }}>
          Cuando la barra verde supera a la naranja → excedente exportable a la red
        </span>
      </div>
    </div>
  );
}

function niceCeil(v: number): number {
  const step = niceStep(v / 5);
  return Math.ceil(v / step) * step;
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

function MonthlyTable({ months }: { months: NetMeteringResponse["months"] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: monoFont }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            <th style={thStyle}>Mes</th>
            <th style={thStyle}>Generó</th>
            <th style={thStyle}>Consumió</th>
            <th style={thStyle}>Auto-cons.</th>
            <th style={thStyle}>Excedente</th>
            <th style={thStyle}>Déficit</th>
            <th style={thStyle}>Ahorro</th>
            <th style={thStyle}>+ Crédito venta</th>
            <th style={thStyle}>- Compra red</th>
            <th style={thStyle}>Balance neto</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month_index} style={{ borderBottom: `1px solid ${colors.border}` }}>
              <td style={tdStyle}>{m.month_label}</td>
              <td style={tdStyle}>{m.generation_kwh.toLocaleString()}</td>
              <td style={tdStyle}>{m.consumption_kwh.toLocaleString()}</td>
              <td style={{ ...tdStyle, color: colors.success }}>{m.self_consumed_kwh.toLocaleString()}</td>
              <td style={{ ...tdStyle, color: colors.info }}>{m.excess_kwh.toLocaleString()}</td>
              <td style={{ ...tdStyle, color: colors.danger }}>{m.deficit_kwh.toLocaleString()}</td>
              <td style={tdStyle}>${m.savings_cop.toLocaleString()}</td>
              <td style={{ ...tdStyle, color: colors.info }}>+${m.export_credit_cop.toLocaleString()}</td>
              <td style={{ ...tdStyle, color: colors.danger }}>-${m.grid_purchase_cop.toLocaleString()}</td>
              <td style={{
                ...tdStyle, fontWeight: 700,
                color: m.net_balance_cop >= 0 ? colors.success : colors.danger,
              }}>
                ${m.net_balance_cop.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left", padding: "8px 10px",
  color: colors.textFaint, fontSize: 10, letterSpacing: "1px",
  textTransform: "uppercase", whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "8px 10px", color: colors.text, whiteSpace: "nowrap",
};

const dotStyle: CSSProperties = {
  display: "inline-block",
  width: 10, height: 10, borderRadius: 2,
  marginRight: 4, verticalAlign: "middle",
};
