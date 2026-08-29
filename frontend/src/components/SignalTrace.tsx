import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  formatClockTime,
  rssiDomain,
  type SignalPoint,
  type SignalSeries,
} from '../signalHistory'

const AXIS_COLOR = '#94a3b8'
const GRID_COLOR = '#334155'

interface Props {
  points: SignalPoint[]
  /** Every series, so the dBm axis holds still as lines are toggled. */
  series: SignalSeries[]
  visible: SignalSeries[]
}

/**
 * The RSSI trace itself. It is a module of its own so the charting library
 * loads only once the operator opens the panel — the coverage map is the
 * primary display and must not wait on a chart nobody has asked for.
 */
export default function SignalTrace({ points, series, visible }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={points}
        margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
      >
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={formatClockTime}
          stroke={AXIS_COLOR}
          fontSize={11}
        />
        <YAxis
          domain={rssiDomain(points, series)}
          stroke={AXIS_COLOR}
          fontSize={11}
          width={52}
          label={{
            value: 'dBm',
            angle: -90,
            position: 'insideLeft',
            fill: AXIS_COLOR,
            fontSize: 11,
          }}
        />
        <Tooltip
          labelFormatter={(label: unknown) =>
            typeof label === 'number' ? formatClockTime(label) : ''
          }
          formatter={(value: unknown) =>
            typeof value === 'number' ? `${value} dBm` : '—'
          }
          contentStyle={{
            backgroundColor: '#0f172a',
            border: `1px solid ${GRID_COLOR}`,
            fontSize: 12,
          }}
          itemStyle={{ color: '#e2e8f0' }}
          labelStyle={{ color: AXIS_COLOR }}
        />
        {visible.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            // A silent link is a gap in the trace, not a straight line
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
