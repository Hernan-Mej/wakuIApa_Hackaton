import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";
import { buttonStyle, cardStyle, colors, inputStyle, labelStyle, sansFont } from "../styles";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      nav("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="r-auth-page" style={{ background: colors.bg, color: colors.text, fontFamily: sansFont }}>
      <div className="r-auth-toggle">
        <ThemeToggle />
      </div>
      <div style={{ ...cardStyle, width: "100%", maxWidth: 400 }}>
        <div style={{ marginBottom: 24 }}>
          <Logo size={32} />
        </div>
        <h1 className="r-h2" style={{ margin: "0 0 6px", fontWeight: 800 }}>
          Iniciar sesión
        </h1>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: colors.textMuted }}>
          Bienvenido de vuelta a tu panel energético.
        </p>

        <form onSubmit={onSubmit}>
          <label style={labelStyle}>Email</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ ...inputStyle, marginBottom: 14 }}
            placeholder="empresa@ejemplo.com"
          />
          <label style={labelStyle}>Contraseña</label>
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, marginBottom: 18 }}
          />

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12, color: "#f87171",
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ ...buttonStyle, width: "100%", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p style={{ margin: "18px 0 0", fontSize: 12, color: colors.textMuted, textAlign: "center" }}>
          ¿No tienes cuenta?{" "}
          <Link to="/signup" style={{ color: colors.accent, textDecoration: "none", fontWeight: 600 }}>
            Crear una
          </Link>
        </p>
      </div>
    </div>
  );
}
