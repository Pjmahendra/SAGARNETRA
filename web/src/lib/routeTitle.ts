import { useQueryClient } from '@tanstack/react-query'
import type { Incident, IncidentDetail } from './types'

/** The name each console route announces on the curtain. Must match what the page's own heading says. */
const STATIC: Record<string, string> = {
  '/app': 'Dashboard',
  '/app/detect': 'Detect',
  '/app/incidents': 'Incidents',
  '/app/vessels': 'Vessels',
  '/app/reports': 'Reports',
  '/app/admin': 'Admin',
}

/**
 * Resolves a pathname to the title the transition should show.
 *
 * The destination title has to come from the destination itself, so an incident announces its own
 * code rather than a generic word. The code is already in the query cache whenever you arrive from
 * the dashboard or the incident list, which is every route into it bar a pasted URL; that case
 * falls back to "Investigation" rather than showing a raw id.
 */
export function useRouteTitle(): (pathname: string) => string {
  const qc = useQueryClient()
  return (pathname: string): string => {
    const id = /^\/app\/incidents\/(.+)$/.exec(pathname)?.[1]
    if (id) {
      const detail = qc.getQueryData<IncidentDetail>(['incident', id])
      if (detail?.code) return detail.code
      const listed = qc.getQueryData<Incident[]>(['incidents'])?.find((i) => i.id === id)
      return listed?.code ?? 'Investigation'
    }
    return STATIC[pathname.replace(/\/$/, '')] ?? 'SAGARNETRA'
  }
}
