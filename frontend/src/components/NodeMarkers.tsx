import L from 'leaflet'
import { Marker, Popup, Tooltip } from 'react-leaflet'
import { useNow } from '../hooks/useNow'
import { useMapStore } from '../store'
import {
  classifyLink,
  formatLastSeen,
  LINK_STATE_LABEL,
  type LinkState,
} from '../staleness'
import type { NodeInfo } from '../types'

// A node that is still reporting keeps Leaflet's default teardrop; the stale
// states get a flat glyph that reads at a glance in daylight — amber warning
// for a link going intermittent, grey for one that has gone silent entirely.
function staleIcon(state: 'degraded' | 'lost', tone: string) {
  return L.divIcon({
    className: `node-marker node-marker--${state}`,
    html: `<div class="flex h-7 w-7 items-center justify-center rounded-full ${tone} text-sm shadow">&#9888;</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })
}

const STALE_ICONS: Record<'degraded' | 'lost', L.DivIcon> = {
  degraded: staleIcon('degraded', 'bg-amber-400 text-black'),
  lost: staleIcon('lost', 'bg-slate-400 text-slate-900 opacity-80'),
}

const TOOLTIP_CLASS: Record<'degraded' | 'lost', string> = {
  degraded: 'bg-amber-400 text-black font-semibold',
  lost: 'bg-slate-300 text-slate-900 font-semibold',
}

function NodeMarker({ node, now }: { node: NodeInfo; now: number }) {
  const state: LinkState = classifyLink(node.recentCaptures, now)
  const newest = node.recentCaptures[0]
  const lastSeen =
    newest === undefined ? 'no data received' : formatLastSeen(now - newest)

  return (
    <Marker
      position={[node.latitude, node.longitude]}
      icon={state === 'live' ? undefined : STALE_ICONS[state]}
    >
      {state !== 'live' && (
        <Tooltip
          permanent
          direction="top"
          offset={[0, -16]}
          className={TOOLTIP_CLASS[state]}
        >
          {node.nodeName} — last seen {lastSeen}
        </Tooltip>
      )}
      <Popup>
        <strong>{node.nodeName}</strong>
        <br />
        {LINK_STATE_LABEL[state]} — last seen {lastSeen}
        <br />
        Alt: {node.altitude.toFixed(0)} m
        <br />
        {new Date(node.capturedAt).toLocaleTimeString()}
      </Popup>
    </Marker>
  )
}

/** UAV position overlay, styled by how fresh each node's telemetry is. */
export default function NodeMarkers() {
  const nodes = useMapStore((s) => s.nodes)
  const now = useNow()

  return (
    <>
      {Object.values(nodes).map((node) => (
        <NodeMarker key={node.nodeId} node={node} now={now} />
      ))}
    </>
  )
}
