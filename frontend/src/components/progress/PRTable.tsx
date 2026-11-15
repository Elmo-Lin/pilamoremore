import { Trophy } from 'lucide-react'
import { formatDate } from '../../lib/format'
import type { PersonalRecord } from '../../lib/stats'
import { useExerciseMap } from '../../store/selectors'
import { SpringDots } from '../workout/SpringDots'
import { EmptyState } from '../ui/Primitives'

/** Each move's record: most reps in one set, the springs last used, and how often it was practised. */
export function PRTable({ prs }: { prs: PersonalRecord[] }) {
  const exMap = useExerciseMap()
  if (!prs.length) return <EmptyState compact icon={Trophy} title="尚無動作紀錄" />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-105 text-sm">
        <thead className="border-y border-line bg-subtle/60 text-left text-xs text-ink-500">
          <tr>
            <th className="px-5 py-2 font-medium">動作</th>
            <th className="px-3 py-2 text-right font-medium">最多次數</th>
            <th className="px-3 py-2 font-medium">上次彈簧</th>
            <th className="px-5 py-2 text-right font-medium">上次練習</th>
          </tr>
        </thead>
        <tbody className="tabular divide-y divide-line">
          {prs.map((pr) => (
            <tr key={pr.exerciseId}>
              <td className="px-5 py-2.5 font-medium text-ink-900">
                {exMap.get(pr.exerciseId)?.name}
                <span className="ml-1.5 text-xs font-normal text-ink-400">{pr.sessions} 次</span>
              </td>
              <td className="px-3 py-2.5 text-right text-ink-900">{pr.maxReps} 下</td>
              <td className="px-3 py-2.5 text-ink-700">
                {pr.lastSprings ? (
                  <span className="inline-flex items-center gap-1.5">
                    <SpringDots setting={pr.lastSprings} />
                    {pr.lastSprings}
                  </span>
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </td>
              <td className="px-5 py-2.5 text-right text-ink-500">{formatDate(pr.lastDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
