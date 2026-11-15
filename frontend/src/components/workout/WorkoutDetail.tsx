import { ChevronRight, Clock, Pencil, Ticket, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { duration, durationMin, formatDate, formatTime, km, volumeNumber } from '../../lib/format'
import { deductionFor } from '../../lib/sessions'
import { cardioSets, describeCardio, workoutCardioSec } from '../../lib/cardio'
import { completedSets, workoutSetCount, workoutVolume } from '../../lib/stats'
import { supersetSlots } from '../../lib/superset'
import { useData, useToast } from '../../store/contexts'
import { selectStudent, selectTaughtBy, useExerciseMap } from '../../store/selectors'
import type { WorkoutSession } from '../../types'
import { Button } from '../ui/Button'
import { TextInput } from '../ui/Form'
import { ConfirmDialog, Modal } from '../ui/Modal'
import { Avatar, Badge } from '../ui/Primitives'
import { DeductSessionDialog } from './DeductSessionDialog'
import { SpringDots } from './SpringDots'

/** "8 個動作・9 組・96 下", plus "有氧 10 分鐘" when there was cardio (only that, for a cardio-only session). */
function workoutSummary(w: WorkoutSession) {
  const sets = workoutSetCount(w)
  const cardio = workoutCardioSec(w)
  const parts = [`${w.exercises.length} 個動作`]
  if (sets || !cardio) parts.push(`${sets} 組`, `${volumeNumber(workoutVolume(w))} 下`)
  if (cardio) parts.push(`有氧 ${duration(cardio)}`)
  return parts.join('・')
}

export function WorkoutTypeBadge({ workout }: { workout: WorkoutSession }) {
  return workout.type === 'coached' ? <Badge tone="accent">私人課</Badge> : <Badge tone="alt">自主練習</Badge>
}

export function DeductionBadge({ workout }: { workout: WorkoutSession }) {
  const { data } = useData()
  if (workout.type !== 'coached') return null
  return deductionFor(workout.id, data.transactions) ? (
    <Badge icon={Ticket}>已扣堂</Badge>
  ) : (
    <Badge tone="warn" icon={Ticket}>
      未扣堂
    </Badge>
  )
}

export function WorkoutRow({
  workout,
  onOpen,
  showStudent,
  showDeduction,
}: {
  workout: WorkoutSession
  onOpen: () => void
  showStudent?: boolean
  showDeduction?: boolean
}) {
  const { data } = useData()
  const student = showStudent ? selectStudent(data, workout.studentId) : undefined
  const taughtBy = selectTaughtBy(data, workout)
  const when = workout.completedAt ?? workout.startedAt
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-subtle/60">
      {student ? (
        <Avatar name={student.name} id={student.id} size="sm" />
      ) : (
        <span className="tabular flex w-10 shrink-0 flex-col items-center rounded-lg bg-subtle py-1 leading-tight">
          <span className="text-[10px] text-ink-500">{new Date(when).getMonth() + 1}月</span>
          <span className="text-[15px] font-semibold text-ink-800">{new Date(when).getDate()}</span>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-medium text-ink-900">
            {student ? `${student.name}・` : ''}
            {workout.title}
          </p>
          <WorkoutTypeBadge workout={workout} />
          {showDeduction && <DeductionBadge workout={workout} />}
        </div>
        <p className="tabular mt-0.5 text-xs text-ink-500">
          {student ? `${formatDate(when, { weekday: true })} ` : ''}
          {formatTime(workout.startedAt)}・{taughtBy ? `${taughtBy}・` : ''}{workoutSummary(workout)}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-ink-300" />
    </button>
  )
}

export function WorkoutDetailModal({
  workout,
  onClose,
  audience,
}: {
  workout: WorkoutSession | null
  onClose: () => void
  audience: 'coach' | 'student'
}) {
  const { data, actions } = useData()
  const notify = useToast()
  const exMap = useExerciseMap()
  const [deducting, setDeducting] = useState(false)
  const [reversing, setReversing] = useState(false)
  const [reverseReason, setReverseReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  if (!workout) return null
  const current = data.workouts.find((w) => w.id === workout.id) ?? workout
  const slots = supersetSlots(current.exercises)
  const deduction = deductionFor(current.id, data.transactions)
  const student = selectStudent(data, current.studentId)
  const mins = durationMin(current.startedAt, current.completedAt)
  const setCount = workoutSetCount(current)
  const cardioSec = workoutCardioSec(current)
  const cardioKm = current.exercises.reduce((n, e) => n + cardioSets(e.sets).reduce((m, x) => m + (x.distanceKm ?? 0), 0), 0)
  // Coaches edit and delete what coaches logged; a student's own training is theirs alone.
  const ownRecord = audience === 'coach' ? current.createdBy !== 'student' : current.createdBy === 'student'
  const canDelete = ownRecord
  const canEdit = ownRecord && current.status === 'completed'

  return (
    <>
      <Modal
        open={!deducting}
        onClose={onClose}
        title={current.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            {audience === 'coach' && student && <span>{student.name}</span>}
            {selectTaughtBy(data, current) && <span>老師 {selectTaughtBy(data, current)}</span>}
            <span>{formatDate(current.completedAt ?? current.startedAt, { year: true, weekday: true })}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {formatTime(current.startedAt)}
              {mins ? `・${mins} 分鐘` : ''}
            </span>
          </span>
        }
        size="lg"
        footer={
          <>
            {canDelete && (
              <Button variant="destructive" icon={Trash2} className="h-11 md:mr-auto md:h-10" onClick={() => setDeleting(true)}>
                刪除紀錄
              </Button>
            )}
            <Button variant="secondary" className="h-11 md:h-10" onClick={onClose}>
              關閉
            </Button>
            {canEdit && (
              <Button
                variant="secondary"
                icon={Pencil}
                className="h-11 md:h-10"
                onClick={() => navigate(`${audience === 'coach' ? '/coach' : '/student'}/workouts/new?edit=${current.id}`)}
              >
                編輯
              </Button>
            )}
            {audience === 'coach' && deduction && (
              <Button variant="secondary" icon={Undo2} className="h-11 md:h-10" onClick={() => setReversing(true)}>
                撤銷扣堂
              </Button>
            )}
            {audience === 'coach' && current.type === 'coached' && !deduction && (
              <Button icon={Ticket} className="h-11 md:h-10" onClick={() => setDeducting(true)}>
                扣除 1 堂
              </Button>
            )}
          </>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <WorkoutTypeBadge workout={current} />
          {current.type === 'coached' && <DeductionBadge workout={current} />}
          {current.type === 'independent' && <Badge>不扣除堂數</Badge>}
          <Badge>{current.createdBy === 'coach' ? '老師記錄' : '學員記錄'}</Badge>
        </div>
        <div className={`mb-4 grid gap-2 rounded-xl bg-canvas p-3 text-center ${cardioSec && setCount ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <div>
            <p className="text-xs text-ink-500">動作</p>
            <p className="text-lg font-semibold text-ink-900">{current.exercises.length}</p>
          </div>
          {(setCount > 0 || !cardioSec) && (
            <>
              <div>
                <p className="text-xs text-ink-500">完成組數</p>
                <p className="text-lg font-semibold text-ink-900">{setCount}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">總次數</p>
                <p className="text-lg font-semibold text-ink-900">{volumeNumber(workoutVolume(current))} 下</p>
              </div>
            </>
          )}
          {cardioSec > 0 && (
            <div>
              <p className="text-xs text-ink-500">有氧</p>
              <p className="text-lg font-semibold text-ink-900">{duration(cardioSec)}</p>
            </div>
          )}
          {cardioSec > 0 && !setCount && (
            <div>
              <p className="text-xs text-ink-500">距離</p>
              <p className="text-lg font-semibold text-ink-900">{cardioKm ? km(cardioKm) : '—'}</p>
            </div>
          )}
        </div>
        <div className="space-y-3">
          {current.exercises.map((e, ei) => (
            <div key={e.id} className="rounded-lg border border-line">
              <p className="flex items-baseline gap-2 border-b border-line px-3 py-2 text-sm font-medium text-ink-900">
                {exMap.get(e.exerciseId)?.name}
                {slots[ei] && (
                  <span className="text-[11px] text-accent-700">
                    超級組 {slots[ei].letter}・{slots[ei].position}/{slots[ei].size}
                  </span>
                )}
              </p>
              <table className="tabular w-full text-sm">
                <tbody className="divide-y divide-line">
                  {completedSets(e.sets).map((s, i) => (
                    <tr key={s.id}>
                      <td className="w-12 px-3 py-1.5 text-ink-400">{i + 1}</td>
                      <td className="px-3 py-1.5 text-ink-900">
                        {s.springs ? (
                          <span className="inline-flex items-center gap-1.5">
                            <SpringDots setting={s.springs} />
                            {s.springs}
                          </span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-ink-900">{s.reps} 下</td>
                    </tr>
                  ))}
                  {cardioSets(e.sets).map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2 text-ink-900">{describeCardio(e.exerciseId, s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        {current.notes && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium text-ink-500">備註</p>
            <p className="rounded-lg bg-canvas px-3 py-2 text-sm whitespace-pre-wrap text-ink-700">{current.notes}</p>
          </div>
        )}
      </Modal>

      {deducting && (
        <DeductSessionDialog
          workout={current}
          onClose={() => {
            setDeducting(false)
          }}
        />
      )}

      <ConfirmDialog
        open={reversing}
        title="撤銷此堂扣堂？"
        description="撤銷後會新增一筆「退回 1 堂」的紀錄，原扣堂紀錄仍會保留在歷史中。"
        confirmLabel="撤銷扣堂"
        onCancel={() => setReversing(false)}
        onConfirm={() => {
          const res = actions.reverseDeduction(current.id, reverseReason || '撤銷扣堂')
          if (!res.ok) return notify(res.error, 'error')
          setReversing(false)
          setReverseReason('')
          notify('已退回 1 堂')
        }}
      >
        <TextInput label="原因" placeholder="例如：誤扣、課程取消" value={reverseReason} maxLength={60} onChange={(e) => setReverseReason(e.target.value)} />
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting}
        title="刪除這筆上課紀錄？"
        description={deduction ? '此課程已扣堂。請先撤銷扣堂，再刪除紀錄。' : '刪除後無法復原。'}
        confirmLabel="刪除"
        tone="danger"
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          const res = actions.deleteWorkout(current.id)
          setDeleting(false)
          if (!res.ok) return notify(res.error, 'error')
          notify('已刪除上課紀錄')
          onClose()
        }}
      />
    </>
  )
}
