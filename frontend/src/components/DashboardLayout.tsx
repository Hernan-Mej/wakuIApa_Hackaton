import { Link, NavLink, useLocation } from "react-router-dom";
import type { CSSProperties, ReactNode } from "react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { colors, ghostButtonStyle, monoFont, sansFont } from "../styles";

interface Props {
  user: { email: string; user_type: string } | null;
  onLogout: () => void;
  subtitle?: string;
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: "/dashboard", emoji: "🏠", label: "Inicio" },
  { to: "/forecast", emoji: "🌦️", label: "Pronóstico" },
  { to: "/investment", emoji: "💰", label: "Inversión" },
  { to: "/net-metering", emoji: "⚡", label: "Carga neta" },
] as const;

export default function DashboardLayout({ user, onLogout, subtitle, children }: Props) {
  const location = useLocation();
  return (
    <div style={{
      minHeight: "100svh",
      background: colors.bg,
      color: colors.text,
      fontFamily: sansFont,
    }}>
      <div className="r-page">
        <header className="r-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
            <Logo size={28} />
            <span style={{
              fontSize: 10, color: colors.textFaint, letterSpacing: "2px",
              fontFamily: monoFont, borderLeft: `1px solid ${colors.border}`, paddingLeft: 12,
              whiteSpace: "nowrap",
            }}>
              {subtitle ?? "RIOHACHA · LA GUAJIRA"}
            </span>
          </div>
          <div className="r-header__actions" style={{ fontSize: 12 }}>
            <span className="r-header__email" style={{ color: colors.textMuted }}>{user?.email}</span>
            <ThemeToggle />
            <Link to="/profile" style={{ ...ghostButtonStyle, textDecoration: "none" }}>Editar perfil</Link>
            <button onClick={onLogout} style={ghostButtonStyle}>Cerrar sesión</button>
          </div>
        </header>

        {/* Nav módulos */}
        <nav
          style={{
            display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap",
            overflowX: "auto",
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                style={navItemStyle(active)}
              >
                <span style={{ fontSize: 14 }}>{item.emoji}</span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}

function navItemStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 999,
    background: active ? colors.accentSoft : colors.surface,
    border: `1px solid ${active ? colors.accentBorder : colors.border}`,
    color: active ? colors.accent : colors.text,
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    textDecoration: "none",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    transition: "all 0.15s",
  };
}
