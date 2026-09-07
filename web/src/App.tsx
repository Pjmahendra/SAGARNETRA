import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import RequireAuth from './auth/RequireAuth'
import RequireRole from './auth/RequireRole'
import AppShell from './components/AppShell'
import { Spinner } from './components/Primitives'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NotFound from './pages/NotFound'

const CommandView = lazy(() => import('./pages/CommandView'))
const DetectionConsole = lazy(() => import('./pages/DetectionConsole'))
const LiveMap = lazy(() => import('./pages/LiveMap'))
const Incidents = lazy(() => import('./pages/Incidents'))
const Investigation = lazy(() => import('./pages/Investigation'))
const Vessels = lazy(() => import('./pages/Vessels'))
const Reports = lazy(() => import('./pages/Reports'))
const Admin = lazy(() => import('./pages/Admin'))

const Lazy = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<div className="p-6"><Spinner label="Loading" /></div>}>{children}</Suspense>
)

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Lazy><CommandView /></Lazy>} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="detect" element={<Lazy><DetectionConsole /></Lazy>} />
            <Route path="map" element={<Lazy><LiveMap /></Lazy>} />
            <Route path="incidents" element={<Lazy><Incidents /></Lazy>} />
            <Route path="incidents/:id" element={<Lazy><Investigation /></Lazy>} />
            <Route path="vessels" element={<Lazy><Vessels /></Lazy>} />
            <Route path="reports" element={<Lazy><Reports /></Lazy>} />
            <Route element={<RequireRole role="admin" />}>
              <Route path="admin" element={<Lazy><Admin /></Lazy>} />
            </Route>
          </Route>
        </Route>
        <Route path="/app/*" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
