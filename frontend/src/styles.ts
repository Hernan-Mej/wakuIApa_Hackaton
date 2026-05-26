import type { CSSProperties } from "react";

/** All color tokens map to CSS variables so they auto-switch with the theme. */
export const colors = {
  bg: "var(--c-bg)",
  bgSoft: "var(--c-bg-soft)",
  surface: "var(--c-surface)",
  surfaceStrong: "var(--c-surface-strong)",
  surfaceInput: "var(--c-surface-input)",
  border: "var(--c-border)",
  borderStrong: "var(--c-border-strong)",

  text: "var(--c-text)",
  textMuted: "var(--c-text-muted)",
  textFaint: "var(--c-text-faint)",
  textOnAccent: "var(--c-text-on-accent)",

  accent: "var(--c-accent)",
  accentStrong: "var(--c-accent-strong)",
  accentSoft: "var(--c-accent-soft)",
  accentBorder: "var(--c-accent-border)",

  info: "var(--c-info)",
  infoSoft: "var(--c-info-soft)",
  infoBorder: "var(--c-info-border)",

  danger: "var(--c-danger)",
  dangerSoft: "var(--c-danger-soft)",
  dangerBorder: "var(--c-danger-border)",
  success: "var(--c-success)",

  overlay: "var(--c-overlay)",
  shadow: "var(--c-shadow)",
} as const;

export const cardStyle: CSSProperties = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 14,
  padding: "clamp(14px, 3vw, 20px)",
  boxShadow: colors.shadow,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  background: colors.surfaceInput,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 8,
  padding: "10px 12px",
  color: colors.text,
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  color: colors.textMuted,
  marginBottom: 6,
  letterSpacing: "0.5px",
  textTransform: "uppercase",
};

export const buttonStyle: CSSProperties = {
  background: colors.accent,
  color: colors.textOnAccent,
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const ghostButtonStyle: CSSProperties = {
  background: "transparent",
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const sansFont = "'Geist', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const monoFont = "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
