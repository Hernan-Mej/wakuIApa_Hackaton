import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ThemeProvider } from "./theme/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Forecast from "./pages/Forecast";
import Investment from "./pages/Investment";
import Login from "./pages/Login";
import NetMetering from "./pages/NetMetering";
import Profile from "./pages/Profile";
import Signup from "./pages/Signup";
import { colors } from "./styles";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoading />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function FullPageLoading() {
  return (
    <div style={{
      minHeight: "100vh", background: colors.bg, color: colors.textMuted,
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
    }}>
      Cargando...
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
            <Route path="/profile" element={<Protected><Profile /></Protected>} />
            <Route path="/investment" element={<Protected><Investment /></Protected>} />
            <Route path="/net-metering" element={<Protected><NetMetering /></Protected>} />
            <Route path="/forecast" element={<Protected><Forecast /></Protected>} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
