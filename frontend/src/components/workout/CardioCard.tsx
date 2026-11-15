import { ArrowDown, ArrowUp, Check, CopyPlus, History, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { tempo } from '../../lib/cardio'
import { formatDate } from '../../lib/format'
import { uid } from '../../lib/id'
import { summarizeSets } from '../../lib/stats'
import type { Exercise, ExerciseLog, SetLog } from '../../types'
import { IconButton } from '../ui/Button'
import { NumInput } from './ExerciseCard'

/** Grey placeholders: last time, else the plan's minutes. */
export interface CardioSuggestion {
  minutes: number | null
  km: number | null
}

const toMinutes = (sec: number | null | undefined) => (sec == null ? null : Math.round(sec / 6) / 10)

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-ink-400">{label}</span>
      {children}
    </label>
  )
}

/**
 * A cardio exercise in the logger, the way phone and watch fitness apps record one: a single
 * activity with its time, and optionally distance, average heart rate and calories (the same
 * fields a watch will fill in). Pace (on foot) or speed is worked out from time and distance.
 */
export function CardioCard({
  log,
  index,
  exercise,
  last,
  suggestion,
  onChange,
  canMoveUp,
  canMoveDown,
  onMove,
  onRemove,
  onCopyLast,
  onNeedTime,
}: {
  log: ExerciseLog
  index: number
  exercise: Exercise | undefined
  last?: { log: ExerciseLog; date: string }
  suggestion: CardioSuggestion
  onChange: (log: ExerciseLog) => void
  /** Inside a superset only within it; a lone exercise moves past whole supersets. */
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onCopyLast: () => void
  onNeedTime: () => void
}) {
  // One activity: the log's first entry (made on the first edit if the log has none).
  const entry: SetLog = log.sets[0] ?? { id: uid('set'), weightKg: null, reps: null, rpe: null, completed: false }
  const update = (patch: Partial<SetLog>) => onChange({ ...log, sets: [{ ...entry, ...patch }] })
  const done = entry.completed
  const shown = tempo(log.exerciseId, entry.durationSec ?? (suggestion.minutes ? suggestion.minutes * 60 : null), entry.distanceKm ?? suggestion.km)

  const toggle = () => {
    if (done) return update({ completed: false })
    const minutes = toMinutes(entry.durationSec) ?? suggestion.minutes
    if (!minutes || minutes <= 0) return onNeedTime()
    update({ completed: true, durationSec: Math.round(minutes * 60), distanceKm: entry.distanceKm ?? suggestion.km })
  }

  return (
    <section className="rounded-xl bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.04)]" aria-label={exercise?.name}>
      <header className="flex items-start gap-2 px-4 pt-3.5 pb-2">
        <span className="tabular mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-alt-600 text-xs font-semibold text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] leading-6 font-semibold text-ink-900">{exercise?.name ?? '未知動作'}</h3>
          <p className="text-xs text-ink-500">
            有氧
          </p>
        </div>
        <div className="-mr-1.5 flex items-center">
          <IconButton icon={ArrowUp} label="上移" size="sm" disabled={!canMoveUp} onClick={() => onMove(-1)} />
          <IconButton icon={ArrowDown} label="下移" size="sm" disabled={!canMoveDown} onClick={() => onMove(1)} />
          <IconButton icon={Trash2} label="移除動作" size="sm" tone="danger" onClick={onRemove} />
        </div>
      </header>


      {last ? (
        <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-ink-500">
          <History className="size-3.5 shrink-0 text-ink-400" />
          <span className="min-w-0 flex-1 truncate">
            上次 {formatDate(last.date)}：<span className="tabular text-ink-700">{summarizeSets(last.log)}</span>
          </span>
          <button type="button" onClick={onCopyLast} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 font-medium text-accent-700 hover:bg-accent-50">
            <CopyPlus className="size-3.5" />
            帶入
          </button>
        </div>
      ) : (
        <p className="mx-4 mb-2 text-xs text-ink-400">尚無此動作的歷史紀錄</p>
      )}

      <div className={`mx-2 mb-2 rounded-xl p-3 transition-colors sm:mx-3 ${done ? 'bg-alt-50' : ''}`}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <Field label="時間（分鐘）">
            <NumInput
              label="時間（分鐘）"
              value={toMinutes(entry.durationSec)}
              decimals
              max={1440}
              done={done}
              placeholder={suggestion.minutes != null ? String(suggestion.minutes) : '分鐘'}
              onChange={(n) => update({ durationSec: n == null ? null : Math.round(n * 60) })}
            />
          </Field>
          <Field label="距離 km">
            <NumInput
              label="距離（公里）"
              value={entry.distanceKm ?? null}
              decimals
              max={1000}
              done={done}
              placeholder={suggestion.km != null ? String(suggestion.km) : '選填'}
              onChange={(n) => update({ distanceKm: n })}
            />
          </Field>
          <Field label="平均心率 bpm">
            <NumInput label="平均心率" value={entry.avgHeartRate ?? null} max={250} done={done} placeholder="選填" onChange={(n) => update({ avgHeartRate: n })} />
          </Field>
          <Field label="卡路里 kcal">
            <NumInput label="卡路里" value={entry.calories ?? null} max={10000} done={done} placeholder="選填" onChange={(n) => update({ calories: n })} />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <p className="tabular min-w-0 flex-1 text-[13px] text-ink-600">{shown ? `${shown.label} ${shown.value}` : ''}</p>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={done}
            className={`inline-flex h-11 items-center gap-1.5 rounded-full border-2 px-5 text-[15px] font-semibold transition-colors ${
              done ? 'border-alt-600 bg-alt-600 text-white' : 'border-ink-300 bg-surface text-ink-700 hover:border-alt-600 hover:text-alt-600'
            }`}
          >
            <Check className="size-5" strokeWidth={3} />
            {done ? '已完成' : '完成'}
          </button>
        </div>
      </div>
    </section>
  )
}
