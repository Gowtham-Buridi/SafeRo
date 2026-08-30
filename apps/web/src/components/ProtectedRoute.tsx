import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.tsx';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  // While rehydrating from localStorage, show nothing (prevents flash)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fbfbfd] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          <p className="text-xs font-mono text-slate-400 tracking-wider uppercase">
            Initialising SafeRo…
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated → hard redirect to /login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated → render child routes via Outlet
  return <Outlet />;
}
