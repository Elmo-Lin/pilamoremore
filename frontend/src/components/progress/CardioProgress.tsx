import { HeartPulse } from 'lucide-react'
import { useMemo } from 'react'
import { cardioRecords, cardioTotals, cardioWeekly } from '../../lib/cardio'
import { duration, formatDate, km } from '../../lib/format'
import { useExerciseMap } from '../../store/selectors'
import type { WorkoutSession } from '../../types'
import { Card, CardHeader } from '../ui/Primitives'
import { WeeklyCardioChart } from './Charts'

/** "5'48\"/km" from seconds per km. */
const paceText = (secPerKm: number) => {
  const s = Math.round(secPerKm)
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"/km`
}

/**
 * Cardio over the chosen range: how often, how long and how far, minutes per week, and each
 * exercise's longest, farthest and (on foot) fastest bout ever. Shown only once there is cardio.
 */
export function CardioProgress({ all, inRange, weeks }: { all: WorkoutSession[]; inRange: WorkoutSession[]; weeks: number }) {
  const exMap = useExerciseMap()
  const totals = useMemo(() => cardioTotals(inRange), [inRange])
  const weekly = useMemo(() => cardioWeekly(inRange, Math.min(weeks, 26)), [inRange, weeks])
  const records = useMemo(() => cardioRecords(all), [all])
  if (!records.length) return null

  return (
    <Card>
      <CardHeader title="有氧" description="此範圍內完成的有氧，以及每項有氧的最佳紀錄" />
      <div className="grid grid-cols-3 gap-2 px-5">
        {[
          ['次數', `${totals.sessions} 次`],
          ['總時間', totals.sec ? duration(totals.sec) : '—'],
          ['總距離', totals.km ? km(totals.km) : '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-canvas px-3 py-2.5">
            <p className="text-xs text-ink-500">{label}</p>
            <p className="tabular mt-0.5 text-[17px] font-semibold text-ink-900">{value}</p>
          </div>
        ))}
      </div>
      <p className="px-5 pt-4 text-xs text-ink-500">每週有氧分鐘數</p>
      <div className="px-3 pb-2">
        <WeeklyCardioChart weeks={weekly} />
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {records.map((r) => (
          <li key={r.exerciseId} className="flex items-start gap-3 px-5 py-3">
            <HeartPulse className="mt-0.5 size-4 shrink-0 text-alt-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-900">
                {exMap.get(r.exerciseId)?.name ?? '未知動作'}
                <span className="ml-2 text-xs font-normal text-ink-500">共 {r.bouts} 次</span>
              </p>
              <p className="tabular mt-0.5 text-xs text-ink-600">
                最長 {duration(r.longestSec)}（{formatDate(r.longestSecDate)}）
                {r.farthestKm != null && `・最遠 ${km(r.farthestKm)}（${formatDate(r.farthestKmDate!)}）`}
                {r.bestPaceSec != null && `・最快配速 ${paceText(r.bestPaceSec)}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
