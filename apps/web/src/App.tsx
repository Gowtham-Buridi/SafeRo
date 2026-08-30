import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { ProtectedRoute } from './components/ProtectedRoute.tsx';
import { Login } from './pages/Login.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Transactions } from './pages/Transactions.tsx';
import { RiskCases } from './pages/RiskCases.tsx';
import { AbuseRings } from './pages/AbuseRings.tsx';
import { Analytics } from './pages/Analytics.tsx';
import { Investigation } from './pages/Investigation.tsx';
import { Settings } from './pages/Settings.tsx';
import { NotFound } from './pages/NotFound.tsx';

export function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Login defaultMode="register" />} />

      {/* Authenticated route tree guarded by ProtectedRoute */}
      <Route element={<ProtectedRoute />}>
        {/* Layout shell with top navigation bar and breadcrumbs */}
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/risk-cases" element={<RiskCases />} />
          <Route path="/abuse-rings" element={<AbuseRings />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/investigation" element={<Investigation />} />
          <Route path="/settings" element={<Settings />} />

          {/* Authenticated 404 Catch-All: renders branded NotFound inside Layout shell */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
