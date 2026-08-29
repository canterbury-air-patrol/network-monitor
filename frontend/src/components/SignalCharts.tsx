import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useState } from 'react'
import {
  fetchGroundStations,
  fetchNodeSnapshots,
  fetchNodes,
  fetchRadios,
} from '../api/signals'
import { buildSignalHistory, type SignalSeries } from '../signalHistory'

// The charting library is a large dependency and the panel opens closed, so it
// is fetched on first expansion rather than with the map.
const SignalTrace = lazy(() => import('./SignalTrace'))

/** Live telemetry keeps arriving, so the trace follows it without a reload. */
const REFETCH_MS = 15_000

function Message({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="flex h-full items-center justify-center text-sm text-white/60"
      data-testid="signal-charts-message"
    >
      {children}
    </p>
  )
}

interface LegendProps {
  series: SignalSeries[]
  hidden: ReadonlySet<string>
  onToggle: (key: string) => void
}

/**
 * The legend is real DOM rather than the chart's own SVG legend: it doubles as
 * the series filter, and a link the operator wants to isolate has to be
 * reachable with a gloved finger.
 */
function SeriesLegend({ series, hidden, onToggle }: LegendProps) {
  return (
    <div className="flex flex-wrap gap-1 px-3 pb-2" data-testid="signal-legend">
      {series.map((s) => {
        const visible = !hidden.has(s.key)
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onToggle(s.key)}
            aria-pressed={visible}
            className={`flex min-h-11 items-center gap-2 rounded px-2 text-xs ${
              visible ? 'text-white' : 'text-white/40'
            } hover:bg-white/10`}
          >
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: visible ? s.color : 'transparent',
                border: `2px solid ${s.color}`,
              }}
            />
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Signal strength history for one node: RSSI against capture time, one line
 * per radio/band/receiver link.
 *
 * The panel is collapsed by default and fetches nothing until it is opened —
 * the coverage map is the primary display, and the charts must not cost it
 * screen space or bandwidth until the operator asks for them.
 */
export default function SignalCharts() {
  const [expanded, setExpanded] = useState(false)
  const [pickedNodeId, setPickedNodeId] = useState<number | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())

  const nodesQuery = useQuery({
    queryKey: ['nodes'],
    queryFn: ({ signal }) => fetchNodes(signal),
    enabled: expanded,
  })
  const nodes = useMemo(() => nodesQuery.data ?? [], [nodesQuery.data])

  // The picked node is validated against the list so a node that disappears
  // between polls falls back to whatever is still reporting.
  const nodeId =
    nodes.find((n) => n.id === pickedNodeId)?.id ?? nodes[0]?.id ?? null

  const snapshotsQuery = useQuery({
    queryKey: ['node-snapshots', nodeId],
    queryFn: ({ signal }) => fetchNodeSnapshots(nodeId as number, signal),
    enabled: expanded && nodeId !== null,
    refetchInterval: REFETCH_MS,
  })

  const radiosQuery = useQuery({
    queryKey: ['radios', nodeId],
    queryFn: ({ signal }) => fetchRadios(nodeId as number, signal),
    enabled: expanded && nodeId !== null,
  })

  const stationsQuery = useQuery({
    queryKey: ['stations'],
    queryFn: ({ signal }) => fetchGroundStations(signal),
    enabled: expanded,
  })

  const { series, points } = useMemo(
    () =>
      buildSignalHistory(snapshotsQuery.data ?? [], {
        radios: radiosQuery.data,
        stations: stationsQuery.data,
        nodes,
      }),
    [snapshotsQuery.data, radiosQuery.data, stationsQuery.data, nodes],
  )

  const visible = useMemo(
    () => series.filter((s) => !hidden.has(s.key)),
    [series, hidden],
  )

  const toggleSeries = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })

  // Labels resolve from the radio and station lists, so a failure there only
  // degrades the legend; the trace itself needs the snapshots alone.
  const error = nodesQuery.error ?? snapshotsQuery.error

  function body() {
    if (error) {
      return (
        <Message>
          <span role="alert">Signal history unavailable — {error.message}</span>
        </Message>
      )
    }
    if (nodesQuery.isPending) return <Message>Loading nodes…</Message>
    if (nodeId === null) return <Message>No nodes reporting yet.</Message>
    if (snapshotsQuery.isPending)
      return <Message>Loading signal history…</Message>
    if (series.length === 0) {
      return <Message>No radio readings recorded for this node yet.</Message>
    }
    return (
      <>
        <div className="min-h-0 flex-1" data-testid="signal-chart">
          <Suspense fallback={<Message>Loading chart…</Message>}>
            <SignalTrace points={points} series={series} visible={visible} />
          </Suspense>
        </div>
        <SeriesLegend series={series} hidden={hidden} onToggle={toggleSeries} />
      </>
    )
  }

  return (
    <section
      className={`bg-surface flex shrink-0 flex-col border-t border-white/10 text-white ${
        expanded ? 'h-72' : ''
      }`}
      data-testid="signal-charts"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((on) => !on)}
          aria-expanded={expanded}
          data-testid="signal-charts-toggle"
          className="flex min-h-11 items-center gap-2 rounded px-2 text-sm font-semibold hover:bg-white/10"
        >
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          Signal history
        </button>
        {expanded && nodes.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-white/70">
            Node
            <select
              value={nodeId ?? ''}
              onChange={(e) => setPickedNodeId(Number(e.target.value))}
              data-testid="signal-node-select"
              className="min-h-11 rounded border border-white/20 bg-white/5 px-2 text-sm text-white"
            >
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {expanded && body()}
    </section>
  )
}
