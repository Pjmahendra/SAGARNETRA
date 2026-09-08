import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, CheckCircle2, HelpCircle, Play, Upload } from 'lucide-react'
import { api, ApiError, assetUrl, MOCK_MODE } from '../lib/api'
import { fmtCoord, fmtKm2, fmtUtc } from '../lib/format'
import type { DetectResult, DetectSample, LookalikeReason, VerifyDecision } from '../lib/types'
import { Button, Empty, EngineBadge, ErrorNote, PageHeader, Panel, Spinner } from '../components/Primitives'
import { useUi } from '../store/ui'
import { DUR, EASE_OUT } from '../lib/motion'

const CLASS_COLORS: Record<string, string> = { sea: '#1e6b74', oil: '#c7301f', lookalike: '#ae3a02', ship: '#ff6803', land: '#928c83' }
const REASONS: { value: LookalikeReason; label: string }[] = [
  { value: 'wind_shadow', label: 'Wind shadow / calm water' },
  { value: 'algal_bloom', label: 'Algal bloom' },
  { value: 'rain_cell', label: 'Rain cell' },
  { value: 'low_wind', label: 'Low wind, whole scene dark' },
  { value: 'other', label: 'Other' },
]

/** Speckled stand-in drawn behind the tile image so the panel is never blank while the image loads. */
function SarCanvas({ seed }: { seed: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    const W = c.width, H = c.height
    let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
    const img = ctx.createImageData(W, H)
    for (let i = 0; i < W * H; i++) { const v = 60 + rnd() * 60; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255 }
    ctx.putImageData(img, 0, 0)
  }, [seed])
  return <canvas ref={ref} width={256} height={176} className="absolute inset-0 size-full" />
}

type Source = { kind: 'sample'; sample: DetectSample } | { kind: 'upload'; file: File; url: string; bbox: [number, number, number, number] | null }

