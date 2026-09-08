import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { useReducedMotion } from 'motion/react'
import RequireAuth from './auth/RequireAuth'
import RequireRole from './auth/RequireRole'
import AppShell from './components/AppShell'
import PageCurtain from './components/PageCurtain'
import { Spinner } from './components/Primitives'
import { useRouteTitle } from './lib/routeTitle'
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

/** The printable evidence pack is a document, not a console page: no shell, and no curtain. */
const PRINT_PATH = /^\/app\/reports\/[^/]+\/print$/

const Lazy = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<div className="p-6"><Spinner label="Loading" /></div>}>{children}</Suspense>
)

/**
 * Every move between console pages runs the curtain.
 *
 * The router is rendered against `display`, a location deliberately held one step behind the real
 * one. When the address changes the outgoing page stays on screen while the curtain closes over
 * it; only once the screen is fully dark does `display` catch up, so the destination mounts
 * unseen and is revealed already complete. That also means back and forward, a redirect and a
 * plain `navigate()` all animate identically, with no page having to opt in.
 *
 * Only console-to-console moves animate. The landing page and login are outside it, and a change
 * of search string or hash on the same page is not a page change at all.
 */
function AppRoutes() {
  const location = useLocation()
  const [display, setDisplay] = useState(location)
  const [phase, setPhase] = useState<'idle' | 'cover' | 'reveal'>('idle')
  const routeTitle = useRouteTitle()
  // Someone who asked the system for less motion gets the page, not the performance: the router
  // swaps straight away and the overlay never mounts.
  const still = useReducedMotion()

  // Adjusting state while rendering, rather than in an effect, so the pinned location and the
  // curtain start in the same commit as the address change. An effect would paint one frame of
  // the destination first, which is the flash this exists to prevent.
  if (phase === 'idle' && location.pathname !== display.pathname) {
    const inConsole = !still && [location.pathname, display.pathname].every(
      (p) => p.startsWith('/app') && !PRINT_PATH.test(p),
    )
    if (inConsole) setPhase('cover')
    else setDisplay(location)
  }

  const title = routeTitle(phase === 'cover' ? location.pathname : display.pathname)

  return (
    <>
      <Routes location={display}>
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

      {phase !== 'idle' && (
        <PageCurtain
          mode={phase}
          title={title}
          // `location` here is the newest one: a second click mid-curtain re-renders us with the
          // later destination, and the curtain always calls the callback it was last handed.
          onDone={phase === 'cover'
            ? () => { setDisplay(location); setPhase('reveal') }
            : () => setPhase('idle')}
        />
      )}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
