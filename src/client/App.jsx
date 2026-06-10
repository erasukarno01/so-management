// App.jsx
import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import { DashboardPage } from './pages/dashboard';
import { SalesOrdersPage } from './pages/sales-orders';
import DeliveryExecution from './pages/DeliveryExecution';
import ScanQRCode from './pages/ScanQRCode';
import { AdminPage } from './pages/admin';
import { AlertsPage } from './pages/alerts';
import { ReportsPage } from './pages/reports';
import Layout from './components/Layout';

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  const { checkAuth } = useAuthStore();
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="sales-orders" element={<SalesOrdersPage />} />
        <Route path="delivery" element={<DeliveryExecution />} />
        <Route path="delivery/scan/:batchId" element={<ScanQRCode />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;