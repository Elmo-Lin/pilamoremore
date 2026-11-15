import { Check, Link2, Pencil, Plus, Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../../lib/format'
import { MUSCLE_NAME, musclesOf } from '../../lib/muscles'
import { isCoachRole } from '../../lib/roles'
import { validateExercise, type ExerciseInput } from '../../store/actions'
import { useData, useSession, useToast } from '../../store/contexts'
import type { Equipment, Exercise, ID, MuscleGroup } from '../../types'
import { Button, IconButton } from '../ui/Button'
import { inputClass, SelectInput, TextInput } from '../ui/Form'
import { Modal } from '../ui/Modal'
import { Badge, EmptyState } from '../ui/Primitives'
import { MuscleMap } from './MuscleMap'

type View = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; exercise: Exercise }

/**
 * Picks one or more exercises, in the order tapped. Two or more can go in together as a superset
 * (done back to back, resting after the round).
 */
export function ExercisePicker({
  open,
  onClose,
  onAdd,
  existing = [],
}: {
  open: boolean
  onClose: () => void
  onAdd: (exerciseIds: ID[], superset: boolean) => void
  existing?: ID[]
}) {
  const { data } = useData()
  const { session } = useSession()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<MuscleGroup | 'all'>('all')
  const [gear, setGear] = useState<Equipment | 'all'>('all')
  const [view, setView] = useState<View>({ kind: 'list' })
  const [selected, setSelected] = useState<ID[]>([])
  // The exercise whose muscles are shown large, over the list.
  const [peek, setPeek] = useState<Exercise | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  // Teachers add moves for the studio; students ask their teacher.
  const canAuthor = isCoachRole(session?.role)

  // Equipment first, then muscle group: only groups the chosen equipment has, a choice the new
  // equipment lacks falling back to all.
  const active = useMemo(() => data.exercises.filter((e) => !e.archived), [data.exercises])
  const gears = (Object.keys(EQUIPMENT_LABEL) as Equipment[]).filter((k) => active.some((e) => e.equipment === k))
  const withGear = useMemo(() => active.filter((e) => gear === 'all' || e.equipment === gear), [active, gear])
  const groups = (Object.keys(MUSCLE_LABEL) as MuscleGroup[]).filter((g) => withGear.some((e) => e.muscleGroup === g))
  const shownGroup = group !== 'all' && groups.includes(group) ? group : 'all'

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return withGear.filter(
      (e) => (shownGroup === 'all' || e.muscleGroup === shownGroup) && (!term || e.name.toLowerCase().includes(term) || e.nameEn.toLowerCase().includes(term)),
    )
  }, [withGear, q, shownGroup])

  const chipClass = (selected: boolean) =>
    `h-8 shrink-0 rounded-full border px-3.5 text-[13px] font-medium ${
      selected ? 'border-accent-600 bg-accent-600 text-white' : 'border-transparent bg-fill text-ink-800 hover:bg-fill-hover'
    }`
  const toTop = () => searchRef.current?.parentElement?.scrollTo({ top: 0 })

  const close = () => {
    onClose()
    setQ('')
    setSelected([])
    setView({ kind: 'list' })
  }
  const toggle = (id: ID) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const add = (superset: boolean) => {
    onAdd(selected, superset)
    close()
  }

  const title = view.kind === 'new' ? '新增自訂動作' : view.kind === 'edit' ? '編輯自訂動作' : '新增動作'

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="md"
      tall={view.kind === 'list'}
      footer={
        view.kind === 'list' && (
          <div className="flex w-full gap-2 md:justify-end">
            <Button variant="secondary" icon={Link2} className="h-11 flex-1 md:h-10 md:flex-none" disabled={selected.length < 2} onClick={() => add(true)}>
              組成超級組
            </Button>
            <Button className="h-11 flex-1 md:h-10 md:flex-none" disabled={!selected.length} onClick={() => add(false)}>
              {selected.length ? `加入 ${selected.length} 個動作` : '加入動作'}
            </Button>
          </div>
        )
      }
    >
      {view.kind !== 'list' ? (
        <CustomExerciseForm
          key={view.kind === 'edit' ? view.exercise.id : 'new'}
          exercise={view.kind === 'edit' ? view.exercise : undefined}
          initial={{ name: q.trim(), nameEn: '', muscleGroup: shownGroup === 'all' ? 'legs' : shownGroup, equipment: gear === 'all' ? 'reformer' : gear }}
          onBack={() => setView({ kind: 'list' })}
          onCreated={(id) => {
            setSelected((ids) => [...ids, id])
            setQ('')
            setView({ kind: 'list' })
          }}
        />
      ) : (
        <>
          {/* Search and filters stay put while the results scroll under them. */}
          <div ref={searchRef} className="sticky -top-4 z-10 -mx-5 -mt-4 bg-surface px-5 pt-4 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  // New results start from the best match, not wherever the old list was scrolled to.
                  toTop()
                }}
                placeholder="搜尋動作名稱（中文或英文）"
                className={`${inputClass} h-11 pl-9`}
                aria-label="搜尋動作"
              />
            </div>
            <div className="scrollbar-none -mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5">
              {(['all', ...gears] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={gear === k}
                  onClick={() => {
                    setGear(k)
                    toTop()
                  }}
                  className={chipClass(gear === k)}
                >
                  {k === 'all' ? '全部器材' : EQUIPMENT_LABEL[k]}
                </button>
              ))}
            </div>
            {groups.length > 1 && (
              <div className="scrollbar-none -mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5">
                {(['all', ...groups] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={shownGroup === g}
                    onClick={() => {
                      setGroup(g)
                      toTop()
                    }}
                    className={chipClass(shownGroup === g)}
                  >
                    {g === 'all' ? '全部部位' : MUSCLE_LABEL[g]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="divide-y divide-line">
            {list.map((e) => {
              const order = selected.indexOf(e.id)
              return (
              <li key={e.id} className="flex items-center gap-1">
                {/* What it works, at a glance; tap for the large picture. */}
                <button
                  type="button"
                  onClick={() => setPeek(e)}
                  aria-label={`查看「${e.name}」練到的肌群`}
                  className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-canvas hover:opacity-80"
                >
                  <MuscleMap targets={musclesOf(e)} className="h-10.75 w-11" />
                </button>
                <button
                  type="button"
                  aria-pressed={order >= 0}
                  onClick={() => toggle(e.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-2 text-left hover:bg-subtle/60 md:rounded-lg md:pr-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[15px] font-medium text-ink-900">
                      <span className="truncate">{e.name}</span>
                      {e.custom && <Badge tone="alt">自訂</Badge>}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {[e.nameEn, MUSCLE_LABEL[e.muscleGroup], EQUIPMENT_LABEL[e.equipment]].filter(Boolean).join('・')}
                    </p>
                  </div>
                  {existing.includes(e.id) && <span className="text-xs text-ink-400">已加入</span>}
                  {/* The order tapped is the order they go in. */}
                  {order >= 0 ? (
                    <span className="tabular inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-600 text-xs font-semibold text-white">
                      {selected.length > 1 ? order + 1 : <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                  ) : (
                    <span className="size-6 shrink-0 rounded-full border-[1.5px] border-line-strong" />
                  )}
                </button>
                {e.custom && canAuthor && <IconButton icon={Pencil} label={`編輯「${e.name}」`} size="sm" onClick={() => setView({ kind: 'edit', exercise: e })} />}
              </li>
              )
            })}
          </ul>
          {!list.length && (
            <EmptyState compact icon={Search} title="找不到符合的動作" description={canAuthor ? '可以新增成自訂動作。' : '試試其他關鍵字，或請老師新增這個動作。'} />
          )}
          <MusclePeek
            exercise={peek}
            selected={!!peek && selected.includes(peek.id)}
            onClose={() => setPeek(null)}
            onToggle={() => {
              if (peek) toggle(peek.id)
              setPeek(null)
            }}
          />
          {canAuthor && (
            <button
              type="button"
              onClick={() => setView({ kind: 'new' })}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong py-3 text-sm font-medium text-accent-700 hover:bg-subtle"
            >
              <Plus className="size-4" />
              {q.trim() ? `新增自訂動作「${q.trim()}」` : '找不到？新增自訂動作'}
            </button>
          )}
        </>
      )}
    </Modal>
  )
}

/** The muscles an exercise works, large, with their names (the colours alone don't say which is which). */
function MusclePeek({ exercise, selected, onClose, onToggle }: { exercise: Exercise | null; selected: boolean; onClose: () => void; onToggle: () => void }) {
  if (!exercise) return null
  const targets = musclesOf(exercise)
  const names = (list: typeof targets.primary) => list.map((m) => MUSCLE_NAME[m]).join('、')
  return (
    <Modal
      open
      onClose={onClose}
      title={exercise.name}
      description={[exercise.nameEn, MUSCLE_LABEL[exercise.muscleGroup], EQUIPMENT_LABEL[exercise.equipment]].filter(Boolean).join('・')}
      size="sm"
      footer={
        <Button variant={selected ? 'secondary' : 'primary'} className="h-11 md:h-10" onClick={onToggle}>
          {selected ? '取消選取' : '選取這個動作'}
        </Button>
      }
    >
      <div className="rounded-xl bg-canvas px-3 pt-4 pb-3">
        <MuscleMap targets={targets} className="mx-auto w-full max-w-75" />
        <div className="mx-auto mt-1 grid max-w-75 grid-cols-2 text-center text-xs text-ink-500">
          <span>正面</span>
          <span>背面</span>
        </div>
      </div>
      {targets.primary.length ? (
        <dl className="mt-4 space-y-2.5">
          {(
            [
              ['主要', targets.primary, 'bg-accent-600'],
              ['次要', targets.secondary, 'bg-muscle-secondary'],
            ] as const
          ).map(
            ([label, list, dot]) =>
              list.length > 0 && (
                <div key={label} className="flex items-baseline gap-2.5">
                  <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${dot}`} />
                  <dt className="w-8 shrink-0 text-[13px] text-ink-500">{label}</dt>
                  <dd className="text-[15px] font-medium text-ink-900">{names(list)}</dd>
                </div>
              ),
          )}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-ink-500">這個動作沒有標示特定肌群。</p>
      )}
      {exercise.custom && targets.primary.length > 0 && (
        <p className="mt-3 text-xs text-ink-500">自訂動作依「{MUSCLE_LABEL[exercise.muscleGroup]}」顯示常見的肌群。</p>
      )}
    </Modal>
  )
}

/** Add (then pick) or edit a custom exercise. Deleting archives it, so past workouts keep its name. */
function CustomExerciseForm({
  exercise,
  initial,
  onBack,
  onCreated,
}: {
  exercise?: Exercise
  initial: ExerciseInput
  onBack: () => void
  onCreated: (id: ID) => void
}) {
  const { data, actions } = useData()
  const notify = useToast()
  const [form, setForm] = useState<ExerciseInput>(
    exercise ? { name: exercise.name, nameEn: exercise.nameEn, muscleGroup: exercise.muscleGroup, equipment: exercise.equipment } : initial,
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validateExercise(form, exercise ? data.exercises.filter((x) => x.id !== exercise.id) : data.exercises)
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (exercise) {
      const res = actions.updateCustomExercise(exercise.id, form)
      if (!res.ok) return notify(res.error, 'error')
      notify('已更新自訂動作')
      onBack()
    } else {
      const res = actions.addCustomExercise(form)
      if (!res.ok) return notify(res.error, 'error')
      notify(`已新增「${res.value.name}」`)
      onCreated(res.value.id)
    }
  }

  const archive = () => {
    if (!exercise) return
    const res = actions.archiveCustomExercise(exercise.id)
    if (!res.ok) return notify(res.error, 'error')
    notify(`已刪除「${exercise.name}」`)
    onBack()
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3.5">
      <TextInput
        label="動作名稱"
        required
        autoFocus
        maxLength={40}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        error={errors.name}
      />
      <TextInput label="英文名稱（選填）" maxLength={60} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} error={errors.nameEn} />
      <div className="grid grid-cols-2 gap-3">
        <SelectInput label="部位" value={form.muscleGroup} onChange={(e) => setForm({ ...form, muscleGroup: e.target.value as MuscleGroup })}>
          {(Object.keys(MUSCLE_LABEL) as MuscleGroup[]).map((g) => (
            <option key={g} value={g}>
              {MUSCLE_LABEL[g]}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="器材" value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value as Equipment })}>
          {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((k) => (
            <option key={k} value={k}>
              {EQUIPMENT_LABEL[k]}
            </option>
          ))}
        </SelectInput>
      </div>
      <p className="text-xs text-ink-500">自訂動作會出現在搜尋、上課紀錄與進步追蹤。老師新增的動作，工作室的老師與學員都看得到。</p>
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" className="h-11 md:h-10" onClick={onBack}>
          返回
        </Button>
        <Button type="submit" className="h-11 md:h-10">
          {exercise ? '儲存' : '新增並選取'}
        </Button>
      </div>
      {exercise && (
        <div className="border-t border-line pt-3 text-center">
          {confirmDelete ? (
            <p className="text-sm text-ink-600">
              刪除後不會再出現在選單，過去的紀錄仍會保留。
              <button type="button" onClick={archive} className="ml-2 font-medium text-danger-600 hover:underline">
                確定刪除
              </button>
            </p>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm text-ink-500 hover:text-danger-600 hover:underline">
              刪除這個自訂動作
            </button>
          )}
        </div>
      )}
    </form>
  )
}
