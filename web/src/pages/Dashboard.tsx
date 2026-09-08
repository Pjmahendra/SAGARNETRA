import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Crosshair, MapPin } from 'lucide-react'
import { api } from '../lib/api'
import { fmtAgo, fmtKm2, fmtUtc } from '../lib/format'
import { cn } from '../lib/cn'
import { Empty, EngineBadge, KpiTile, PageHeader, Panel, Spinner, StatusChip, TierChip } from '../components/Primitives'
import SpillGlobe from '../components/SpillGlobe'
import RealMap, { type MapPoint } from '../components/RealMap'
import type { Incident, LonLat } from '../lib/types'
import { useUi } from '../store/ui'

const ZOOM_MS = 1100 // globe flies to the slick, then the map dives in

// Short region codes so each spill reads as "MA 18.84°N 72.61°E" rather than a repeated zone name.
const REGION_CODE: Record<string, string> = {
  'Gujarat Offshore Lane': 'GOL',
  'Mumbai Approaches': 'MA',
  'Chennai–Ennore': 'CE',
}
function spillName(i: Incident): string {
  const code = REGION_CODE[i.zone] ?? i.zone.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
  const [lon, lat] = i.centroid
  return `${code} ${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
}

const SECTIONS = [
  { id: 'globe', label: 'Where the slicks are' },
  { id: 'metrics', label: 'Key metrics' },
  { id: 'incidents', label: 'Open incidents' },
  { id: 'zones', label: 'Watch zones' },
  { id: 'trend', label: 'Trend' },
] as const

export default function Dashboard() {
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.overview })
  const incidents = useQuery({ queryKey: ['incidents'], queryFn: api.incidents })
  const o = overview.data
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'globe' | 'map'>('globe')
  const zoomTimer = useRef<number | null>(null)
  const navigate = useNavigate()
  const { zoneId, setZone } = useUi()

  const all = incidents.data ?? []
  const selected = all.find((i) => i.id === selectedId) ?? null
  const zoneOf = (name: string) => o?.zones.find((z) => z.name === name) ?? null
  // The region chosen in the top bar drives the "recorded oil spills" list beside the map.
  const zoneName = o?.zones.find((z) => z.id === zoneId)?.name ?? 'all zones'
  const regionSpills = all.filter((i) => i.zone_id === zoneId)

  // On select the globe flies to the slick, then the panel dives into the real map with the incident's
  // slick, drift ellipses and AIS tracks, plus its sector's pending detections. Same behaviour as the old
  // command view, folded into the dashboard's existing panel — the resting look is unchanged.
  const detailQ = useQuery({ queryKey: ['incident', selectedId], queryFn: () => api.incident(selectedId as string), enabled: !!selectedId })
  const sectorQ = useQuery({ queryKey: ['sector', selected?.zone_id], queryFn: () => api.sector(selected!.zone_id as string), enabled: !!selected?.zone_id })
  const samplesQ = useQuery({ queryKey: ['detect', 'samples'], queryFn: api.detectSamples })
  // Which sample tile a detection sits on: the one whose footprint contains its centroid. Lets an
  // unconfirmed spill deep-link straight onto its scene in the console.
  const tileFor = ([lon, lat]: LonLat) =>
    (samplesQ.data ?? []).find((s) => lon >= s.bbox[0] && lon <= s.bbox[2] && lat >= s.bbox[1] && lat <= s.bbox[3])

  const det = detailQ.data
  const mapPoints: MapPoint[] = (sectorQ.data?.detections ?? [])
    .filter((d) => Array.isArray(d.centroid) && d.centroid.length === 2)
    .map((d) => ({
      id: d.id, position: d.centroid as LonLat, tone: d.has_spill ? 'spill' : 'clean',
      label: d.has_spill ? 'Possible slick' : 'Clean tile',
      onClick: () => navigate(d.sample_id ? `/app/detect?sample=${d.sample_id}` : '/app/detect'),
    }))
  const showMap = phase === 'map' && !!selected

  // Selecting a slick (globe or list) drives the header's global Zone selector, so the
  // console-wide zone context always matches what is on screen here. The reverse direction
  // (changing the header Zone) drops a selection that belongs to a different zone, so the
  // two never show contradictory localities at once; this ref just stops that reverse effect
  // from immediately undoing the forward sync's own setZone call.
  const skipNextZoneSync = useRef(false)
  const analyse = (i: Incident) => {
    const tile = tileFor(i.centroid)
    navigate(tile ? `/app/detect?sample=${tile.id}` : '/app/detect')
  }

  const selectIncident = (id: string | null) => {
    // Both confirmed and unconfirmed spills dive to the map + side box; the side box's action differs
    // (Open investigation vs Analyse). So selection is the same for both.
    const inc = id ? all.find((i) => i.id === id) : null
    if (zoomTimer.current) { clearTimeout(zoomTimer.current); zoomTimer.current = null }
    setSelectedId(id)
    setPhase('globe')
    if (id) zoomTimer.current = window.setTimeout(() => setPhase('map'), ZOOM_MS)
    const z = inc ? zoneOf(inc.zone) : null
    if (z) { skipNextZoneSync.current = true; setZone(z.id) }
  }

  useEffect(() => () => { if (zoomTimer.current) clearTimeout(zoomTimer.current) }, [])

  useEffect(() => {
    if (skipNextZoneSync.current) { skipNextZoneSync.current = false; return }
    if (!selected) return
    if (zoneOf(selected.zone)?.id !== zoneId) { setSelectedId(null); setPhase('globe') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId])

  // Centre the map on the selected spill, and always drop a mark at its centroid (so an unconfirmed spill
  // with no polygon still shows the oil-spill mark).
  const focus: [number, number, number, number] | undefined = selected
    ? [selected.centroid[0] - 0.15, selected.centroid[1] - 0.15, selected.centroid[0] + 0.15, selected.centroid[1] + 0.15]
    : undefined
  const spillMark: MapPoint[] = selected
    ? [{
        id: `sel-${selected.id}`, position: selected.centroid, tone: 'spill', label: spillName(selected),
        onClick: () => (selected.status === 'detected' ? analyse(selected) : navigate(`/app/incidents/${selected.id}`)),
      }]
    : []

  // Section nav: buttons jump between the page's boxes instead of scrolling to find them.
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const setSectionRef = (id: string) => (el: HTMLElement | null) => { sectionRefs.current[id] = el }
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id)
  const goToSection = (id: string) => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  useEffect(() => {
    if (!o) return
    const els = SECTIONS.map((s) => sectionRefs.current[s.id]).filter((el): el is HTMLElement => !!el)
    if (els.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveSection(visible[0].target.id)
      },
      { root: null, rootMargin: '-72px 0px -70% 0px', threshold: 0 },
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [o])

  return (
    <div className="p-6">
      <PageHeader eyebrow="Overview" title="Dashboard" description="What needs attention across all watch zones. Times in UTC." />
      {!o ? <Spinner label="Loading overview" /> : (
        <>
          {/* Buttons to jump between the page's boxes, in place of hunting with the scrollbar. */}
          <nav className="mb-4 flex flex-wrap gap-1 rounded-lg bg-surface-2/70 p-1" aria-label="Jump to section">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goToSection(s.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  activeSection === s.id ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-surface hover:text-ink',
                )}
              >
                {s.label}
              </button>
            ))}
          </nav>

          {/* The globe is the first thing an officer should see, full width; key metrics
              follow right below it. */}
          <Panel
            id="globe"
            ref={setSectionRef('globe')}
            title="Where the slicks are"
            actions={
                selected ? (
                  <button type="button" onClick={() => selectIncident(null)} className="text-xs text-sea hover:underline">
                    Clear selection
                  </button>
                ) : (
                  <span className="font-mono text-[11px] text-ink-3">click a dot to select a locality</span>
                )
              }
              bodyClassName="p-0"
            >
              <div className="grid lg:grid-cols-[1fr_1fr]">
                <div className="p-4">
                  <div className="relative aspect-square w-full overflow-hidden rounded-md">
                    <AnimatePresence>
                      {showMap ? (
                        <motion.div key="map" className="absolute inset-0" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.55, ease: 'easeOut' }}>
                          {!det ? <div className="grid size-full place-items-center"><Spinner label="Loading map" /></div> : (
                            // Just the oil-spill mark in the region — no ships/AIS/drift here. Click it to enquire and test.
                            // Zooming right out is the officer asking for the whole earth, which is
                            // what the globe is for: the dive reverses instead of showing a flat
                            // world map repeating sideways with grey where the poles should be.
                            <RealMap className="size-full" focus={focus} polygon={det.polygon}
                              points={[...mapPoints, ...spillMark]} onZoomOut={() => setPhase('globe')} />
                          )}
                        </motion.div>
                      ) : (
                        <motion.div key="globe" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.1 }} transition={{ duration: 0.5 }}>
                          {!incidents.data ? <div className="grid size-full place-items-center"><Spinner /></div> : (
                            <SpillGlobe incidents={all} selectedId={selectedId} onSelect={selectIncident} />
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="border-t border-line p-5 lg:border-l lg:border-t-0">
                  <AnimatePresence mode="wait">
                    {selected ? (
                      <motion.div
                        key={selected.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                      >
                        <div className="label-caps flex items-center gap-1.5 text-[10px]">
                          <MapPin className="size-3" /> Selected locality
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-lg font-semibold">{selected.code}</span>
                          <StatusChip status={selected.status} />
                          <EngineBadge engine={selected.engine} />
                          {selected.is_demo && (
                            <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3">demo scenario</span>
                          )}
                        </div>
                        <div className="mt-1 font-display text-2xl font-semibold">{spillName(selected)}</div>
                        <div className="text-sm text-ink-3">{selected.zone}</div>

                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                          {[
                            ['Slick area', fmtKm2(selected.area_km2)],
                            ['Confidence', `${Math.round(selected.confidence * 100)}%`],
                            ['Detected', fmtUtc(selected.detected_at)],
                            ['Age', fmtAgo(selected.detected_at)],
                            ['Centroid', `${selected.centroid[1].toFixed(4)}°N, ${selected.centroid[0].toFixed(4)}°E`],
                            ['Ships in zone now', zoneOf(selected.zone) ? String(zoneOf(selected.zone)!.vessels_now) : '—'],
                          ].map(([k, v]) => (
                            <div key={k}>
                              <dt className="label-caps text-[10px]">{k}</dt>
                              <dd className="mt-0.5 font-mono text-sm tnum text-ink">{v}</dd>
                            </div>
                          ))}
                        </dl>

                        <div className="mt-4 rounded-md border border-line bg-surface-2/50 p-3">
                          <div className="label-caps text-[10px]">Leading candidate</div>
                          {selected.top_tier ? (
                            <div className="mt-1.5 flex items-center gap-2">
                              <TierChip tier={selected.top_tier} />
                              <span className="font-mono text-sm">{selected.top_vessel ?? 'unnamed'}</span>
                            </div>
                          ) : (
                            <div className="mt-1.5 text-sm text-ink-3">Not ranked yet — no vessels scored for this slick.</div>
                          )}
                        </div>

                        {selected.status === 'detected' ? (
                          <button
                            type="button"
                            onClick={() => analyse(selected)}
                            className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-deep"
                          >
                            Analyse with the models <ArrowRight className="size-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void navigate(`/app/incidents/${selected.id}`)}
                            className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-deep"
                          >
                            Open investigation <ArrowRight className="size-4" />
                          </button>
                        )}
                        <p className="mt-3 text-xs text-ink-3">
                          {selected.status === 'detected'
                            ? 'Unconfirmed detection — run the models to score it, then tag it as an incident.'
                            : 'A lead for inspection, not a verdict. Boarding and sampling confirm.'}
                        </p>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="label-caps flex items-center gap-1.5 text-[10px]">
                          <Crosshair className="size-3" /> Recorded oil spills · {zoneName}
                        </div>
                        <p className="mt-2 max-w-[44ch] text-sm text-ink-2">
                          Slicks detected in this region. Click one to pull it up — a confirmed case shows its evidence; an
                          unconfirmed detection opens in the console to run the models.
                        </p>
                        {regionSpills.length === 0 ? (
                          <div className="mt-4 rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3">
                            No recorded spills in {zoneName} yet.
                          </div>
                        ) : (
                          <ul className="mt-4 max-h-72 divide-y divide-line overflow-auto rounded-md border border-line">
                            {regionSpills.map((i) => (
                              <li key={i.id}>
                                <button
                                  type="button"
                                  onClick={() => selectIncident(i.id)}
                                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2/60"
                                >
                                  <span className="font-mono text-xs text-ink-2">{i.code}</span>
                                  <span className="min-w-0 flex-1 truncate font-mono text-sm">{spillName(i)}</span>
                                  <StatusChip status={i.status} />
                                  <span className="font-mono text-xs tnum text-ink-3">{fmtKm2(i.area_km2)}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-3 text-xs text-ink-3">Switch region in the top bar to see other zones. Drag the globe to spin.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </Panel>

          <div id="metrics" ref={setSectionRef('metrics')} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile label="Open incidents" value={o.open_incidents} tone={o.open_incidents > 0 ? 'accent' : 'default'} hint="detected or under investigation" />
            <KpiTile label="Slicks this month" value={o.slicks_this_month} hint="confirmed by an officer" />
            <KpiTile label="Area this month" value={o.area_km2_this_month.toFixed(1)} unit="km²" hint="sum of confirmed slick polygons" />
            <KpiTile label="Vessels tracked" value={o.vessels_tracked} hint="live AIS inside watch zones" />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Panel id="incidents" ref={setSectionRef('incidents')} title="Open incidents" actions={<Link to="/app/incidents" className="text-xs text-sea hover:underline">All incidents</Link>} bodyClassName="p-0">
              {!incidents.data ? <div className="p-4"><Spinner /></div> : incidents.data.filter((i) => i.status !== 'closed').length === 0 ? <div className="p-4"><Empty title="No open incidents" /></div> : (
                <ul className="divide-y divide-line">
                  {incidents.data.filter((i) => i.status !== 'closed').map((i) => (
                    <li key={i.id} className={i.id === selectedId ? 'bg-surface-2/50' : undefined}>
                      <div className="flex items-stretch">
                        <button
                          type="button"
                          onClick={() => selectIncident(i.id === selectedId ? null : i.id)}
                          title="Show on globe"
                          aria-label={`Show ${i.code} on globe`}
                          className={`grid w-9 shrink-0 place-items-center border-r border-line hover:bg-surface-2 ${i.id === selectedId ? 'text-accent' : 'text-ink-3'}`}
                        >
                          <Crosshair className="size-3.5" />
                        </button>
                        <Link to={`/app/incidents/${i.id}`} className={`flex min-w-0 flex-1 items-center gap-4 px-4 py-3 hover:bg-surface-2/60 ${i.top_tier === 'prime' ? 'shadow-[inset_3px_0_0_0_var(--color-crit)]' : i.top_tier === 'poi' ? 'shadow-[inset_3px_0_0_0_var(--color-warn)]' : 'shadow-[inset_3px_0_0_0_var(--color-line)]'}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">{i.code}</span>
                              <StatusChip status={i.status} />
                              <EngineBadge engine={i.engine} />
                            </div>
                            <div className="mt-0.5 truncate text-sm text-ink-2">{spillName(i)} · {fmtKm2(i.area_km2)} · confidence {Math.round(i.confidence * 100)}% · {fmtUtc(i.detected_at)}</div>
                          </div>
                          <div className="text-right">
                            {i.top_tier ? <TierChip tier={i.top_tier} /> : <span className="text-xs text-ink-3">not ranked yet</span>}
                            {i.top_vessel && <div className="mt-0.5 font-mono text-xs text-ink-2">{i.top_vessel}</div>}
                          </div>
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel id="zones" ref={setSectionRef('zones')} title="Watch zones" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {o.zones.map((z) => (
                  <li key={z.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold">{z.name}</div>
                      <div className="text-xs text-ink-3">last scene {z.last_scene_at ? `${fmtAgo(z.last_scene_at)} · ${fmtUtc(z.last_scene_at)}` : 'none yet'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-2xl font-semibold tnum leading-none">{z.vessels_now}</div>
                      <div className="label-caps text-[10px]">ships now</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="mt-4">
            <Panel id="trend" ref={setSectionRef('trend')} title="Slicks detected, last 14 days">
              <div className="h-44">
                <ResponsiveContainer>
                  <AreaChart data={o.trend} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
                    <defs>
                      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ff6803" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#ff6803" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fill: '#928c83', fontSize: 11, fontFamily: 'IBM Plex Mono' }} axisLine={{ stroke: '#dad5cd' }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: '#928c83', fontSize: 11, fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#14100c', border: '1px solid #14100c', borderRadius: 6, fontSize: 12 }} labelStyle={{ color: '#928c83' }} itemStyle={{ color: '#f4f2ef' }} />
                    <Area type="monotone" dataKey="slicks" stroke="#ff6803" strokeWidth={2} fill="url(#g)" dot={{ r: 2.5, fill: '#ff6803', strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
