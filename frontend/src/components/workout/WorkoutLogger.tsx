import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarPlus,
  Check,
  CircleCheck,
  Clock,
  CopyPlus,
  Dumbbell,
  FilePlus2,
  Link2,
  Link2Off,
  Pencil,
  Plus,
  Save,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { durationMin, formatDate, formatTime, isSameDay, relativeDay, toDateInput } from '../../lib/format'
import { uid } from '../../lib/id'
import { LOW_BALANCE_THRESHOLD } from '../../lib/sessions'
import { isCardio } from '../../lib/cardio'
import { lastExerciseLog, workoutDate } from '../../lib/stats'
import { breakSuperset, canMoveBlock, canMoveItem, moveBlock, moveItem, newSupersetId, normalizeSupersets, supersetSlots, type SupersetSlot } from '../../lib/superset'
import { useData, useToast } from '../../store/contexts'
import { selectBalance, selectCompleted, selectDrafts, selectStudent, useExerciseMap } from '../../store/selectors'
import type { AppData, Appointment, ExerciseLog, ID, Role, WorkoutSession } from '../../types'
import { Button, IconButton } from '../ui/Button'
import { SelectInput, TextArea, TextInput } from '../ui/Form'
import { ConfirmDialog, Modal } from '../ui/Modal'
import { Avatar, Badge, Card, EmptyState } from '../ui/Primitives'
import { DeductSessionDialog } from './DeductSessionDialog'
import { DeleteDraftButton } from './DraftsCard'
import { CardioCard, type CardioSuggestion } from './CardioCard'
import { ExerciseCard, type SetSuggestion } from './ExerciseCard'
import { ExercisePicker } from './ExercisePicker'

