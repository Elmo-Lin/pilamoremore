import { History } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Segmented, ToolbarSelect } from '../../components/ui/Form'
import { Card, EmptyState, PageHeader, Tabs } from '../../components/ui/Primitives'
import { DraftsCard } from '../../components/workout/DraftsCard'
import { WorkoutDetailModal, WorkoutRow } from '../../components/workout/WorkoutDetail'
import { addDays, duration, formatDate } from '../../lib/format'
import { cardioSets, describeCardio, isCardio } from '../../lib/cardio'
import { completedSets, describeSet, exerciseSeries, workoutDate } from '../../lib/stats'
import { useData } from '../../store/contexts'
import { selectCompleted, useCurrentStudent, useExerciseMap } from '../../store/selectors'
import type { ID, WorkoutSession } from '../../types'

type TypeFilter = 'all' | 'coached' | 'independent'
type DateFilter = '30' | '90' | 'all'

export function StudentHistoryPage() {
  const { data } = useData()
  const student = useCurrentStudent()!
  const [view, setView] = useState<'workouts' | 'exercises'>('workouts')
  const [type, setType] = useState<TypeFilter>('all')
  const [range, setRange] = useState<DateFilter>('90')
  const [open, setOpen] = useState<WorkoutSession | null>(null)

  const all = useMemo(() => selectCompleted(data, student.id), [data, student.id])
  const since = range === 'all' ? '' : addDays(new Date(), -Number(range)).toISOString()
  const list = all.filter((w) => (type === 'all' || w.type === type) && workoutDate(w) >= since)

  // Group by month for scanning.
  const groups = useMemo(() => {
    const m = new Map<string, WorkoutSession[]>()
    for (const w of list) {
      const d = new Date(workoutDate(w))
      const key = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
      m.set(key, [...(m.get(key) ?? []), w])
    }
    return [...m.entries()]
  }, [list])

  return (
    <div>
      <PageHeader
        title="上課紀錄"
        description={`共 ${all.length} 次練習・私人課 ${all.filter((w) => w.type === 'coached').length} 次・自主練習 ${all.filter((w) => w.type === 'independent').length} 次`}
      />
      <DraftsCard studentId={student.id} createdBy="student" loggerPath="/student/workouts/new" className="mb-4" />
      <Tabs
        value={view}
        onChange={setView}
        tabs={[
          { value: 'workouts', label: '依練習' },
          { value: 'exercises', label: '依動作' },
        ]}
      />
      <div className="mt-4">
        {view === 'workouts' ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Segmented
                label="類型"
                value={type}
                onChange={setType}
                options={[
                  { value: 'all', label: '全部' },
                  { value: 'coached', label: '私人課' },
                  { value: 'independent', label: '自主練習' },
                ]}
              />
              <Segmented
                label="期間"
                value={range}
                onChange={setRange}
                options={[
                  { value: '30', label: '30 天' },
                  { value: '90', label: '90 天' },
                  { value: 'all', label: '全部' },
                ]}
              />
            </div>
            {groups.length ? (
              <div className="space-y-4">
                {groups.map(([month, ws]) => (
                  <div key={month}>
                    <p className="mb-2 text-xs font-medium text-ink-500">
                      {month}・{ws.length} 次
                    </p>
                    <Card className="divide-y divide-line overflow-hidden">
                      {ws.map((w) => (
                        <WorkoutRow key={w.id} workout={w} onOpen={() => setOpen(w)} />
                      ))}
                    </Card>
                  </div>
                ))}
              </div>
            ) : (
              <Card>
                <EmptyState icon={History} title="沒有符合的紀錄" description="調整類型或期間篩選試試看。" />
              </Card>
            )}
          </>
        ) : (
          <ExerciseHistory workouts={all} />
        )}
      </div>
      <WorkoutDetailModal workout={open} onClose={() => setOpen(null)} audience="student" />
    </div>
  )
}

function ExerciseHistory({ workouts }: { workouts: WorkoutSession[] }) {
  const exMap = useExerciseMap()
  const options = useMemo(() => {
    const counts = new Map<ID, number>()
    for (const w of workouts) for (const e of w.exercises) counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [workouts])
  const [picked, setPicked] = useState<ID>('')
  const exerciseId = picked || options[0]?.[0] || ''
  const series = useMemo(() => exerciseSeries(workouts, exerciseId).reverse(), [workouts, exerciseId])
  const cardio = isCardio(exMap.get(exerciseId))
  // Cardio: each workout's bouts, newest first (workouts come newest first).
  const bouts = useMemo(
    () =>
      cardio
        ? workouts
            .map((w) => ({ w, sets: w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => cardioSets(e.sets)) }))
            .filter((x) => x.sets.length)
        : [],
    [cardio, workouts, exerciseId],
  )

  if (!options.length) return <Card><EmptyState icon={History} title="還沒有動作紀錄" /></Card>

  return (
    <div>
      <div className="mb-4">
        <ToolbarSelect label="選擇動作" value={exerciseId} onChange={(e) => setPicked(e.target.value)} className="h-10">
          {options.map(([id, n]) => (
            <option key={id} value={id}>
              {exMap.get(id)?.name}（{n} 次）
            </option>
          ))}
        </ToolbarSelect>
      </div>
      {cardio ? (
        <Card className="divide-y divide-line overflow-hidden">
          {bouts.map(({ w, sets }) => (
            <div key={w.id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink-900">
                  {formatDate(workoutDate(w), { year: true, weekday: true })}
                  <span className="ml-2 text-xs font-normal text-ink-500">{w.title}</span>
                </p>
                <p className="tabular text-sm text-ink-700">{duration(sets.reduce((n, x) => n + (x.durationSec ?? 0), 0))}</p>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {sets.map((x) => (
                  <span key={x.id} className="tabular rounded-md bg-subtle px-2 py-0.5 text-xs text-ink-700">
                    {describeCardio(exerciseId, x)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Card>
      ) : (
      <Card className="divide-y divide-line overflow-hidden">
        {series.map((p) => {
          const w = workouts.find((x) => x.id === p.workoutId)!
          const sets = w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => completedSets(e.sets))
          return (
            <div key={p.workoutId} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink-900">
                  {formatDate(p.date, { year: true, weekday: true })}
                  <span className="ml-2 text-xs font-normal text-ink-500">
                    {w.title}・{w.type === 'coached' ? '私人課' : '自主練習'}
                  </span>
                </p>
                <p className="tabular text-sm text-ink-700">最多 {p.topReps} 下</p>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {sets.map((s) => (
                  <span key={s.id} className="tabular rounded-md bg-subtle px-2 py-0.5 text-xs text-ink-700">
                    {describeSet(s)}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </Card>
      )}
    </div>
  )
}
