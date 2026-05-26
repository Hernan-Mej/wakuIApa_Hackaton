import { useAuth } from "../auth/AuthContext";
import BusinessDashboard from "./dashboards/BusinessDashboard";
import CommunityDashboard from "./dashboards/CommunityDashboard";
import PersonalDashboard from "./dashboards/PersonalDashboard";

/** Router: despacha al dashboard correcto según el tipo de usuario. */
export default function Dashboard() {
  const { user } = useAuth();
  switch (user?.user_type) {
    case "business":
      return <BusinessDashboard />;
    case "community":
      return <CommunityDashboard />;
    case "person":
    default:
      return <PersonalDashboard />;
  }
}
