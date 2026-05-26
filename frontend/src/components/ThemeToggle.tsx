import { useTheme } from "../theme/ThemeContext";
import { colors } from "../styles";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      aria-label="Cambiar tema"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 999,
        padding: "6px 12px",
        cursor: "pointer",
        color: colors.text,
        fontFamily: "inherit",
        fontSize: 12,
        transition: "background 0.2s",
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>{isDark ? "🌙" : "☀️"}</span>
      <span style={{ fontWeight: 600 }}>{isDark ? "Noche" : "Día"}</span>
    </button>
  );
}
