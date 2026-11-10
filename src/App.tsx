import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { Login } from './pages/Login'
import { StaffHome } from './pages/StaffHome'
import { CountSession } from './pages/CountSession'
import { Dashboard } from './pages/admin/Dashboard'
import { Counts } from './pages/admin/Counts'
import { CountDetail } from './pages/admin/CountDetail'
import { Articles } from './pages/admin/Articles'
import { ImportPage } from './pages/admin/Import'
import { Compare } from './pages/admin/Compare'
import { Users } from './pages/admin/Users'
import { OrderList } from './pages/admin/OrderList'
import { Suppliers } from './pages/admin/Suppliers'
import type { Role } from './data/types'

function IndexRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/admin' : '/count'} replace />
}

function RequireRole({
  role,
  children,
}: {
  role: Role
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/count'} replace />
  }
  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return <Spinner />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<IndexRedirect />} />

      {/* Staff */}
      <Route path="/count" element={<RequireRole role="staff"><StaffHome /></RequireRole>} />
      <Route path="/count/:id" element={<RequireRole role="staff"><CountSession /></RequireRole>} />

      {/* Admin */}
      <Route path="/admin" element={<RequireRole role="admin"><Dashboard /></RequireRole>} />
      <Route path="/admin/counts" element={<RequireRole role="admin"><Counts /></RequireRole>} />
      <Route path="/admin/counts/:id" element={<RequireRole role="admin"><CountDetail /></RequireRole>} />
      <Route path="/admin/articles" element={<RequireRole role="admin"><Articles /></RequireRole>} />
      <Route path="/admin/suppliers" element={<RequireRole role="admin"><Suppliers /></RequireRole>} />
      <Route path="/admin/import" element={<RequireRole role="admin"><ImportPage /></RequireRole>} />
      <Route path="/admin/compare" element={<RequireRole role="admin"><Compare /></RequireRole>} />
      <Route path="/admin/users" element={<RequireRole role="admin"><Users /></RequireRole>} />
      <Route path="/admin/orders" element={<RequireRole role="admin"><OrderList /></RequireRole>} />
      <Route path="/admin/orders/:countId" element={<RequireRole role="admin"><OrderList /></RequireRole>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
