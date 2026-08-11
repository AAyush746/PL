import { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Reveal from './pages/Reveal';
import Shell from './components/Shell';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import CampaignNew from './pages/CampaignNew';
import CampaignDetail from './pages/CampaignDetail';
import Templates from './pages/Templates';
import Employees from './pages/Employees';
import Mailbox from './pages/Mailbox';
import SendingProfiles from './pages/SendingProfiles';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function RequireAuth({ children }) {
  const { token } = useAuth();
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
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

  useEffect(() => {
    if (token) localStorage.setItem('cybersafe_token', token);
    else localStorage.removeItem('cybersafe_token');
  }, [token]);

  const login = (value) => setToken(value);
  const logout = () => setToken('');

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/awareness-reveal" element={<Reveal />} />
          <Route
            element={
              <RequireAuth>
                <Shell />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/new" element={<CampaignNew />} />
            <Route path="/campaigns/:id" element={<CampaignDetail />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/mailbox" element={<Mailbox />} />
            <Route path="/sending-profiles" element={<SendingProfiles />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
