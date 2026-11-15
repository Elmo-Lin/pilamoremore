import { CalendarDays, ChevronRight, ClipboardList, Dumbbell, Flame, Ticket, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ReminderPrompt } from '../../components/layout/NotificationSettings'
import { ButtonLink } from '../../components/ui/Button'
import { BalanceMeter, Card, CardHeader, DemoNotice, EmptyState, PageHeader } from '../../components/ui/Primitives'
import { WorkoutDetailModal, WorkoutRow } from '../../components/workout/WorkoutDetail'
import { addDays, formatDate, formatTime, givenName, relativeDay } from '../../lib/format'
import { LOW_BALANCE_THRESHOLD } from '../../lib/sessions'
import { recentPRs, weekStreak, workoutDate } from '../../lib/stats'
import { useData } from '../../store/contexts'
import { selectBalance, selectCompleted, selectDrafts, selectNextAppointment, useCurrentStudent, useExerciseMap } from '../../store/selectors'
import type { WorkoutSession } from '../../types'

export function StudentDashboardPage() {
  const { data } = useData()
  const student = useCurrentStudent()!
  const exMap = useExerciseMap()
  const [open, setOpen] = useState<WorkoutSession | null>(null)

  const workouts = useMemo(() => selectCompleted(data, student.id), [data, student.id])
  const balance = selectBalance(data, student.id)
  const next = selectNextAppointment(data, student.id)
  const lastClass = workouts.find((w) => w.type === 'coached')
  const prs = useMemo(() => recentPRs(workouts, addDays(new Date(), -28).toISOString()).slice(0, 3), [workouts])
  const streak = useMemo(() => weekStreak(workouts), [workouts])
  const now = new Date()
  const thisMonth = workouts.filter((w) => {
    const d = new Date(workoutDate(w))
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const draft = selectDrafts(data, student.id, 'student')[0]
  const current = balance.packages.find((b) => b.remaining > 0) ?? balance.packages.at(-1)

  return (
    <div>
      <PageHeader
        title={`嗨，${givenName(student.name)}`}
        description={workouts[0] ? `上次練習是${relativeDay(workoutDate(workouts[0]))}，這個月已完成 ${thisMonth} 次練習。` : '歡迎！完成第一次練習後，這裡會顯示你的進度。'}
        actions={
          <ButtonLink to="/student/workouts/new" icon={Dumbbell} variant="accent">
            記錄自主練習
          </ButtonLink>
        }
      />

      <ReminderPrompt />

      {draft && (
        <Link
          to={`/student/workouts/new?draft=${draft.id}`}
          className="mb-4 flex items-center gap-3 rounded-lg border border-line border-l-2 border-l-warn-600 bg-surface px-4 py-2.5 text-sm text-ink-700 hover:bg-raised"
        >
          <Dumbbell className="size-4 shrink-0 text-warn-600" />
          <span className="flex-1">你有一筆未完成的自主練習：{draft.title}</span>
          <span className="font-medium text-ink-900">繼續</span>
        </Link>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between text-[13px] text-ink-500">
            下次私人課
            <CalendarDays className="size-4 text-ink-300" />
          </div>
          {next ? (
            <>
              <p className="mt-2 text-xl font-semibold text-ink-900">
                {relativeDay(next.startAt)} {formatTime(next.startAt)}
              </p>
              <p className="mt-1 text-xs text-ink-500">
                {formatDate(next.startAt, { weekday: true })}・{next.location}・{next.durationMin} 分鐘
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-500">目前沒有排定的課程</p>
          )}
          <Link to="/student/plan" className="mt-3 inline-block text-xs font-medium text-accent-700 hover:underline">
            查看課表
          </Link>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between text-[13px] text-ink-500">
            剩餘私人課
            <Ticket className="size-4 text-ink-300" />
          </div>
          <p className={`num mt-2 text-[28px] ${balance.remaining <= LOW_BALANCE_THRESHOLD ? 'text-warn-600' : 'text-ink-900'}`}>
            {balance.remaining}
            <span className="ml-1 text-sm font-normal text-ink-500">堂</span>
          </p>
          {current && (
            <div className="mt-3">
              <BalanceMeter remaining={current.remaining} total={current.total + Math.max(0, current.adjusted)} />
            </div>
          )}
          <p className="mt-2 text-xs text-ink-500">自主練習不會扣除堂數{balance.remaining <= LOW_BALANCE_THRESHOLD ? '・堂數不多了，可與老師討論續約' : ''}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between text-[13px] text-ink-500">
            連續練習
            <Flame className="size-4 text-ink-300" />
          </div>
          <p className="num mt-2 text-[28px] text-ink-900">
            {streak}
            <span className="ml-1 text-sm font-normal text-ink-500">週</span>
          </p>
          <p className="mt-2 text-xs text-ink-500">每週至少完成一次練習即算一週・目標每週 {student.weeklyFrequency} 次</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardHeader title="上一堂課" description={lastClass ? `${relativeDay(workoutDate(lastClass))}・${lastClass.title}` : undefined} />
            {lastClass ? (
              <div className="px-5 pb-5">
                <div className="rounded-xl bg-canvas p-4">
                  <p className="text-xs text-ink-500">做了哪些動作</p>
                  <p className="mt-1 text-[15px] text-ink-900">{lastClass.exercises.map((e) => exMap.get(e.exerciseId)?.name).filter(Boolean).join('、')}</p>
                  {lastClass.notes && (
                    <>
                      <p className="mt-3 text-xs text-ink-500">老師的話</p>
                      <p className="mt-1 text-[13px] text-ink-700">{lastClass.notes}</p>
                    </>
                  )}
                  <button type="button" onClick={() => setOpen(lastClass)} className="mt-3 text-xs font-medium text-accent-700 hover:underline">
                    查看完整紀錄
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState compact icon={ClipboardList} title="還沒有上課紀錄" description="上完第一堂課後，老師的紀錄會顯示在這裡。" />
            )}
          </Card>

        <Card>
          <CardHeader title="近期進步" description="近 4 週做到新的最多次數" />
          {prs.length ? (
            <ul className="space-y-2 px-5 pb-5">
              {prs.map((p) => (
                <li key={p.exerciseId} className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-2.5">
                  <Trophy className="size-4 shrink-0 text-accent-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900">{exMap.get(p.exerciseId)?.name}</p>
                    <p className="text-xs text-ink-500">
                      {formatDate(p.date)}・先前最多 {p.previous} 下{p.springs ? `・彈簧 ${p.springs}` : ''}
                    </p>
                  </div>
                  <p className="tabular text-sm font-semibold text-ink-900">
                    {p.reps} 下
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={Trophy} title="近 4 週沒有新紀錄" description="持續穩定練習，進步會慢慢累積。" />
          )}
          <Link to="/student/progress" className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-ink-700 hover:bg-subtle/60">
            查看進步追蹤
            <ChevronRight className="size-4 text-ink-400" />
          </Link>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="最近上課"
          action={
            <Link to="/student/history" className="text-xs font-medium text-accent-700 hover:underline">
              全部紀錄
            </Link>
          }
        />
        {workouts.length ? (
          <div className="divide-y divide-line border-t border-line">
            {workouts.slice(0, 4).map((w) => (
              <WorkoutRow key={w.id} workout={w} onOpen={() => setOpen(w)} />
            ))}
          </div>
        ) : (
          <EmptyState compact icon={Dumbbell} title="還沒有上課紀錄" />
        )}
      </Card>
      <DemoNotice className="mt-6" />
      <WorkoutDetailModal workout={open} onClose={() => setOpen(null)} audience="student" />
    </div>
  )
}
