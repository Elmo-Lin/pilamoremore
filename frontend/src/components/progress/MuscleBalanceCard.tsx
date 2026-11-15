import { Lightbulb } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MUSCLE_LABEL } from '../../lib/format'
import { muscleBalance } from '../../lib/insights'
import { useExerciseMap } from '../../store/selectors'
import type { WorkoutSession } from '../../types'
import { Card, CardHeader } from '../ui/Primitives'

/** Sets per muscle group this week, and what looks out of balance lately. */
export function MuscleBalanceCard({ workouts, audience }: { workouts: WorkoutSession[]; audience: 'coach' | 'student' }) {
  const exMap = useExerciseMap()
  const [now] = useState(() => Date.now())
  const { week, notes } = useMemo(() => muscleBalance(workouts, exMap, now), [workouts, exMap, now])
  if (!week.length) return null
  const max = Math.max(...week.map((w) => w.sets), 1)

  return (
    <Card>
      <CardHeader title="肌群平衡" description="近 7 天各部位完成的組數" />
      <div className="px-5 pb-5">
        <ul className="space-y-2">
          {week.map(({ group, sets }) => (
            <li key={group} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 text-sm">
              <span className="text-ink-700">{MUSCLE_LABEL[group]}</span>
              <span className="h-2 overflow-hidden rounded-full bg-subtle" aria-hidden>
                <span className="block h-full rounded-full bg-accent-600" style={{ width: `${(sets / max) * 100}%` }} />
              </span>
              <span className={`tabular text-right ${sets ? 'text-ink-900' : 'text-ink-400'}`}>{sets} 組</span>
            </li>
          ))}
        </ul>
        {notes.length > 0 && (
          <ul className="mt-4 space-y-2">
            {notes.map((n) => (
              <li key={n} className="flex gap-2 rounded-lg bg-canvas px-3 py-2.5 text-[13px] text-ink-700">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-warn-600" />
                {n}
              </li>
            ))}
          </ul>
        )}
        {!notes.length && (
          <p className="mt-4 text-[13px] text-ink-500">{audience === 'coach' ? '各部位的安排目前很平均。' : '各部位練得很平均，繼續保持！'}</p>
        )}
      </div>
    </Card>
  )
}
