import type { ReactNode } from 'react'
import {
  type TooltipContentProps,
  type TooltipValueType,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CardioWeek } from '../../lib/cardio'
import { formatDate, km, volumeNumber } from '../../lib/format'
import { twd, type PaymentMonth } from '../../lib/revenue'
import type { ExercisePoint, WeekBucket } from '../../lib/stats'
import { SERIES_1, SERIES_2, SIGNUP_SERIES } from './chartColors'

const GRID = 'var(--color-grid)'
const AXIS = 'var(--color-axis)'
const SURFACE = 'var(--color-surface)'

const axisProps = {
  tick: { fill: AXIS, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--color-line-strong)' },
} as const

function TooltipBox({ title, rows }: { title: string; rows: { color?: string; label: string; value: ReactNode }[] }) {
  return (
    <div className="min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg shadow-black/5">
      <p className="mb-1 font-medium text-ink-800">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-ink-600">
          {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
          <span className="flex-1">{r.label}</span>
          <span className="tabular font-medium text-ink-900">{r.value}</span>
        </p>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: i.color, height: 3 }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

const kgTick = (v: number) => `${v}`
const volTick = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : `${v}`)

/** Adapts a row renderer to Recharts' tooltip `content` prop. */
function tip<T>(render: (row: T) => ReactNode) {
  return function TooltipContent({ active, payload }: TooltipContentProps<TooltipValueType, string | number>) {
    const row = payload?.[0]?.payload as T | undefined
    return active && row ? render(row) : null
  }
}

/** Most reps in one set, session by session; the springs used ride along in the tooltip. */
export function ExerciseProgressChart({ points }: { points: ExercisePoint[] }) {
  const rows = points.map((p) => ({ ...p, label: formatDate(p.date) }))
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} axisLine={false} tickFormatter={kgTick} domain={['auto', 'auto']} allowDecimals={false} width={48} unit="" />
          <Tooltip
            cursor={{ stroke: 'var(--color-line-strong)', strokeWidth: 1 }}
            content={tip<(typeof rows)[number]>((r) => (
              <TooltipBox
                title={formatDate(r.date, { year: true, weekday: true })}
                rows={[
                  { color: SERIES_1, label: '最多次數', value: `${r.topReps} 下` },
                  ...(r.springs ? [{ label: '彈簧', value: r.springs }] : []),
                ]}
              />
            ))}
          />
          <Line
            type="monotone"
            dataKey="topReps"
            name="最多次數"
            stroke={SERIES_1}
            strokeWidth={2}
            dot={{ r: 3, fill: SERIES_1, stroke: SURFACE, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: SERIES_1, stroke: SURFACE, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const twdTick = (v: number) => (v >= 10000 ? `${Math.round(v / 1000) / 10}萬` : `${v}`)

/** A year of payments, one bar a month. Choosing a bar opens that month. */
export function PaymentChart({ months, onSelect }: { months: PaymentMonth[]; onSelect: (month: number) => void }) {
  const rows = months.map((m) => ({ ...m, label: `${m.month + 1}月` }))
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval={0} />
          <YAxis {...axisProps} axisLine={false} allowDecimals={false} tickFormatter={twdTick} width={48} />
          <Tooltip
            cursor={{ fill: 'var(--color-hover)' }}
            content={tip<(typeof rows)[number]>((r) => (
              <TooltipBox
                title={`${r.month + 1} 月`}
                rows={[
                  { color: SERIES_1, label: '繳費金額', value: twd(r.total) },
                  { label: '筆數', value: `${r.payments.length} 筆` },
                ]}
              />
            ))}
          />
          <Bar
            dataKey="total"
            fill={SERIES_1}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
            className="cursor-pointer"
            onClick={(bar) => onSelect((bar.payload as (typeof rows)[number]).month)}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function WeeklyVolumeChart({ buckets }: { buckets: WeekBucket[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axisProps} minTickGap={12} />
          <YAxis {...axisProps} axisLine={false} tickFormatter={volTick} width={48} />
          <Tooltip
            cursor={{ fill: 'var(--color-hover)' }}
            content={tip<WeekBucket>((r) => (
                <TooltipBox
                  title={`${r.label} 當週`}
                  rows={[{ color: SERIES_1, label: '總次數', value: `${volumeNumber(r.volume)} 下` }]}
                />
            ))}
          />
          <Bar dataKey="volume" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function WeeklyCardioChart({ weeks }: { weeks: CardioWeek[] }) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axisProps} minTickGap={12} />
          <YAxis {...axisProps} axisLine={false} allowDecimals={false} width={48} />
          <Tooltip
            cursor={{ fill: 'var(--color-hover)' }}
            content={tip<CardioWeek>((r) => (
              <TooltipBox
                title={`${r.label} 當週`}
                rows={[
                  { color: SERIES_2, label: '有氧', value: `${r.minutes} 分鐘` },
                  ...(r.km ? [{ label: '距離', value: km(r.km) }] : []),
                ]}
              />
            ))}
          />
          <Bar dataKey="minutes" fill={SERIES_2} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** `byType` splits each week into coached vs independent; off for self-trackers, who only log their own. */
export function FrequencyChart({ buckets, byType = true }: { buckets: WeekBucket[]; byType?: boolean }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axisProps} minTickGap={12} />
          <YAxis {...axisProps} axisLine={false} allowDecimals={false} width={48} />
          <Tooltip
            cursor={{ fill: 'var(--color-hover)' }}
            content={tip<WeekBucket>((r) => (
                <TooltipBox
                  title={`${r.label} 當週`}
                  rows={
                    byType
                      ? [
                          { color: SERIES_1, label: '私人課', value: `${r.coached} 次` },
                          { color: SERIES_2, label: '自主練習', value: `${r.independent} 次` },
                        ]
                      : [{ color: SERIES_2, label: '練習', value: `${r.coached + r.independent} 次` }]
                  }
                />
            ))}
          />
          <Bar dataKey="coached" stackId="f" fill={SERIES_1} stroke={SURFACE} strokeWidth={2} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="independent" stackId="f" fill={SERIES_2} stroke={SURFACE} strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BodyweightChart({ points }: { points: { date: string; value: number }[] }) {
  const rows = points.map((p) => ({ ...p, label: formatDate(p.date) }))
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} axisLine={false} domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]} allowDecimals={false} width={48} />
          <Tooltip
            cursor={{ stroke: 'var(--color-line-strong)', strokeWidth: 1 }}
            content={tip<(typeof rows)[number]>((r) => (
                <TooltipBox title={formatDate(r.date, { year: true })} rows={[{ color: SERIES_1, label: '體重', value: `${r.value} kg` }]} />
            ))}
          />
          <Line type="monotone" dataKey="value" stroke={SERIES_1} strokeWidth={2} dot={false} activeDot={{ r: 5, fill: SERIES_1, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface SignupBucket {
  label: string
  /** Tooltip title, e.g. "10/28" or "10/26 當週". */
  title: string
  studio: number
  solo: number
  self: number
}

/** New sign-ups per day or week, stacked by account type. */
export function SignupChart({ buckets }: { buckets: SignupBucket[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axisProps} minTickGap={12} />
          <YAxis {...axisProps} axisLine={false} allowDecimals={false} width={48} />
          <Tooltip
            cursor={{ fill: 'var(--color-hover)' }}
            content={tip<SignupBucket>((r) => (
              <TooltipBox
                title={r.title}
                rows={[
                  ...SIGNUP_SERIES.map((x) => ({ color: x.color, label: x.label, value: `${r[x.key]} 人` })),
                  { label: '合計', value: `${r.studio + r.solo + r.self} 人` },
                ]}
              />
            ))}
          />
          {SIGNUP_SERIES.map((x, i) => (
            <Bar
              key={x.key}
              dataKey={x.key}
              stackId="s"
              fill={x.color}
              stroke={SURFACE}
              strokeWidth={2}
              radius={i === SIGNUP_SERIES.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={24}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
