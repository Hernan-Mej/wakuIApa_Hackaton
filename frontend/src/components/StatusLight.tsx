import type { CSSProperties } from "react";
import { colors, monoFont } from "../styles";

export type StatusLevel = "green" | "yellow" | "red";

export interface StatusLightProps {
  level: StatusLevel;
  title: string;          // "Tu energía está al día"
  message: string;        // explicación corta
  detail?: string;        // detalle técnico opcional
  emoji?: string;
}

const STATUS_THEME: Record<StatusLevel, { color: string; bg: string; border: string; defaultEmoji: string; label: string }> = {
  green: {
    color: "#16a34a",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.45)",
    defaultEmoji: "✅",
    label: "TODO BIEN",
  },
  yellow: {
    color: "#d97706",
    bg: "rgba(245, 158, 11, 0.14)",
    border: "rgba(245, 158, 11, 0.45)",
    defaultEmoji: "⚠️",
    label: "ATENCIÓN",
  },
  red: {
    color: "#dc2626",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.45)",
    defaultEmoji: "🚨",
    label: "ACCIÓN URGENTE",
  },
};

export default function StatusLight({ level, title, message, detail, emoji }: StatusLightProps) {
  const t = STATUS_THEME[level];
  return (
    <div
      style={{
        background: t.bg,
        border: `1.5px solid ${t.border}`,
        borderRadius: 18,
        padding: "clamp(18px, 4vw, 28px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Animated pulse ring */}
      <div
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: t.color,
          opacity: 0.08,
          animation: "pulse 3s ease-in-out infinite",
        }}
      />

      <div style={badgeStyle(t.color, t.border)}>
        <Dot color={t.color} pulse />
        {t.label}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          marginTop: 14,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: "clamp(48px, 10vw, 72px)",
            lineHeight: 1,
            animation: level === "red" ? "pulse 1.4s ease-in-out infinite" : undefined,
          }}
        >
          {emoji ?? t.defaultEmoji}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2
            className="r-h2"
            style={{
              margin: 0,
              color: t.color,
              fontWeight: 800,
            }}
          >
            {title}
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 14,
              color: colors.text,
              lineHeight: 1.55,
            }}
          >
            {message}
          </p>
          {detail && (
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 11,
                color: colors.textMuted,
                fontFamily: monoFont,
              }}
            >
              {detail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function badgeStyle(color: string, border: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 10px",
    background: colors.surface,
    border: `1px solid ${border}`,
    borderRadius: 999,
    fontSize: 10,
    letterSpacing: "2px",
    fontWeight: 700,
    color,
    fontFamily: monoFont,
  };
}

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        animation: pulse ? "pulse 1.6s ease-in-out infinite" : undefined,
      }}
    />
  );
}
