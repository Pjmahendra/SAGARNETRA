import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import {
  ArcGisMapServerImageryProvider, Cartesian2, Cartesian3, Color, Entity, ImageryLayer, Ion, Rectangle,
  ScreenSpaceEventHandler, ScreenSpaceEventType, Viewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { AlertTriangle, ArrowLeft, ScanSearch, Waves } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { fmtKm2 } from '../lib/format'
import { Empty, Spinner, StatusChip, TierChip } from '../components/Primitives'

// Token-free: Esri World Imagery, no Cesium Ion account (matches the Leaflet basemap decision).
Ion.defaultAccessToken = ''
const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
const HOT = Color.fromCssColorString('#ff6803')
const CALM = Color.fromCssColorString('#22b8cf')
const INDIA_VIEW = Cartesian3.fromDegrees(78, 12, 4_200_000)

export default function CommandView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const navigate = useNavigate()
  const sectors = useQuery({ queryKey: ['sectors'], queryFn: api.sectors })
  const [selected, setSelected] = useState<string | null>(null)
  const detail = useQuery({ queryKey: ['sector', selected], queryFn: () => api.sector(selected as string), enabled: !!selected })

  // Build the viewer once. Everything Ion/token-dependent is turned off.
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return
    const viewer = new Viewer(containerRef.current, {
      baseLayer: ImageryLayer.fromProviderAsync(ArcGisMapServerImageryProvider.fromUrl(ESRI), {}),
      baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false,
    })
    viewer.cesiumWidget.creditContainer.setAttribute('style', 'display:none')
    viewer.scene.globe.enableLighting = false
    viewer.camera.setView({ destination: INDIA_VIEW })
    viewerRef.current = viewer

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(e.position) as { id?: Entity } | undefined
      const id = picked?.id instanceof Entity ? picked.id.id : undefined
      if (typeof id === 'string' && id.startsWith('sector:')) setSelected(id.slice(7))
    }, ScreenSpaceEventType.LEFT_CLICK)

    return () => { handler.destroy(); viewer.destroy(); viewerRef.current = null }
  }, [])

  // (Re)draw sector markers when the data arrives.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !sectors.data) return
    viewer.entities.removeAll()
    for (const s of sectors.data) {
      if (!s.center) continue
      const hot = s.pending > 0
      viewer.entities.add({
        id: `sector:${s.id}`,
        position: Cartesian3.fromDegrees(s.center[0], s.center[1]),
        point: { pixelSize: 15, color: hot ? HOT : CALM, outlineColor: Color.WHITE, outlineWidth: 2 },
        label: {
          text: s.pending ? `${s.name}  •  ${s.pending} pending` : s.name,
          font: '600 13px Inter, sans-serif', pixelOffset: new Cartesian2(0, -24),
          fillColor: Color.WHITE, showBackground: true, backgroundColor: Color.fromCssColorString('#020617cc'),
        },
      })
    }
  }, [sectors.data])

  // Fly to the selected sector's footprint.
  useEffect(() => {
    const viewer = viewerRef.current
    const s = sectors.data?.find((x) => x.id === selected)
    if (!viewer) return
    if (s?.bbox) viewer.camera.flyTo({ destination: Rectangle.fromDegrees(...s.bbox), duration: 1.6 })
    else viewer.camera.flyTo({ destination: INDIA_VIEW, duration: 1.4 })
  }, [selected, sectors.data])

  const sel = sectors.data?.find((s) => s.id === selected)

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />

      {/* left rail: sectors */}
      <div className="absolute left-4 top-4 z-10 w-64 overflow-hidden rounded-lg border border-white/15 bg-[#020617]/85 text-white shadow-xl backdrop-blur">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="font-mono text-[11px] uppercase tracking-wider text-white/50">Command · sectors</div>
          <div className="text-[15px] font-semibold">Coastal watch</div>
        </div>
        {!sectors.data ? <div className="p-4"><Spinner /></div> : (
          <ul className="max-h-[60vh] overflow-auto">
            {sectors.data.map((s) => (
              <li key={s.id}>
                <button onClick={() => setSelected(s.id)}
                  className={cn('flex w-full items-center justify-between gap-2 border-l-2 px-4 py-2.5 text-left transition-colors hover:bg-white/5',
                    selected === s.id ? 'border-accent bg-white/10' : 'border-transparent')}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="block font-mono text-[11px] text-white/50">{s.region ?? '—'} · {s.vessels_now} ships</span>
                  </span>
                  {s.pending > 0
                    ? <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 font-mono text-[11px] font-semibold">{s.pending}</span>
                    : <span className="shrink-0 font-mono text-[11px] text-white/40">clear</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* right panel: selected sector queue */}
      {sel && (
        <div className="absolute right-4 top-4 z-10 flex max-h-[calc(100%-2rem)] w-[360px] flex-col overflow-hidden rounded-lg border border-white/15 bg-[#020617]/90 text-white shadow-xl backdrop-blur">
          <div className="flex items-start justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-white/50">{sel.region ?? 'Sector'}</div>
              <div className="text-[15px] font-semibold">{sel.name}</div>
            </div>
            <button onClick={() => setSelected(null)} className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white" title="Back to national view"><ArrowLeft className="size-4" /></button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {!detail.data ? <Spinner /> : (
              <>
                <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-white/50">Detections to review</div>
                {detail.data.detections.length === 0 ? (
                  <div className="rounded-md border border-white/10 px-3 py-2 text-sm text-white/60">Sector clear — nothing awaiting review.</div>
                ) : (
                  <ul className="space-y-2">
                    {detail.data.detections.map((d) => (
                      <li key={d.id}>
                        <button
                          onClick={() => navigate(d.sample_id ? `/app/detect?sample=${d.sample_id}` : '/app/detect')}
                          className="flex w-full items-center gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-left hover:border-accent/60 hover:bg-white/10">
                          <span className={cn('grid size-8 shrink-0 place-items-center rounded', d.has_spill ? 'bg-crit/20 text-crit' : 'bg-white/10 text-white/60')}>
                            {d.has_spill ? <AlertTriangle className="size-4" /> : <Waves className="size-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 text-sm font-medium">
                              {d.has_spill ? 'Possible slick' : 'Clean tile'}
                              {d.verified ? <span className="font-mono text-[10px] uppercase text-ok">reviewed</span> : <span className="font-mono text-[10px] uppercase text-accent">pending</span>}
                            </span>
                            <span className="block truncate font-mono text-[11px] text-white/50">{d.scene ?? d.id}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-mono text-sm tnum">{Math.round(d.confidence * 100)}%</span>
                            {d.has_spill && <span className="block font-mono text-[11px] text-white/50">{fmtKm2(d.area_km2)}</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mb-2 mt-4 font-mono text-[11px] uppercase tracking-wider text-white/50">Incidents in sector</div>
                {detail.data.incidents.length === 0 ? (
                  <div className="text-sm text-white/50">No incidents opened here yet.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.data.incidents.map((i) => (
                      <li key={i.id}>
                        <Link to={`/app/incidents/${i.id}`} className="flex items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-2 hover:border-accent/60 hover:bg-white/5">
                          <span className="font-mono text-xs text-sea">{i.code}</span>
                          <span className="flex items-center gap-2">{i.top_tier && <TierChip tier={i.top_tier} compact />}<StatusChip status={i.status} /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <Link to="/app/detect" className="flex items-center justify-center gap-2 border-t border-white/10 px-4 py-2.5 text-sm font-medium text-accent hover:bg-white/5">
            <ScanSearch className="size-4" />Open detection console
          </Link>
        </div>
      )}

      {/* idle hint */}
      {!sel && sectors.data && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/15 bg-[#020617]/80 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-white/60 backdrop-blur">
          Select a sector to zoom in and review its detections
        </div>
      )}
      {sectors.isError && <div className="absolute inset-x-0 top-4 z-10 mx-auto w-fit"><Empty title="Could not load sectors" /></div>}
    </div>
  )
}
