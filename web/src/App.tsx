import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import RequireAuth from './auth/RequireAuth'
import RequireRole from './auth/RequireRole'
import AppShell from './components/AppShell'
import { Spinner } from './components/Primitives'
import Landing from './pages/Landing'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const DetectionConsole = lazy(() => import('./pages/DetectionConsole'))
const Incidents = lazy(() => import('./pages/Incidents'))
const Investigation = lazy(() => import('./pages/Investigation'))
const Vessels = lazy(() => import('./pages/Vessels'))
const Reports = lazy(() => import('./pages/Reports'))
const ReportPrint = lazy(() => import('./pages/ReportPrint'))
const Admin = lazy(() => import('./pages/Admin'))

const Lazy = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<div className="p-6"><Spinner label="Loading" /></div>}>{children}</Suspense>
)

/**
 * Plain routing. Navigation is immediate: no overlay, no pinned location, no destination card.
 *
 * There was a curtain here that covered the swap and announced the page being opened. It was
 * removed deliberately — on a console an officer clicks through all day, a second of ceremony per
 * navigation costs more than it gives. The per-component motion stays: panels reveal as they scroll
 * in, the page title rises, the nav indicator slides, controls respond to a press.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          {/* Outside AppShell: the evidence pack prints as a document, with no console chrome. */}
          <Route path="/app/reports/:id/print" element={<Lazy><ReportPrint /></Lazy>} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Lazy><Dashboard /></Lazy>} />
            <Route path="detect" element={<Lazy><DetectionConsole /></Lazy>} />
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
