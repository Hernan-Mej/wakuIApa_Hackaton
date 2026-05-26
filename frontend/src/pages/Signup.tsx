import { useState, type CSSProperties, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { UserType } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import Logo from "../components/Logo";
import ProfileForm, { emptyProfile } from "../components/ProfileForm";
import ThemeToggle from "../components/ThemeToggle";
import { buttonStyle, cardStyle, colors, ghostButtonStyle, inputStyle, labelStyle, monoFont, sansFont } from "../styles";

interface UserTypeOption {
  value: UserType;
  emoji: string;
  title: string;
  description: string;
  highlights: string[];
}

const USER_TYPES: UserTypeOption[] = [
  {
    value: "person",
    emoji: "👤",
    title: "Persona / Hogar",
    description: "Familia, vivienda individual o finca pequeña.",
    highlights: [
      "Dashboard simple y visual",
      "Recomendaciones diarias en lenguaje sencillo",
      "Calculadora de ahorro paso a paso",
    ],
  },
  {
    value: "community",
    emoji: "🏘️",
    title: "Comunidad",
    description: "Junta de acción comunal, ranchería, cooperativa o microred.",
    highlights: [
      "Gestión colectiva de energía",
      "Reparto de excedentes entre hogares",
      "Plan de respaldo grupal ante apagones",
    ],
  },
  {
    value: "business",
    emoji: "🏢",
    title: "Empresa",
    description: "Hotel, hospital, industria, comercio u oficinas.",
    highlights: [
      "KPIs técnicos detallados",
      "Análisis sector-específico (UCI, habitaciones, líneas de producción…)",
      "Plan operativo y financiero completo",
    ],
  },
];

export default function Signup() {
  const { signup } = useAuth();
  const nav = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [userType, setUserType] = useState<UserType | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState(() => emptyProfile("person"));

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function pickType(t: UserType) {
    setUserType(t);
    setProfile(emptyProfile(t));
    setStep(2);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userType) return;
    setError(null);
    setLoading(true);
    try {
      await signup({ email, password, user_type: userType, profile });
      nav("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="r-auth-page"
      style={{
        background: colors.bg, color: colors.text, fontFamily: sansFont,
        alignItems: "flex-start", paddingTop: "max(40px, env(safe-area-inset-top))",
      }}
    >
      <div className="r-auth-toggle">
        <ThemeToggle />
      </div>
      <div style={{ ...cardStyle, width: "100%", maxWidth: step === 1 ? 880 : 760 }}>
        <div
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 18, gap: 12, flexWrap: "wrap",
          }}
        >
          <Logo size={30} />
          <span
            style={{
              fontSize: 10, color: colors.accent, letterSpacing: "3px",
              fontFamily: monoFont,
            }}
          >
            REGISTRO · PASO {step} DE 2
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
          <div
            style={{
              flex: 1, height: 4, borderRadius: 2,
              background: colors.accent, opacity: step >= 1 ? 1 : 0.25,
              transition: "opacity 0.3s",
            }}
          />
          <div
            style={{
              flex: 1, height: 4, borderRadius: 2,
              background: colors.accent, opacity: step >= 2 ? 1 : 0.25,
              transition: "opacity 0.3s",
            }}
          />
        </div>

        {step === 1 && (
          <>
            <h1 className="r-h2" style={{ margin: "0 0 6px", fontWeight: 800 }}>
              ¿Quién va a usar la plataforma?
            </h1>
            <p style={{ margin: "0 0 24px", fontSize: 13, color: colors.textMuted }}>
              Elegí el tipo de cuenta. Adaptamos la interfaz, las recomendaciones y los
              cálculos según tu caso.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
                gap: 14,
              }}
            >
              {USER_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => pickType(t.value)}
                  style={typeCardStyle}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = colors.accentBorder;
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = colors.borderStrong;
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                  }}
                >
                  <div style={{ fontSize: 38, marginBottom: 8 }}>{t.emoji}</div>
                  <div
                    style={{
                      fontSize: 16, fontWeight: 700, color: colors.text, marginBottom: 6,
                    }}
                  >
                    {t.title}
                  </div>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
                    {t.description}
                  </div>
                  <ul
                    style={{
                      margin: 0, padding: 0, listStyle: "none", textAlign: "left",
                    }}
                  >
                    {t.highlights.map((h, i) => (
                      <li
                        key={i}
                        style={{
                          fontSize: 11, color: colors.textMuted, marginBottom: 4,
                          paddingLeft: 16, position: "relative",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute", left: 0, color: colors.accent, fontWeight: 700,
                          }}
                        >
                          ✓
                        </span>
                        {h}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>

            <p
              style={{
                margin: "20px 0 0", fontSize: 12, color: colors.textMuted, textAlign: "center",
              }}
            >
              ¿Ya tienes cuenta?{" "}
              <Link
                to="/login"
                style={{ color: colors.accent, textDecoration: "none", fontWeight: 600 }}
              >
                Iniciar sesión
              </Link>
            </p>
          </>
        )}

        {step === 2 && userType && (
          <>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 12, marginBottom: 18,
              }}
            >
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{ ...ghostButtonStyle, padding: "6px 12px" }}
              >
                ← Cambiar tipo
              </button>
              <span style={{ fontSize: 13, color: colors.textMuted }}>
                <span style={{ fontSize: 18, marginRight: 6 }}>
                  {USER_TYPES.find((t) => t.value === userType)?.emoji}
                </span>
                {USER_TYPES.find((t) => t.value === userType)?.title}
              </span>
            </div>

            <h1 className="r-h2" style={{ margin: "0 0 6px", fontWeight: 800 }}>
              Contanos sobre tu energía
            </h1>
            <p style={{ margin: "0 0 24px", fontSize: 13, color: colors.textMuted }}>
              Si no tienes paneles ni baterías todavía, dejá esos campos en 0 — sirve igual
              para calcular tu inversión.
            </p>

            <form onSubmit={onSubmit}>
              <div style={{ marginBottom: 22 }}>
                <div
                  style={{
                    fontSize: 10, letterSpacing: "2px", color: colors.accent,
                    textTransform: "uppercase", marginBottom: 12, fontFamily: monoFont,
                  }}
                >
                  Cuenta
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
                    gap: 14,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Email</label>
                    <input
                      type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={inputStyle}
                      placeholder="tu@correo.com"
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Contraseña</label>
                    <input
                      type="password" required minLength={6} value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              <ProfileForm userType={userType} value={profile} onChange={setProfile} />

              {error && (
                <div
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12,
                    color: "#f87171",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                style={{ ...buttonStyle, width: "100%", opacity: loading ? 0.6 : 1 }}
              >
                {loading ? "Creando cuenta..." : "Crear cuenta"}
              </button>
            </form>

            <p
              style={{
                margin: "18px 0 0", fontSize: 12, color: colors.textMuted, textAlign: "center",
              }}
            >
              ¿Ya tienes cuenta?{" "}
              <Link
                to="/login"
                style={{ color: colors.accent, textDecoration: "none", fontWeight: 600 }}
              >
                Iniciar sesión
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const typeCardStyle: CSSProperties = {
  background: colors.surfaceStrong,
  border: `2px solid ${colors.borderStrong}`,
  borderRadius: 12,
  padding: 20,
  textAlign: "center" as const,
  cursor: "pointer",
  color: colors.text,
  fontFamily: "inherit",
  transition: "all 0.2s",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center" as const,
};
