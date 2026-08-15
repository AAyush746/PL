import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Landing from './pages/Landing';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import Reveal from './pages/Reveal';
import Plans from './pages/Plans';
import Payment from './pages/Payment';
import Shell from './components/Shell';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import CampaignNew from './pages/CampaignNew';
import CampaignDetail from './pages/CampaignDetail';
import Templates from './pages/Templates';
import Employees from './pages/Employees';
import Remediation from './pages/Remediation';
import Training from './pages/Training';
import Mailbox from './pages/Mailbox';
import SendingProfiles from './pages/SendingProfiles';
import { getMe } from './lib/api';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function AuthGate({ children }) {
  const { token, userLoading } = useAuth();
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (userLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-[#f3ebdb] text-slate-500">
        <Loader2 className="animate-spin text-orange-500" size={22} />
        <span className="text-sm">Loading workspace…</span>
      </div>
    );
  }
  return children;
}

function PublicOnly({ children }) {
  const { token } = useAuth();
  if (token) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('cybersafe_token') || '');
  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(false);

  useEffect(() => {
    if (token) localStorage.setItem('cybersafe_token', token);
    else localStorage.removeItem('cybersafe_token');
  }, [token]);

  useEffect(() => {
    let alive = true;
    if (!token) {
      setUser(null);
      setUserLoading(false);
      return;
    }
    setUserLoading(true);
    getMe(token)
      .then((u) => alive && setUser(u))
      .catch(() => {
        if (alive) {
          setUser(null);
          setToken('');
        }
      })
      .finally(() => alive && setUserLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const login = (value) => setToken(value);
  const logout = () => setToken('');
  const refreshUser = useCallback(async () => {
    if (!token) return;
    const u = await getMe(token);
    setUser(u);
    return u;
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, userLoading, login, logout, refreshUser }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
          <Route path="/awareness-reveal" element={<Reveal />} />
          <Route path="/home" element={<AuthGate><Navigate to="/dashboard" replace /></AuthGate>} />
          <Route path="/start-trial" element={<AuthGate><Plans /></AuthGate>} />
          <Route path="/payment" element={<AuthGate><Payment /></AuthGate>} />
          <Route
            element={
              <AuthGate>
                <Shell />
              </AuthGate>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/new" element={<CampaignNew />} />
            <Route path="/campaigns/:id" element={<CampaignDetail />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/remediation" element={<Remediation />} />
            <Route path="/training" element={<Training />} />
            <Route path="/mailbox" element={<Mailbox />} />
            <Route path="/sending-profiles" element={<SendingProfiles />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
