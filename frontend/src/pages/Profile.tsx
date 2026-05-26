import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import type { CompanyProfile } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import Logo from "../components/Logo";
import ProfileForm, { emptyProfile } from "../components/ProfileForm";
import ThemeToggle from "../components/ThemeToggle";
import { buttonStyle, cardStyle, colors, ghostButtonStyle, monoFont, sansFont } from "../styles";

export default function Profile() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [profile, setProfile] = useState<CompanyProfile>(
    () => user?.profile ?? emptyProfile(user?.user_type ?? "person"),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (user?.profile) setProfile(user.profile);
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch<CompanyProfile>("/api/profile", { method: "PUT", body: profile });
      await refresh();
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      minHeight: "100svh", background: colors.bg, color: colors.text, fontFamily: sansFont,
    }}>
      <div className="r-page" style={{ maxWidth: 760 }}>
        <header className="r-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Logo size={28} />
            <span style={{
              fontSize: 10, color: colors.textFaint, letterSpacing: "2px", fontFamily: monoFont,
              borderLeft: `1px solid ${colors.border}`, paddingLeft: 12, whiteSpace: "nowrap",
            }}>
              EDITAR PERFIL
            </span>
          </div>
          <div className="r-header__actions">
            <ThemeToggle />
            <Link to="/dashboard" style={{ ...ghostButtonStyle, textDecoration: "none" }}>
              ← Dashboard
            </Link>
          </div>
        </header>

        <div style={cardStyle}>
          <h1 className="r-h2" style={{ margin: "0 0 6px", fontWeight: 800 }}>
            Perfil de empresa
          </h1>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: colors.textMuted }}>
          Cuanto más detallado sea el perfil, más precisas serán las recomendaciones del agente IA.
        </p>

        <form onSubmit={onSubmit}>
          <ProfileForm userType={user?.user_type ?? "person"} value={profile} onChange={setProfile} />

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12, color: "#f87171",
            }}>
              {error}
            </div>
          )}

          {savedAt && !error && (
            <div style={{
              background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12, color: colors.success,
            }}>
              ✓ Guardado a las {savedAt.toLocaleTimeString()}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={saving} style={{ ...buttonStyle, flex: 1, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
            <button type="button" onClick={() => nav("/dashboard")} style={ghostButtonStyle}>
              Cancelar
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