/** e.g. "10/24 上課": the default name of a session. */
const defaultTitle = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} 課程`

function emptyWorkout(studentId: ID, mode: Role, coachId: ID): WorkoutSession {
  const today = new Date()
  const now = today.toISOString()
  return {
    id: uid('wo'),
    studentId,
    coachId: mode === 'coach' ? coachId : undefined,
    type: mode === 'coach' ? 'coached' : 'independent',
    createdBy: mode,
    status: 'draft',
    // Today's date by default.
    title: defaultTitle(today),
    startedAt: now,
    updatedAt: now,
    exercises: [],
    notes: '',
  }
}

function copyLogs(logs: ExerciseLog[]): ExerciseLog[] {
  return logs.map((l) => ({
    id: uid('el'),
    exerciseId: l.exerciseId,
    supersetId: l.supersetId,
    sets: l.sets
      .filter((s) => s.completed)
      .map((s) => ({ id: uid('set'), springs: s.springs ?? null, weightKg: null, reps: s.reps, rpe: null, completed: false, durationSec: s.durationSec, distanceKm: s.distanceKm })),
  }))
}

/** The cards in order, each superset's cards held together in one tinted box under its own header. */
function groupSupersets(
  logs: ExerciseLog[],
  card: (log: ExerciseLog, i: number) => ReactNode,
  groupActions: (slot: SupersetSlot, start: number) => ReactNode,
): ReactNode[] {
  const slots = supersetSlots(logs)
  const out: ReactNode[] = []
  for (let i = 0; i < logs.length; ) {
    const slot = slots[i]
    if (!slot) {
      out.push(card(logs[i], i))
      i++
      continue
    }
    const start = i
    out.push(
      <div key={`ss_${logs[start].id}`} className="space-y-2 rounded-2xl bg-accent-50 p-2">
        <div className="flex items-center gap-1.5 pl-2">
          <Link2 className="size-3.5 shrink-0 text-accent-700" />
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-accent-800">
            超級組 {slot.letter}
            <span className="hidden font-normal text-accent-700 sm:inline">・交替完成，每輪做完再休息</span>
          </p>
          {groupActions(slot, start)}
        </div>
        {logs.slice(start, start + slot.size).map((log, j) => card(log, start + j))}
      </div>,
    )
    i += slot.size
  }
  return out
}

const DAY_MS = 86_400_000

interface OpenClass {
  appt: Appointment
  /** Already being logged. */
  draft?: WorkoutSession
}

/** Classes a coached session can be logged for: still scheduled, from the past two weeks to tomorrow, nearest first. */
function openClasses(d: AppData, studentId: ID, now: Date): OpenClass[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const from = today.getTime() - 14 * DAY_MS
  const to = today.getTime() + 2 * DAY_MS
  const at = (a: Appointment) => new Date(a.startAt).getTime()
  return d.appointments
    .filter((a) => a.studentId === studentId && a.status === 'scheduled' && at(a) >= from && at(a) < to)
    .filter((a) => !d.workouts.some((w) => w.appointmentId === a.id && w.status === 'completed'))
    .map((a) => ({ appt: a, draft: d.workouts.find((w) => w.appointmentId === a.id && w.status === 'draft') }))
    .sort((x, y) => Math.abs(at(x.appt) - now.getTime()) - Math.abs(at(y.appt) - now.getTime()))
}

/** Ties a new workout to its class; a class from an earlier day is logged on that day. */
function forClass(w: WorkoutSession, a: Appointment): WorkoutSession {
  const today = new Date()
  if (isSameDay(a.startAt, today) || new Date(a.startAt) > today) return { ...w, appointmentId: a.id }
  return { ...w, appointmentId: a.id, startedAt: a.startAt, title: w.title === defaultTitle(today) ? defaultTitle(new Date(a.startAt)) : w.title }
}

/** Where an unscheduled class probably took place: the student's last class, else the coach's. */
function lastLocation(d: AppData, studentId: ID) {
  const recent = [...d.appointments].sort((a, b) => b.startAt.localeCompare(a.startAt))
  return (recent.find((a) => a.studentId === studentId) ?? recent[0])?.location || '未指定地點'
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function WorkoutLogger({ mode, fixedStudentId }: { mode: 'coach' | 'student'; fixedStudentId?: ID }) {
  const { data, actions } = useData()
  const notify = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const exMap = useExerciseMap()

  const [studentId, setStudentId] = useState<ID>(() => {
    if (fixedStudentId) return fixedStudentId
    const fromDraft = data.workouts.find((w) => w.id === params.get('draft') || w.id === params.get('edit'))?.studentId
    return fromDraft ?? params.get('student') ?? ''
  })

  /** Editing a finished workout (?edit=): same screen, saved back as it was finished — same day, no deduction prompt. */
  const [editingId] = useState(() => {
    const done = data.workouts.find((w) => w.id === params.get('edit') && w.status === 'completed')
    return done && (!fixedStudentId || done.studentId === fixedStudentId) ? done.id : null
  })

  const [workout, setWorkout] = useState<WorkoutSession | null>(() => {
    const done = data.workouts.find((w) => w.id === editingId)
    if (done) return structuredClone(done)
    const draft = data.workouts.find((w) => w.id === params.get('draft') && w.status === 'draft')
    if (draft && (!fixedStudentId || draft.studentId === fixedStudentId)) return structuredClone(draft)
    return null
  })

  const [lastSaved, setLastSaved] = useState<string | null>(null)
  /** A new workout held back because the student already has one in progress (likely a duplicate). */
  const [pendingStart, setPendingStart] = useState<{ fresh: WorkoutSession; draft: WorkoutSession } | null>(null)
  /** Coaches: the class this session is for; null = today's nearest, 'adhoc' = an unscheduled class. */
  const [chosenClass, setChosenClass] = useState<ID | 'adhoc' | null>(() => params.get('appointment'))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState<number | null>(null)
  // Set by hand (logging afterwards, or fixing the time): how long it took; null = until it's finished.
  const [customMinutes, setCustomMinutes] = useState<number | null>(null)
  const [editingTime, setEditingTime] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [removeIdx, setRemoveIdx] = useState<number | null>(null)
  const [deductWorkout, setDeductWorkout] = useState<WorkoutSession | null>(null)
  const now = useNow(30000)

  // Autosave drafts so an interrupted session can be resumed.
  useEffect(() => {
    if (!workout || workout.status !== 'draft' || !workout.exercises.length) return
    const t = setTimeout(() => {
      const res = actions.saveWorkout(workout)
      if (res.ok) setLastSaved(res.value.updatedAt)
    }, 700)
    return () => clearTimeout(t)
  }, [workout, actions])

  const student = selectStudent(data, workout?.studentId ?? studentId)
  const editing = !!workout && workout.id === editingId
  const balance = student ? selectBalance(data, student.id) : null

  // Coached sessions are logged for a scheduled class, so one class can't end up logged twice.
  const classes = mode === 'coach' && student && !workout ? openClasses(data, student.id, new Date(now)) : []
  const todaysClass = classes.find((c) => isSameDay(c.appt.startAt, new Date(now)))
  const selectedClass: OpenClass | 'adhoc' | undefined =
    chosenClass === 'adhoc' || (mode === 'coach' && student && !classes.length)
      ? 'adhoc'
      : classes.find((c) => c.appt.id === (chosenClass ?? todaysClass?.appt.id))
  const workoutClass = data.appointments.find((a) => a.id === workout?.appointmentId)

  const lastByExercise = useMemo(() => {
    const m = new Map<ID, { log: ExerciseLog; date: string }>()
    if (!workout) return m
    for (const e of workout.exercises) {
      if (m.has(e.exerciseId)) continue
      const hit = lastExerciseLog(data.workouts, workout.studentId, e.exerciseId, workout.id)
      if (hit) m.set(e.exerciseId, { log: hit.log, date: workoutDate(hit.workout) })
    }
    return m
  }, [data.workouts, workout])

  const suggestionsFor = (log: ExerciseLog): SetSuggestion[] => {
    const lastSets = lastByExercise.get(log.exerciseId)?.log.sets.filter((s) => s.completed) ?? []
    return log.sets.map((_, i) => {
      const ls = lastSets[i] ?? lastSets[lastSets.length - 1]
      return { springs: ls?.springs ?? null, reps: ls?.reps ?? null }
    })
  }

  /** Cardio: last time's first bout. */
  const cardioSuggestionFor = (log: ExerciseLog): CardioSuggestion => {
    const bout = lastByExercise.get(log.exerciseId)?.log.sets.find((s) => s.completed && s.durationSec)
    if (bout) return { minutes: Math.round(bout.durationSec! / 6) / 10, km: bout.distanceKm ?? null }
    return { minutes: null, km: null }
  }

  const patch = (fn: (w: WorkoutSession) => WorkoutSession) => setWorkout((w) => (w ? fn(w) : w))
  const setLog = (i: number, log: ExerciseLog) => patch((w) => ({ ...w, exercises: w.exercises.map((e, j) => (j === i ? log : e)) }))
  const move = (i: number, dir: -1 | 1) => patch((w) => ({ ...w, exercises: moveItem(w.exercises, i, dir) }))
  const moveGroup = (i: number, dir: -1 | 1) => patch((w) => ({ ...w, exercises: moveBlock(w.exercises, i, dir) }))
  const breakGroup = (i: number) => patch((w) => ({ ...w, exercises: breakSuperset(w.exercises, i) }))
  const remove = (i: number) => {
    if (workout?.exercises[i]?.sets.some((s) => s.completed)) setRemoveIdx(i)
    else patch((w) => ({ ...w, exercises: normalizeSupersets(w.exercises.filter((_, j) => j !== i)) }))
  }
  const copyLast = (i: number) => {
    const log = workout?.exercises[i]
    const last = log && lastByExercise.get(log.exerciseId)
    if (!log || !last) return
    setLog(i, { ...log, sets: copyLogs([last.log])[0].sets })
    notify(isCardio(exMap.get(log.exerciseId)) ? '已帶入上次的時間與距離' : '已帶入上次的彈簧與次數', 'info')
  }

  const begin = (w: WorkoutSession) => {
    setPendingStart(null)
    setWorkout(w)
    setParams({}, { replace: true })
  }

  const start = (w: WorkoutSession) => {
    let next = w
    if (mode === 'coach') {
      if (!selectedClass) return notify('請先選擇是哪一堂課', 'error')
      if (selectedClass !== 'adhoc') next = forClass(w, selectedClass.appt)
    }
    // An unfinished workout outside any class (classes show their own) usually means logging the session twice: ask first.
    const draft = selectDrafts(data, w.studentId, mode).find((d) => !d.appointmentId)
    if (draft) setPendingStart({ fresh: next, draft })
    else begin(next)
  }

  const lastWorkout = student ? selectCompleted(data, student.id)[0] : undefined

  const totalSets = workout?.exercises.reduce((n, e) => n + e.sets.length, 0) ?? 0
  const doneSets = workout?.exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0) ?? 0

  const saveDraft = () => {
    if (!workout) return
    const res = actions.saveWorkout({ ...workout, status: 'draft' })
    if (!res.ok) return notify(res.error, 'error')
    setLastSaved(res.value.updatedAt)
    notify('草稿已儲存，可隨時回來繼續')
    // Same place finishing goes; the draft waits at the top of that history list.
    navigate(mode === 'coach' ? `/coach/students/${workout.studentId}?tab=history` : '/student/history')
  }

  const requestFinish = () => {
    if (!workout) return
    if (!doneSets) return notify('請至少完成一組再結束練習（點選每組右側的勾勾）', 'error')
    if (doneSets < totalSets) setConfirmFinish(totalSets - doneSets)
    else finish()
  }

  /** Back to where this student's records are listed. */
  const backToHistory = (sid: ID) => navigate(mode === 'coach' ? `/coach/students/${sid}?tab=history` : '/student/history')

  const finish = () => {
    if (!workout) return
    setConfirmFinish(null)
    if (editing) {
      const res = actions.saveWorkout({
        ...workout,
        exercises: normalizeSupersets(workout.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.completed) })).filter((e) => e.sets.length)),
      })
      if (!res.ok) return notify(res.error, 'error')
      notify('紀錄已更新')
      return backToHistory(workout.studentId)
    }
    const nowISO = new Date().toISOString()
    // A time set by hand wins; else a class from an earlier day ends that day, not when the coach got round to logging it.
    const completedAt =
      customMinutes != null
        ? new Date(new Date(workout.startedAt).getTime() + customMinutes * 60_000).toISOString()
        : isSameDay(workout.startedAt, nowISO)
          ? nowISO
          : new Date(new Date(workout.startedAt).getTime() + (workoutClass?.durationMin ?? 60) * 60_000).toISOString()
    let appointmentId = workout.appointmentId
    if (mode === 'coach' && !appointmentId) {
      // An unscheduled class goes on the schedule, so every coached session has its class.
      const minutes = Math.min(240, Math.max(15, Math.round((durationMin(workout.startedAt, completedAt) ?? 0) / 15) * 15 || 60))
      const res = actions.saveAppointments([
        { id: uid('apt'), coachId: data.coach.id, studentId: workout.studentId, startAt: workout.startedAt, durationMin: minutes, location: lastLocation(data, workout.studentId), status: 'scheduled' },
      ])
      if (!res.ok) return notify(res.error, 'error')
      appointmentId = res.value[0].id
    }
    const completed: WorkoutSession = {
      ...workout,
      appointmentId,
      status: 'completed',
      completedAt,
      exercises: normalizeSupersets(workout.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.completed) })).filter((e) => e.sets.length)),
    }
    const res = actions.saveWorkout(completed)
    if (!res.ok) return notify(res.error, 'error')
    setWorkout(res.value)
    if (mode === 'coach') {
      setDeductWorkout(res.value)
    } else {
      notify('自主練習已儲存（不會扣除私人課堂數）')
      navigate('/student/history')
    }
  }

  const discard = () => {
    if (workout) actions.deleteWorkout(workout.id)
    setConfirmDiscard(false)
    setWorkout(null)
    setLastSaved(null)
    notify('已捨棄此次練習', 'info')
  }

  // ------------------------------------------------------------------ setup
  if (!workout) {
    const drafts = selectDrafts(data, fixedStudentId, mode)
    const activeStudents = data.students.filter((s) => s.status === 'active')
    return (
      <div className="space-y-5">
        {drafts.length > 0 && (
          <Card>
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-[15px] font-semibold text-ink-900">未完成的練習</h2>
              <p className="text-[13px] text-ink-500">練習中斷時會自動保存草稿，可從這裡繼續。</p>
            </div>
            <ul className="divide-y divide-line">
              {drafts.map((d) => {
                const s = selectStudent(data, d.studentId)
                const done = d.exercises.reduce((n, e) => n + e.sets.filter((x) => x.completed).length, 0)
                return (
                  <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                    {s && <Avatar name={s.name} id={s.id} size="sm" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {mode === 'coach' && s ? `${s.name}・` : ''}
                        {d.title}
                      </p>
                      <p className="text-xs text-ink-500">
                        {relativeDay(d.startedAt)} {formatTime(d.startedAt)} 開始・已完成 {done} 組
                      </p>
                    </div>
                    <DeleteDraftButton draft={d} />
                    <Button
                      size="sm"
                      onClick={() => {
                        setStudentId(d.studentId)
                        begin(structuredClone(d))
                      }}
                    >
                      繼續
                    </Button>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink-900">開始新的紀錄</h2>
          {mode === 'coach' && (
            <SelectInput
              label="學員"
              required
              containerClassName="mt-4"
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value)
                setChosenClass(null)
              }}
              className="h-12 md:h-10"
            >
              <option value="">選擇學員…</option>
              {activeStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          )}

          {mode === 'coach' && student && balance && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-canvas px-3 py-2.5 text-[13px] text-ink-600">
              <span>
                剩餘堂數 <strong className={`font-semibold ${balance.remaining <= LOW_BALANCE_THRESHOLD ? 'text-warn-600' : 'text-ink-900'}`}>{balance.remaining}</strong> 堂
              </span>
              {lastWorkout && <span>上次上課：{relativeDay(workoutDate(lastWorkout))}</span>}
            </div>
          )}

          {mode === 'coach' && student && (
            <div className="mt-5">
              <p className="mb-2 text-[13px] font-medium text-ink-700">哪一堂課</p>
              <div role="radiogroup" aria-label="哪一堂課" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {classes.map((c) => (
                  <ChoiceCard
                    key={c.appt.id}
                    picked={selectedClass !== 'adhoc' && selectedClass?.appt.id === c.appt.id}
                    onPick={() => setChosenClass(c.appt.id)}
                    icon={CalendarClock}
                    title={`${relativeDay(c.appt.startAt)} ${formatTime(c.appt.startAt)}`}
                    badge={c.draft && <Badge tone="accent">記錄中</Badge>}
                    sub={`${c.appt.durationMin} 分鐘・${c.appt.location}`}
                  />
                ))}
                <ChoiceCard
                  picked={selectedClass === 'adhoc'}
                  onPick={() => setChosenClass('adhoc')}
                  icon={CalendarPlus}
                  title="未排課（臨時加課）"
                  sub={classes.length ? '完成後自動加入課表' : '近期沒有排課・完成後自動加入課表'}
                />
              </div>
            </div>
          )}

          {!student ? (
            mode === 'coach' && <p className="mt-4 text-sm text-ink-500">選擇學員後，先選是哪一堂課，再從上次的課或空白開始。</p>
          ) : mode === 'coach' && !selectedClass ? (
            <p className="mt-4 text-sm text-ink-500">選擇是哪一堂課後，再從上次的課或空白開始。</p>
          ) : selectedClass && selectedClass !== 'adhoc' && selectedClass.draft ? (
            <div className="mt-5 flex flex-col gap-3 rounded-xl bg-accent-50 px-4 py-3.5 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-ink-700">
                這堂課已經開始記錄「{selectedClass.draft.title}」，已完成{' '}
                {selectedClass.draft.exercises.reduce((n, e) => n + e.sets.filter((x) => x.completed).length, 0)} 組。
              </p>
              <Button className="h-12 sm:h-10" onClick={() => selectedClass.draft && begin(structuredClone(selectedClass.draft))}>
                繼續記錄
              </Button>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {lastWorkout && (
                  <button
                    type="button"
                    onClick={() =>
                      start({
                        ...emptyWorkout(student.id, mode, data.coach.id),
                        title: lastWorkout.title,
                        exercises: copyLogs(lastWorkout.exercises),
                      })
                    }
                    className="flex items-center gap-3 rounded-xl border border-line px-4 py-3.5 text-left hover:bg-subtle"
                  >
                    <CopyPlus className="size-5 shrink-0 text-ink-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900">複製上次上課</p>
                      <p className="truncate text-xs text-ink-500">
                        {lastWorkout.title}・{formatDate(workoutDate(lastWorkout))}・帶入彈簧與次數
                      </p>
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => start(emptyWorkout(student.id, mode, data.coach.id))}
                  className="flex items-center gap-3 rounded-xl border border-line px-4 py-3.5 text-left hover:bg-subtle"
                >
                  <FilePlus2 className="size-5 shrink-0 text-ink-500" />
                  <div>
                    <p className="text-sm font-medium text-ink-900">空白開始</p>
                    <p className="text-xs text-ink-500">自行加入動作</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </Card>

        <Modal
          open={!!pendingStart}
          onClose={() => setPendingStart(null)}
          title="還有一筆未完成的練習"
          description={(() => {
            if (!pendingStart) return undefined
            const d = pendingStart.draft
            const who = mode === 'coach' ? `${selectStudent(data, d.studentId)?.name ?? ''}的` : ''
            const done = d.exercises.reduce((n, e) => n + e.sets.filter((x) => x.completed).length, 0)
            return `${who}「${d.title}」${relativeDay(d.startedAt)} ${formatTime(d.startedAt)} 開始，已完成 ${done} 組。如果是同一堂課，請繼續這筆，避免重複記錄。`
          })()}
          size="sm"
          footer={
            <>
              <Button variant="ghost" className="h-11 md:mr-auto md:h-10" onClick={() => pendingStart && begin(pendingStart.fresh)}>
                仍要開始新的
              </Button>
              <Button className="h-11 md:h-10" onClick={() => pendingStart && begin(structuredClone(pendingStart.draft))}>
                繼續未完成的
              </Button>
            </>
          }
        />
      </div>
    )
  }

  // ----------------------------------------------------------------- logger
  const elapsed = durationMin(workout.startedAt, new Date(Math.max(now, new Date(workout.startedAt).getTime())).toISOString())
  // A class's workout keeps the class's time (change the class on the schedule instead).
  const timeLocked = !!workout.appointmentId
  const savedMinutes = editing ? durationMin(workout.startedAt, workout.completedAt) : null
  const minutesNow = customMinutes ?? savedMinutes ?? (isSameDay(workout.startedAt, new Date(now)) && (elapsed ?? 0) >= 10 ? elapsed! : 60)
  const timeText = editing
    ? `${formatDate(workout.startedAt, { weekday: true })} ${formatTime(workout.startedAt)}・${savedMinutes ?? 0} 分鐘`
    : customMinutes != null
      ? `${relativeDay(workout.startedAt)} ${formatTime(workout.startedAt)} 開始・${customMinutes} 分鐘`
      : isSameDay(workout.startedAt, new Date(now))
        ? `${formatTime(workout.startedAt)} 開始・${elapsed ?? 0} 分鐘`
        : `補登 ${formatDate(workout.startedAt)} ${formatTime(workout.startedAt)} 的課`

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          {student && <Avatar name={student.name} id={student.id} />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-ink-500">{student?.name}</p>
              {workout.type === 'coached' ? <Badge tone="accent">私人課</Badge> : <Badge tone="alt">自主練習</Badge>}
            </div>
            <input
              value={workout.title}
              onChange={(e) => patch((w) => ({ ...w, title: e.target.value }))}
              aria-label="練習名稱"
              maxLength={40}
              className="mt-0.5 -ml-1 w-full rounded-md border border-transparent bg-transparent px-1 text-lg font-semibold text-ink-900 hover:border-line focus:border-accent-500 focus:outline-none"
            />
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
              {timeLocked ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {timeText}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingTime(true)}
                  aria-label={`修改日期與時間：${timeText}`}
                  className="-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-accent-700 hover:bg-accent-50"
                >
                  <Clock className="size-3.5" />
                  {timeText}
                  <Pencil className="size-3" />
                </button>
              )}
              {mode === 'coach' && balance && (
                <span className={balance.remaining <= LOW_BALANCE_THRESHOLD ? 'text-warn-600' : ''}>剩餘 {balance.remaining} 堂</span>
              )}
              {!editing && <span>{lastSaved ? `已自動儲存 ${formatTime(lastSaved)}` : '尚未儲存'}</span>}
            </p>
          </div>
        </div>
      </Card>

      {workout.exercises.length === 0 ? (
        <Card>
          <EmptyState
            icon={Dumbbell}
            title="還沒有動作"
            description="加入第一個動作開始記錄。"
            action={
              <Button icon={Plus} onClick={() => setPickerOpen(true)}>
                新增動作
              </Button>
            }
          />
        </Card>
      ) : (
        groupSupersets(
          workout.exercises,
          (log, i) => {
            const moves = { canMoveUp: canMoveItem(workout.exercises, i, -1), canMoveDown: canMoveItem(workout.exercises, i, 1) }
            return isCardio(exMap.get(log.exerciseId)) ? (
              <CardioCard
                key={log.id}
                log={log}
                index={i}
                exercise={exMap.get(log.exerciseId)}
                last={lastByExercise.get(log.exerciseId)}
                suggestion={cardioSuggestionFor(log)}
                {...moves}
                onChange={(l) => setLog(i, l)}
                onMove={(dir) => move(i, dir)}
                onRemove={() => remove(i)}
                onCopyLast={() => copyLast(i)}
                onNeedTime={() => notify('請先輸入時間', 'error')}
              />
            ) : (
              <ExerciseCard
                key={log.id}
                log={log}
                index={i}
                exercise={exMap.get(log.exerciseId)}
                last={lastByExercise.get(log.exerciseId)}
                suggestions={suggestionsFor(log)}
                {...moves}
                onChange={(l) => setLog(i, l)}
                onMove={(dir) => move(i, dir)}
                onRemove={() => remove(i)}
                onCopyLast={() => copyLast(i)}
                onNeedReps={() => notify('請先輸入次數', 'error')}
              />
            )
          },
          (slot, start) => (
            <>
              <IconButton icon={ArrowUp} label={`超級組 ${slot.letter} 上移`} size="sm" disabled={!canMoveBlock(workout.exercises, start, -1)} onClick={() => moveGroup(start, -1)} />
              <IconButton icon={ArrowDown} label={`超級組 ${slot.letter} 下移`} size="sm" disabled={!canMoveBlock(workout.exercises, start, 1)} onClick={() => moveGroup(start, 1)} />
              <IconButton icon={Link2Off} label={`解散超級組 ${slot.letter}`} size="sm" onClick={() => breakGroup(start)} />
            </>
          ),
        )
      )}

      {workout.exercises.length > 0 && (
        <Button variant="secondary" icon={Plus} className="h-12 w-full" onClick={() => setPickerOpen(true)}>
          新增動作
        </Button>
      )}

      <Card className="p-4 md:p-5">
        <TextArea
          label="練習備註"
          value={workout.notes}
          maxLength={500}
          onChange={(e) => patch((w) => ({ ...w, notes: e.target.value }))}
        />
        <button
          type="button"
          onClick={() => setConfirmDiscard(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-danger-600"
        >
          <Trash2 className="size-3.5" />
          {editing ? '放棄修改' : '捨棄此次練習'}
        </button>
      </Card>

      {/* Sticky action bar — always reachable with one thumb */}
      {/* Phones: the bar is fixed just above the tab bar (sticky moved with the page and iOS overscroll);
          the spacer keeps the last content clear of it. Desktop: sticky at the bottom of the column. */}
      <div aria-hidden className="h-20 md:hidden" />
      <div className="fixed inset-x-0 bottom-[calc(50px+env(safe-area-inset-bottom))] z-30 px-4 pb-2 md:sticky md:inset-x-auto md:bottom-4 md:z-20 md:px-0 md:pb-0">
        <div className="flex items-center gap-2 material rounded-2xl ring-1 ring-black/5 p-2 shadow-xl shadow-black/10">
          <div className="hidden min-w-0 flex-1 px-2 sm:block">
            <p className="tabular text-sm font-medium text-ink-900">
              已完成 {doneSets} / {totalSets} 組
            </p>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full bg-accent-600 transition-all" style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} />
            </div>
          </div>
          {/* A finished workout can't go back to being a draft. */}
          {!editing && (
            <Button variant="secondary" icon={Save} className="h-12 flex-1 sm:flex-none" onClick={saveDraft}>
              儲存草稿
            </Button>
          )}
          <Button variant="accent" icon={CircleCheck} className="h-12 flex-[1.4] sm:flex-none" onClick={requestFinish}>
            {editing ? '儲存修改' : mode === 'coach' ? '完成上課' : '完成練習'}
            <span className="tabular text-white/70 sm:hidden">
              {doneSets}/{totalSets}
            </span>
          </Button>
        </div>
      </div>

      {editingTime && (
        <WorkoutTimeModal
          startedAt={workout.startedAt}
          minutes={minutesNow}
          onClose={() => setEditingTime(false)}
          onSave={(startedAt, minutes) => {
            setEditingTime(false)
            if (editing) patch((w) => ({ ...w, startedAt, completedAt: new Date(new Date(startedAt).getTime() + minutes * 60_000).toISOString() }))
            else {
              patch((w) => ({ ...w, startedAt }))
              setCustomMinutes(minutes)
            }
          }}
        />
      )}

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        existing={workout.exercises.map((e) => e.exerciseId)}
        onAdd={(ids, superset) => {
          const supersetId = superset ? newSupersetId() : undefined
          patch((w) => ({
            ...w,
            exercises: [
              ...w.exercises,
              ...ids.map((exerciseId) => ({
                id: uid('el'),
                exerciseId,
                supersetId,
                // Cardio is one activity; a Pilates move is usually one set of 8–10 (add more as needed).
                sets: [{ id: uid('set'), springs: null, weightKg: null, reps: null, rpe: null, completed: false }],
              })),
            ],
          }))
        }}
      />

      <ConfirmDialog
        open={confirmFinish != null}
        title="還有未完成的組數"
        description={
          editing
            ? `有 ${confirmFinish} 組沒有勾選完成，儲存後這些組數會從紀錄移除。`
            : `有 ${confirmFinish} 組尚未勾選完成。結束練習後，未完成的組數不會被記錄。`
        }
        confirmLabel={editing ? '儲存修改' : '結束並儲存'}
        cancelLabel={editing ? '繼續編輯' : '繼續練習'}
        onConfirm={finish}
        onCancel={() => setConfirmFinish(null)}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title={editing ? '放棄這次的修改？' : '捨棄此次練習？'}
        description={editing ? '紀錄會維持原本的內容。' : '草稿與已輸入的資料將被刪除，無法復原。'}
        confirmLabel={editing ? '放棄修改' : '捨棄'}
        tone="danger"
        onConfirm={editing ? () => backToHistory(workout.studentId) : discard}
        onCancel={() => setConfirmDiscard(false)}
      />
      <ConfirmDialog
        open={removeIdx != null}
        title="移除此動作？"
        description="此動作已有完成的組數，移除後將不會被記錄。"
        confirmLabel="移除"
        tone="danger"
        onConfirm={() => {
          const i = removeIdx
          setRemoveIdx(null)
          patch((w) => ({ ...w, exercises: normalizeSupersets(w.exercises.filter((_, j) => j !== i)) }))
        }}
        onCancel={() => setRemoveIdx(null)}
      />
      <DeductSessionDialog
        workout={deductWorkout}
        context="finish"
        onClose={(deducted) => {
          const sid = deductWorkout?.studentId
          setDeductWorkout(null)
          if (!deducted) notify('上課紀錄已儲存，未扣除堂數', 'info')
          navigate(`/coach/students/${sid}?tab=history`)
        }}
      />
    </div>
  )
}

/** A choice on the start screen: a radio card when `picked` is given, else a plain button that acts at once. */
function ChoiceCard({
  picked,
  onPick,
  icon: Icon,
  title,
  badge,
  sub,
}: {
  picked?: boolean
  onPick: () => void
  icon: LucideIcon
  title: string
  badge?: ReactNode
  sub: string
}) {
  const radio = picked !== undefined
  return (
    <button
      type="button"
      role={radio ? 'radio' : undefined}
      aria-checked={radio ? picked : undefined}
      onClick={onPick}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors ${
        picked ? 'border-accent-600 bg-accent-50' : 'border-line-strong hover:border-accent-600 hover:bg-accent-50'
      }`}
    >
      <Icon className="size-5 shrink-0 text-accent-700" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[15px] font-medium text-ink-900">
          <span className="truncate">{title}</span>
          {badge}
        </p>
        <p className="truncate text-xs text-ink-500">{sub}</p>
      </div>
      {radio && (
        <span
          aria-hidden
          className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${picked ? 'border-accent-600 bg-accent-600 text-white' : 'border-ink-300'}`}
        >
          {picked && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      )}
    </button>
  )
}

/** When the workout was and how long it took, for logging it afterwards or fixing the time. */
function WorkoutTimeModal({
  startedAt,
  minutes,
  onSave,
  onClose,
}: {
  startedAt: string
  minutes: number
  onSave: (startedAt: string, minutes: number) => void
  onClose: () => void
}) {
  const [date, setDate] = useState(toDateInput(startedAt))
  const [time, setTime] = useState(formatTime(startedAt))
  const [length, setLength] = useState(String(minutes))
  const [error, setError] = useState<string | null>(null)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm] = time.split(':').map(Number)
    const start = new Date(y, m - 1, d, hh, mm)
    const n = Number(length)
    if (Number.isNaN(start.getTime())) return setError('請選擇日期與時間')
    if (start.getTime() > Date.now() + 60_000) return setError('開始時間不能在未來')
    if (!Number.isInteger(n) || n < 1 || n > 600) return setError('時長需為 1–600 分鐘')
    onSave(start.toISOString(), n)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="日期與時間"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="h-11 md:h-10">
            取消
          </Button>
          <Button type="submit" form="workout-time" className="h-11 md:h-10">
            套用
          </Button>
        </>
      }
    >
      <form id="workout-time" onSubmit={save} noValidate className="grid grid-cols-2 gap-3">
        <TextInput label="日期" type="date" max={toDateInput(new Date())} value={date} onChange={(e) => setDate(e.target.value)} containerClassName="col-span-2" />
        <TextInput label="開始時間" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <TextInput label="時長（分鐘）" type="number" inputMode="numeric" min={1} max={600} value={length} onChange={(e) => setLength(e.target.value)} />
        {error && (
          <p className="col-span-2 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
