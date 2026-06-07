import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import EmployeeDashboard from './pages/EmployeeDashboard';
import ReviewerDashboard from './pages/ReviewerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AgentDashboard from './pages/AgentDashboard';

export default function App() {
  const { user } = useAuth();

  if (!user) return <LoginPage />;

  switch (user.role) {
    case 'employee':  return <EmployeeDashboard />;
    case 'reviewer':  return <ReviewerDashboard />;
    case 'admin':     return <AdminDashboard />;
    case 'ai_agent':  return <AgentDashboard />;
    default:          return <EmployeeDashboard />;
  }
}
