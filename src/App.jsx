import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoadingSpinner from './components/LoadingSpinner'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ExecutiveDashboard from './pages/ExecutiveDashboard'
import SalesIntelligence from './pages/SalesIntelligence'
import InventoryManagement from './pages/InventoryManagement'
import RiskManagement from './pages/RiskManagement'
import CashFlowForecast from './pages/CashFlowForecast'

function App() {
  const { user, loading, signOut } = useAuth()

  // Show loading spinner while checking authentication
  if (loading) {
    return <LoadingSpinner message="Checking authentication..." />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" /> : <Login />}
        />

        <Route
          path="/dashboard"
          element={
            !user ? (
              <Navigate to="/login" />
            ) : (
              <Dashboard user={user} onLogout={signOut}>
                <ExecutiveDashboard user={user} />
              </Dashboard>
            )
          }
        />

        <Route
          path="/sales"
          element={
            !user ? (
              <Navigate to="/login" />
            ) : (
              <Dashboard user={user} onLogout={signOut}>
                <SalesIntelligence user={user} />
              </Dashboard>
            )
          }
        />

        <Route
          path="/inventory"
          element={
            !user ? (
              <Navigate to="/login" />
            ) : (
              <Dashboard user={user} onLogout={signOut}>
                <InventoryManagement user={user} />
              </Dashboard>
            )
          }
        />

        <Route
          path="/risk"
          element={
            !user ? (
              <Navigate to="/login" />
            ) : (
              <Dashboard user={user} onLogout={signOut}>
                <RiskManagement user={user} />
              </Dashboard>
            )
          }
        />

        <Route
          path="/cashflow"
          element={
            !user ? (
              <Navigate to="/login" />
            ) : (
              <Dashboard user={user} onLogout={signOut}>
                <CashFlowForecast user={user} />
              </Dashboard>
            )
          }
        />

        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