export default function DetectionConsole() {
  const navigate = useNavigate()
  const { zoneId } = useUi()
  const still = useReducedMotion()
  const [params] = useSearchParams()  // deep link from the command view: ?sample=<id> preselects that tile
  const samples = useQuery({ queryKey: ['detect', 'samples'], queryFn: api.detectSamples })
  const model = useQuery({ queryKey: ['detect', 'model'], queryFn: api.modelInfo })
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.overview })
  const zoneName = overview.data?.zones.find((z) => z.id === zoneId)?.name ?? 'this region'
  const [sampleId, setSampleId] = useState<string | null>(() => params.get('sample'))
  const [upload, setUpload] = useState<Extract<Source, { kind: 'upload' }> | null>(null)
  const [result, setResult] = useState<DetectResult | null>(null)
  const [opacity, setOpacity] = useState(0.8)
  const [decision, setDecision] = useState<VerifyDecision | null>(null)
  const [reason, setReason] = useState<LookalikeReason>('wind_shadow')

  // Tiles for the region chosen in the top bar. An officer reviews their own sector's scenes;
  // switching region switches the queue rather than scrolling past everyone else's water.
  const zoneTiles = useMemo(
    () => (samples.data ?? []).filter((s) => !s.zone_id || s.zone_id === zoneId),
    [samples.data, zoneId],
  )
  // A deep link (?sample=) wins even when it belongs to another region, so a link from the
  // dashboard never lands on an empty console.
  const linked = samples.data?.find((s) => s.id === sampleId) ?? null
  const sample = linked ?? zoneTiles[0] ?? null
  const source: Source | null = upload ?? (sample ? { kind: 'sample', sample } : null)
  const bbox = source?.kind === 'sample' ? source.sample.bbox : source?.bbox ?? null

  const reset = () => { setResult(null); setDecision(null) }
  const run = useMutation({
    mutationFn: (src: Source) => src.kind === 'sample' ? api.detectSample(src.sample.id) : api.detectUpload(src.file, src.bbox ?? undefined),
    onMutate: reset,
    onSuccess: setResult,
  })
  const verify = useMutation({
    mutationFn: ({ id, d, r }: { id: string; d: VerifyDecision; r?: LookalikeReason }) => api.verifyDetection(id, d, r),
    onSuccess: (_data, vars) => setDecision(vars.d),
  })
  const create = useMutation({
    mutationFn: (detectionId: string) => api.createIncident(detectionId),
    onSuccess: (inc) => void navigate(`/app/incidents/${inc.id}`),
  })

  const onFile = (f: File | null) => {
    if (!f) return
    if (upload) URL.revokeObjectURL(upload.url)
    const isTiff = /\.tiff?$/i.test(f.name)
    setUpload({ kind: 'upload', file: f, url: URL.createObjectURL(f), bbox: isTiff ? null : sample?.bbox ?? null })
    reset()
  }

  const hasSpill = !!result && (result.has_spill ?? result.polygon.length > 2)
  const toPct = ([lon, lat]: [number, number]) => bbox ? [((lon - bbox[0]) / (bbox[2] - bbox[0])) * 100, ((bbox[3] - lat) / (bbox[3] - bbox[1])) * 100] : [0, 0]
  const polyPoints = result?.polygon.map((p) => toPct(p).map((v) => v.toFixed(2)).join(',')).join(' ')
  const totalPx = result ? Object.values(result.class_pixels).reduce((a, b) => a + b, 0) : 0
  const lookalikeShare = result ? (result.class_pixels.lookalike ?? 0) / Math.max(1, (result.class_pixels.oil ?? 0) + (result.class_pixels.lookalike ?? 0)) : 0
  const imageSrc = source?.kind === 'upload' ? source.url : source ? assetUrl(source.sample.image_url) : ''
  const title = source?.kind === 'upload' ? source.file.name : source?.sample.label ?? 'Tile'

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 p-6 xl:grid-cols-[260px_1fr_340px]">
      <div className="xl:col-span-3">
        <PageHeader eyebrow="Computer vision" title="Detection Console"
          description="Run the segmentation model on a Sentinel-1 tile, read the evidence, then decide: confirm as an oil spill, dismiss as a look-alike, or mark uncertain." />
      </div>

      <div className="flex min-h-0 flex-col gap-4">
        <Panel title="Tiles" bodyClassName="p-2">
          {!samples.data ? <Spinner /> : (
            <ul className="space-y-1">
              {zoneTiles.length === 0 && (
                <li className="rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">
                  No tiles for {zoneName}. Satellite coverage is bundled per sector; switch region in the top bar,
                  or upload a tile below.
                </li>
              )}
              {zoneTiles.map((s) => (
                <li key={s.id}>
                  <button onClick={() => { setSampleId(s.id); setUpload(null); reset() }} disabled={s.available === false}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-40 ${!upload && sample?.id === s.id ? 'border-accent/60 bg-surface-2' : 'border-line'}`}>
                    <div className="flex items-center justify-between gap-2"><span className="font-semibold">{s.label}</span>
                      {s.synthetic && <span className="rounded border border-warn/40 px-1 font-mono text-[9px] uppercase text-warn" title="Synthetic placeholder tile, not satellite imagery">synthetic</span>}</div>
                    <div className="font-mono text-[11px] text-ink-3">{s.scene}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className={`mt-3 block rounded-md border border-dashed p-3 text-center text-xs ${MOCK_MODE ? 'border-line text-ink-3' : 'cursor-pointer border-line text-ink-2 hover:border-ink-3'} ${upload ? 'border-accent/60' : ''}`}>
            <Upload className="mx-auto mb-1 size-4" />
            {upload ? upload.file.name : 'Upload a GeoTIFF or PNG tile'}
            <div className="mt-1 text-[11px] text-ink-3">{MOCK_MODE ? 'Available once the API is connected' : 'GeoTIFF carries its own georeference. PNG uses the selected tile’s footprint.'}</div>
            <input type="file" accept=".png,.jpg,.jpeg,.tif,.tiff,image/png,image/jpeg,image/tiff" className="hidden" disabled={MOCK_MODE} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </label>
        </Panel>

        <Panel title="Models · 5-way bake-off" bodyClassName="p-3">
          {!model.data ? <Spinner /> : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <EngineBadge engine={model.data.engine} />
                <span className="text-[11px] text-ink-3">{model.data.engine === 'unet' ? `serving ${model.data.model_name}` : 'heuristic fallback active'}</span>
              </div>
              <table className="w-full text-[11px]">
                <thead><tr className="text-left font-mono uppercase text-ink-3"><th className="pb-1">Model</th><th className="pb-1 text-right">mIoU</th><th className="pb-1 text-right">Oil</th><th className="pb-1 text-right">Look-alike</th></tr></thead>
                <tbody>
                  {model.data.metrics.map((m) => {
                    const served = m.name === model.data!.model_name
                    const trained = typeof m.miou === 'number'
                    return (
                      <tr key={m.name} className={served ? 'font-semibold text-ink' : 'text-ink-2'}>
                        <td className="py-0.5">{served ? '▶ ' : ''}{m.display ?? m.name}</td>
                        {trained ? (
                          <>
                            <td className="py-0.5 text-right font-mono tnum">{(m.miou! * 100).toFixed(1)}</td>
                            <td className="py-0.5 text-right font-mono tnum">{((m.iou?.oil ?? 0) * 100).toFixed(0)}</td>
                            <td className="py-0.5 text-right font-mono tnum">{((m.iou?.lookalike ?? 0) * 100).toFixed(0)}</td>
                          </>
                        ) : (
                          <td colSpan={3} className="py-0.5 text-right font-mono text-ink-3">pending training</td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {model.data.engine === 'heuristic' && (
                <p className="text-[11px] text-ink-3">Trained ONNX weights not on this server yet — per-model IoU fills in after the Colab bake-off; the heuristic answers meanwhile.</p>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Panel title={title} bodyClassName="p-0"
        actions={source && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-3">mask
              <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="w-24 accent-accent" />
            </label>
            <Button onClick={() => run.mutate(source)} disabled={run.isPending}><Play className="size-4" />{run.isPending ? 'Running…' : 'Run model'}</Button>
          </div>
        )}>
        {!source ? <div className="p-4"><Empty title="Pick a tile" /></div> : (
          <div className="relative aspect-[512/352] w-full overflow-hidden bg-black">
            <SarCanvas seed={title} />
            {/* The tile settles in rather than snapping: switching scenes is a change of subject,
                and the scale is small enough that the framing never visibly moves. Keyed on the
                source so it replays per tile. */}
            <motion.img
              key={imageSrc} src={imageSrc} alt=""
              className="absolute inset-0 size-full object-fill"
              initial={still ? false : { opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: DUR.slow, ease: EASE_OUT }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <AnimatePresence>
              {result && (result.mask_png || hasSpill) && (
                <motion.div key={result.detection_id} initial={{ opacity: 0 }} animate={{ opacity }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className="absolute inset-0">
                  {result.mask_png ? (
                    <img src={`data:image/png;base64,${result.mask_png}`} alt="segmentation mask" className="absolute inset-0 size-full object-fill" style={{ imageRendering: 'pixelated' }} />
                  ) : (
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
                      <polygon points={polyPoints} fill={CLASS_COLORS.oil} fillOpacity={0.55} stroke="#fff" strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
                    </svg>
                  )}
                  {hasSpill && (
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
                      <polygon points={polyPoints} fill="none" stroke="#fff" strokeWidth={0.35} vectorEffect="non-scaling-stroke" />
                    </svg>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {run.isPending && <div className="absolute inset-0 grid place-items-center bg-bg/40 backdrop-blur-[1px]"><Spinner label="Segmenting tile" /></div>}
            <div className="absolute left-3 top-3 font-mono text-[11px] text-ink-2 drop-shadow">
              {source.kind === 'sample' ? `${source.sample.scene} · ${fmtUtc(source.sample.acquired_at)}` : `uploaded · ${(source.file.size / 1024).toFixed(0)} KB`}
            </div>
            <div className="absolute bottom-3 left-3 flex gap-3 font-mono text-[11px] text-ink-2 drop-shadow">
              {Object.entries(CLASS_COLORS).filter(([k]) => k !== 'sea').map(([k, c]) => <span key={k} className="inline-flex items-center gap-1"><span className="size-2 rounded-sm" style={{ background: c }} />{k}</span>)}
            </div>
            {source.kind === 'sample' && source.sample.synthetic && <div className="absolute right-3 top-3 rounded border border-warn/50 bg-bg/70 px-1.5 py-0.5 font-mono text-[10px] uppercase text-warn">synthetic placeholder</div>}
          </div>
        )}
      </Panel>

      <Panel title="Result">
        {run.error && <ErrorNote message={run.error instanceof ApiError ? run.error.message : 'Detection failed'} />}
        {!result && !run.error && <Empty title="No result yet" hint="Run the model on the selected tile." />}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><EngineBadge engine={result.engine} /><span className="font-mono text-xs text-ink-3">{result.inference_ms} ms{result.model_name ? ` · ${result.model_name}` : ''}</span></div>
            {!hasSpill ? (
              <div className="rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">No oil-spill pixels above threshold. Clean tile.</div>
            ) : (
              <dl className="grid grid-cols-2 gap-3">
                <div><dt className="label-caps">Area</dt><dd className="font-display text-2xl font-semibold tnum">{fmtKm2(result.area_km2)}</dd></div>
                <div><dt className="label-caps">Confidence</dt><dd className="font-display text-2xl font-semibold tnum">{Math.round(result.confidence * 100)}%</dd></div>
                <div className="col-span-2"><dt className="label-caps">Centroid</dt><dd className="font-mono text-sm">{fmtCoord(result.centroid)}</dd></div>
                <div><dt className="label-caps">Long axis</dt><dd className="font-mono text-sm">{String(Math.round(result.heading_deg)).padStart(3, '0')}°</dd></div>
                <div><dt className="label-caps">Length : width</dt><dd className="font-mono text-sm">{result.elongation ? `${result.elongation.toFixed(1)} : 1` : '—'}</dd></div>
              </dl>
            )}

            <div>
              <div className="label-caps mb-1.5">Class pixels</div>
              <div className="flex h-2 overflow-hidden rounded-sm bg-surface-3">
                {Object.entries(result.class_pixels).map(([k, n]) => <span key={k} style={{ width: `${(n / totalPx) * 100}%`, background: CLASS_COLORS[k] ?? '#928c83' }} title={`${k}: ${n}`} />)}
              </div>
              <ul className="mt-1.5 grid grid-cols-2 gap-x-3 font-mono text-[11px] text-ink-2">
                {Object.entries(result.class_pixels).map(([k, n]) => <li key={k} className="flex justify-between"><span>{k}</span><span className="tnum">{((n / totalPx) * 100).toFixed(1)}%</span></li>)}
              </ul>
            </div>

            {hasSpill && (
              <div>
                <div className="label-caps mb-1.5">Signals</div>
                <ul className="space-y-1 text-xs">
                  <li className={result.elongation && result.elongation >= 4 ? 'text-ink' : 'text-ink-2'}>{result.elongation && result.elongation >= 4 ? 'Streak-shaped (≥ 4:1): consistent with a moving discharge.' : 'Compact shape: less typical of a discharge trail.'}</li>
                  <li className={lookalikeShare > 0.4 ? 'text-warn' : 'text-ink-2'}>{lookalikeShare > 0.4 ? `Look-alike pixels are ${Math.round(lookalikeShare * 100)}% of the dark area. Treat with caution.` : 'Look-alike share is low.'}</li>
                  <li className="text-ink-3">Wind at acquisition, previous pass and nearby AIS traffic arrive with the drift and AIS services.</li>
                </ul>
              </div>
            )}
            {result.engine === 'heuristic' && <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">Model unavailable. Classic dark-spot heuristic answered; treat the polygon as a lead only.</div>}

            {hasSpill && (
              <div className="border-t border-line pt-3">
                <div className="label-caps mb-2">Officer decision</div>
                {decision ? (
                  <div className={`rounded-md border px-3 py-2 text-sm ${decision === 'confirmed' ? 'border-ok/40 bg-ok/10 text-ok' : decision === 'lookalike' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-line text-ink-2'}`}>
                    {decision === 'confirmed' ? 'Confirmed as oil spill. Recorded as a training label.' : decision === 'lookalike' ? `Dismissed as look-alike (${REASONS.find((r) => r.value === reason)?.label}). Recorded as a training label.` : 'Marked uncertain. Queued for a second opinion.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Button className="w-full" disabled={verify.isPending} onClick={() => verify.mutate({ id: result.detection_id, d: 'confirmed' })}><CheckCircle2 className="size-4" />Confirm as oil spill</Button>
                    <div className="flex gap-2">
                      <select value={reason} onChange={(e) => setReason(e.target.value as LookalikeReason)} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-xs">
                        {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <Button variant="ghost" disabled={verify.isPending} onClick={() => verify.mutate({ id: result.detection_id, d: 'lookalike', r: reason })}><AlertTriangle className="size-4" />Dismiss</Button>
                    </div>
                    <Button variant="ghost" className="w-full" disabled={verify.isPending} onClick={() => verify.mutate({ id: result.detection_id, d: 'uncertain' })}><HelpCircle className="size-4" />Mark uncertain</Button>
                  </div>
                )}
                {verify.error && <div className="mt-2"><ErrorNote message={verify.error instanceof ApiError ? verify.error.message : 'Could not save decision'} /></div>}
                {decision === 'confirmed' && (
                  <Button className="mt-3 w-full" onClick={() => create.mutate(result.detection_id)} disabled={create.isPending}>{create.isPending ? 'Creating incident…' : 'Create incident'}</Button>
                )}
                {create.error && <div className="mt-2"><ErrorNote message={create.error instanceof ApiError ? create.error.message : 'Could not create incident'} /></div>}
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}
