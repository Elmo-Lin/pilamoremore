// All mutations of AppData go through these actions. Each validates against
// the latest state and returns a Result so the UI can show a precise error.
import { generateDemoData } from '../data/mock'
import { activeStudentsOf, limitMessage, readOnlyMessage } from '../lib/billing'
import { uid } from '../lib/id'
import { isCoachRole } from '../lib/roles'
import { deductionBlocker, deductionFor, packageBalance, studentBalance } from '../lib/sessions'
import type {
  AppData,
  Appointment,
  CoachMember,
  Exercise,
  Goal,
  ID,
  PackagePreset,
  Role,
  SessionPackage,
  Student,
  WorkoutSession,
} from '../types'

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string }

const ok = <T,>(value: T): Result<T> => ({ ok: true, value })
const fail = (error: string): Result<never> => ({ ok: false, error })
const nowISO = () => new Date().toISOString()
/** Same limit as the server (GoalService). */
const MAX_GOALS = 20

export type StudentInput = Pick<
  Student,
  'name' | 'email' | 'phone' | 'gender' | 'birthYear' | 'heightCm' | 'goal' | 'goalDetail' | 'weeklyFrequency' | 'coachNotes' | 'status'
>

export type PackageInput = Pick<SessionPackage, 'name' | 'totalSessions' | 'priceTwd' | 'purchaseDate' | 'expiresAt' | 'notes'>

export type AppointmentInput = Pick<Appointment, 'studentId' | 'startAt' | 'durationMin' | 'location'>

/** Mirrors the backend's AppointmentDto constraints. */
export function validateAppointment(input: AppointmentInput): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!input.studentId) errors.studentId = '請選擇學員'
  if (!input.startAt || Number.isNaN(new Date(input.startAt).getTime())) errors.startAt = '請選擇日期與時間'
  if (!Number.isInteger(input.durationMin) || input.durationMin < 15 || input.durationMin > 240) errors.durationMin = '時長需為 15–240 分鐘'
  if (!input.location.trim()) errors.location = '請輸入地點'
  else if (input.location.trim().length > 80) errors.location = '地點最多 80 字'
  return errors
}

export function validateStudent(input: StudentInput, others: Student[]): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!input.name.trim()) errors.name = '請輸入姓名'
  if (!input.email.trim()) errors.email = '請輸入 Email'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = 'Email 格式不正確'
  else if (others.some((s) => s.email.toLowerCase() === input.email.trim().toLowerCase()))
    errors.email = '此 Email 已被其他學員使用'
  if (input.phone && !/^[0-9+\-\s()]{8,15}$/.test(input.phone)) errors.phone = '電話格式不正確'
  if (input.weeklyFrequency < 1 || input.weeklyFrequency > 7) errors.weeklyFrequency = '每週 1–7 次'
  if (input.heightCm != null && (input.heightCm < 100 || input.heightCm > 230)) errors.heightCm = '請輸入 100–230 之間'
  if (input.birthYear != null && (input.birthYear < 1930 || input.birthYear > new Date().getFullYear() - 10))
    errors.birthYear = '出生年份不合理'
  return errors
}

export function validatePackage(input: PackageInput): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!input.name.trim()) errors.name = '請輸入方案名稱'
  if (!Number.isInteger(input.totalSessions) || input.totalSessions < 1 || input.totalSessions > 200)
    errors.totalSessions = '堂數需為 1–200 的整數'
  if (!Number.isFinite(input.priceTwd) || input.priceTwd < 0) errors.priceTwd = '金額不可為負數'
  if (!input.purchaseDate) errors.purchaseDate = '請選擇購買日期'
  if (input.expiresAt && input.purchaseDate && input.expiresAt < input.purchaseDate)
    errors.expiresAt = '到期日不可早於購買日'
  return errors
}

export const MAX_PACKAGE_PRESETS = 6

export type ExerciseInput = Pick<Exercise, 'name' | 'nameEn' | 'muscleGroup' | 'equipment'>

/** Mirrors the backend's ExerciseInput constraints; names are unique among the exercises still in use. */
export function validateExercise(input: ExerciseInput, others: Exercise[]): Record<string, string> {
  const errors: Record<string, string> = {}
  const name = input.name.trim()
  if (!name) errors.name = '請輸入動作名稱'
  else if (name.length > 40) errors.name = '動作名稱最多 40 字'
  else if (others.some((e) => !e.archived && e.name.toLowerCase() === name.toLowerCase())) errors.name = `已經有叫「${name}」的動作了`
  if (input.nameEn.trim().length > 60) errors.nameEn = '英文名稱最多 60 字'
  return errors
}

/** Mirrors the backend's PackagePresetDto constraints. */
export function validatePreset(p: PackagePreset): string | null {
  if (!p.name.trim()) return '請輸入方案名稱'
  if (p.name.trim().length > 40) return '方案名稱最多 40 字'
  if (!Number.isInteger(p.totalSessions) || p.totalSessions < 1 || p.totalSessions > 200) return '堂數需為 1–200 的整數'
  if (!Number.isInteger(p.priceTwd) || p.priceTwd < 0) return '金額不可為負數'
  return null
}

/** Seats count the owner and every coach who is active or invited. */
export const seatsOf = (d: AppData) => d.studio?.maxCoaches ?? 3
export const seatsUsed = (d: AppData) => d.studio?.coaches.filter((c) => c.status !== 'inactive').length ?? 1
const isActiveCoach = (d: AppData, id: ID) => d.studio?.coaches.some((c) => c.id === id && c.status === 'active') ?? id === d.coach.id

/** `actingCoach`: offline demo only, the studio coach the demo is acting as (undefined = the workspace's owner). */
export function createActions(get: () => AppData, set: (next: AppData) => void, actor: () => Role, actingCoach: () => ID | undefined = () => undefined) {
  const update = (fn: (d: AppData) => AppData) => set(fn(get()))

  const actions = {
    /** Regenerates the current demo workspace only. */
    resetDemo() {
      set(generateDemoData())
    },

    // ---------------- Students ----------------
    /** `coachId`: studio owner only, the coach responsible for the new student (defaults to the caller). */
    addStudent(input: StudentInput, coachId?: ID): Result<Student> {
      const d = get()
      const errors = validateStudent(input, d.students)
      const first = Object.values(errors)[0]
      if (first) return fail(first)
      const self = actingCoach() ?? d.coach.id
      const teacher = coachId ?? self
      if (teacher !== self && (actor() !== 'owner' || !isActiveCoach(d, teacher))) return fail('找不到此老師')
      if (d.billing && input.status === 'active' && activeStudentsOf(d) >= d.billing.studentLimit) return fail(limitMessage(d.billing))
      const now = nowISO()
      const student: Student = {
        ...input,
        name: input.name.trim(),
        email: input.email.trim(),
        id: uid('stu'),
        role: 'student',
        createdAt: now,
        joinedAt: now,
      }
      update((d) => ({
        ...d,
        students: [...d.students, student],
        relationships: [
          ...d.relationships,
          { id: uid('rel'), coachId: teacher, studentId: student.id, status: student.status, startedAt: now },
        ],
      }))
      return ok(student)
    },

    updateStudent(id: ID, patch: Partial<Student>): Result<Student> {
      const d = get()
      const current = d.students.find((s) => s.id === id)
      if (!current) return fail('找不到此學員')
      const next = { ...current, ...patch, id, role: 'student' as const }
      const errors = validateStudent(next, d.students.filter((s) => s.id !== id))
      const first = Object.values(errors)[0]
      if (first) return fail(first)
      // Reactivating takes a slot again; inactive students keep their history for free.
      if (d.billing && next.status === 'active' && current.status !== 'active' && activeStudentsOf(d) >= d.billing.studentLimit)
        return fail(limitMessage(d.billing))
      update((d) => ({
        ...d,
        students: d.students.map((s) => (s.id === id ? next : s)),
        relationships: d.relationships.map((r) => (r.studentId === id ? { ...r, status: next.status } : r)),
      }))
      return ok(next)
    },

    /** deleteAccount (API mode): also delete the sign-in of a student who has one; by default they keep it as a self-tracker. */
    deleteStudent(id: ID, options?: { deleteAccount?: boolean }): Result {
      void options // read by the sync layer (api/sync.ts)
      // A coach who started as a self-tracker keeps their own training as a student record (same ID as their workspace).
      if (id === get().coach.id) return fail('這是你自己的上課紀錄，無法刪除')
      update((d) => ({
        ...d,
        students: d.students.filter((s) => s.id !== id),
        relationships: d.relationships.filter((r) => r.studentId !== id),
        workouts: d.workouts.filter((w) => w.studentId !== id),
        packages: d.packages.filter((p) => p.studentId !== id),
        transactions: d.transactions.filter((t) => t.studentId !== id),
        metrics: d.metrics.filter((m) => m.studentId !== id),
        appointments: d.appointments.filter((a) => a.studentId !== id),
        goals: d.goals.filter((g) => g.studentId !== id),
      }))
      return ok(undefined)
    },

    // ---------------- Plans ----------------
    /** Creates or updates appointments by id (several at once for a weekly series). Coach only. */
    saveAppointments(list: Appointment[]): Result<Appointment[]> {
      if (!isCoachRole(actor())) return fail('只有老師可以安排課程')
      const d = get()
      for (const a of list) {
        if (!d.students.some((s) => s.id === a.studentId)) return fail('找不到此學員')
        const first = Object.values(validateAppointment(a))[0]
        if (first) return fail(first)
      }
      const saved = list.map((a) => ({ ...a, coachId: d.coach.id, location: a.location.trim() }))
      const ids = new Set(saved.map((a) => a.id))
      update((x) => ({ ...x, appointments: [...x.appointments.filter((a) => !ids.has(a.id)), ...saved] }))
      return ok(saved)
    },

    deleteAppointment(id: ID): Result {
      if (!isCoachRole(actor())) return fail('只有老師可以安排課程')
      if (!get().appointments.some((a) => a.id === id)) return fail('找不到此課程')
      update((x) => ({ ...x, appointments: x.appointments.filter((a) => a.id !== id) }))
      return ok(undefined)
    },

    // ---------------- Studio (owner) ----------------
    /** Hands a student, with all their history, to another active coach of the studio. */
    transferStudent(studentId: ID, coachId: ID): Result {
      const d = get()
      if (actor() !== 'owner') return fail('只有工作室經營者可以執行此操作')
      if (!d.students.some((s) => s.id === studentId)) return fail('找不到此學員')
      if (!isActiveCoach(d, coachId)) return fail('此老師尚未啟用或已停用')
      update((x) => ({ ...x, relationships: x.relationships.map((r) => (r.studentId === studentId ? { ...r, coachId } : r)) }))
      return ok(undefined)
    },

    /**
     * The coach loses access; their students move to `transferTo` (required when they have any).
     * A coach who never activated is removed, freeing their seat and email.
     */
    deactivateCoach(coachId: ID, transferTo?: ID): Result {
      const d = get()
      if (actor() !== 'owner' || !d.studio) return fail('只有工作室經營者可以執行此操作')
      const coach = d.studio.coaches.find((c) => c.id === coachId)
      if (!coach) return fail('找不到此老師')
      if (coach.role === 'owner') return fail('無法移除經營者')
      const theirs = d.relationships.some((r) => r.coachId === coachId)
      if (theirs && (!transferTo || transferTo === coachId || !isActiveCoach(d, transferTo))) return fail('請選擇接手學員的老師')
      update((x) => ({
        ...x,
        relationships: x.relationships.map((r) => (r.coachId === coachId && transferTo ? { ...r, coachId: transferTo } : r)),
        studio: x.studio && {
          ...x.studio,
          // Removed coaches leave the studio (on the server they become free coaches elsewhere).
          coaches: x.studio.coaches.filter((c) => c.id !== coachId),
        },
      }))
      return ok(undefined)
    },

    /** Offline demo only (the real invite is created by the server, see api/studio.ts). */
    inviteCoachDemo(input: { name: string; email: string; title?: string }): Result<CoachMember> {
      const d = get()
      if (actor() !== 'owner' || !d.studio) return fail('只有工作室經營者可以執行此操作')
      if (!input.name.trim()) return fail('請輸入姓名')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return fail('Email 格式不正確')
      const email = input.email.trim().toLowerCase()
      if (d.studio.coaches.some((c) => c.email.toLowerCase() === email) || d.students.some((s) => s.email.toLowerCase() === email))
        return fail('此 Email 已被其他帳號使用')
      if (seatsUsed(d) >= seatsOf(d)) return fail(`老師名額已滿（${seatsOf(d)} 位，含經營者）${d.billing ? '。請至「方案與付款」加購老師名額。' : ''}`)
      const member: CoachMember = {
        id: uid('coach'),
        role: 'coach',
        name: input.name.trim(),
        email: input.email.trim(),
        title: input.title?.trim() || '老師',
        status: 'invited',
        inviteCode: uid('x').slice(2, 10).toUpperCase(),
        createdAt: nowISO(),
      }
      update((x) => ({ ...x, studio: x.studio && { ...x.studio, coaches: [...x.studio.coaches, member] } }))
      return ok(member)
    },

    /** Add or change one of your own goals. */
    saveGoal(goal: Goal): Result<Goal> {
      if (!goal.exerciseId) return fail('請選擇動作')
      if (!(Number.isInteger(goal.targetReps) && goal.targetReps >= 1 && goal.targetReps <= 200)) return fail('目標次數需為 1–200 下')
      const mine = get().goals.filter((g) => g.studentId === goal.studentId)
      if (!mine.some((g) => g.id === goal.id) && mine.length >= MAX_GOALS) return fail(`目標最多 ${MAX_GOALS} 個，請先刪除不需要的`)
      const saved: Goal = { ...goal }
      update((d) => ({ ...d, goals: d.goals.some((g) => g.id === goal.id) ? d.goals.map((g) => (g.id === goal.id ? saved : g)) : [...d.goals, saved] }))
      return ok(saved)
    },

    deleteGoal(id: ID): Result {
      update((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id) }))
      return ok(undefined)
    },

    // ---------------- Workouts ----------------
    saveWorkout(workout: WorkoutSession): Result<WorkoutSession> {
      const d = get()
      if (!d.students.some((s) => s.id === workout.studentId)) return fail('請選擇學員')
      const existing = d.workouts.find((w) => w.id === workout.id)
      if (existing && existing.studentId !== workout.studentId && deductionFor(existing.id, d.transactions))
        return fail('已扣堂的課程無法更換學員')
      const role = actor()
      // Students can only log independent workouts for themselves.
      if (!isCoachRole(role) && workout.type !== 'independent') return fail('學員只能記錄自主練習')
      if (workout.status === 'completed') {
        const hasSet = workout.exercises.some((e) => e.sets.some((s) => s.completed))
        if (!hasSet) return fail('請至少完成一組再結束練習')
      }
      // A class holds one workout; finishing it marks the class done.
      const classId = workout.type === 'coached' ? workout.appointmentId : undefined
      if (classId) {
        const appt = d.appointments.find((a) => a.id === classId)
        if (!appt) return fail('找不到這堂課')
        if (appt.studentId !== workout.studentId) return fail('這堂課不是此學員的')
        if (appt.status === 'cancelled') return fail('這堂課已取消')
        if (d.workouts.some((w) => w.appointmentId === classId && w.id !== workout.id)) return fail('這堂課已經有上課紀錄')
      }
      const saved = { ...workout, appointmentId: classId, updatedAt: nowISO() }
      update((d) => ({
        ...d,
        workouts: existing ? d.workouts.map((w) => (w.id === saved.id ? saved : w)) : [...d.workouts, saved],
        appointments:
          classId && saved.status === 'completed'
            ? d.appointments.map((a) => (a.id === classId && a.status === 'scheduled' ? { ...a, status: 'completed' as const } : a))
            : d.appointments,
      }))
      return ok(saved)
    },

    deleteWorkout(id: ID): Result {
      const d = get()
      if (deductionFor(id, d.transactions)) return fail('此課程已扣堂，請先撤銷扣堂再刪除')
      if (isCoachRole(actor()) && d.workouts.find((w) => w.id === id)?.createdBy === 'student') return fail('這是學員自己記錄的練習，無法刪除')
      // The class is no longer logged: back on the schedule as not yet done.
      const classId = d.workouts.find((w) => w.id === id)?.appointmentId
      update((d) => ({
        ...d,
        workouts: d.workouts.filter((w) => w.id !== id),
        appointments: d.appointments.map((a) => (a.id === classId && a.status === 'completed' ? { ...a, status: 'scheduled' as const } : a)),
      }))
      return ok(undefined)
    },

    // ---------------- Session packages ----------------
    /** Deduct one coaching session for a completed coached workout. Never automatic. */
    deductSession(workoutId: ID): Result<{ packageName: string; remaining: number }> {
      const d = get()
      if (!isCoachRole(actor())) return fail('只有老師可以扣除堂數')
      const workout = d.workouts.find((w) => w.id === workoutId)
      if (!workout) return fail('找不到此上課紀錄')
      const balance = studentBalance(workout.studentId, d.packages, d.transactions)
      const blocker = deductionBlocker(workout, balance, d.transactions)
      if (blocker) return fail(blocker)
      const pkg = balance.nextPackage!
      update((d) => ({
        ...d,
        transactions: [
          ...d.transactions,
          {
            id: uid('tx'),
            packageId: pkg.pkg.id,
            studentId: workout.studentId,
            type: 'deduction',
            delta: -1,
            reason: `${workout.title} 上課扣堂`,
            workoutSessionId: workout.id,
            createdAt: nowISO(),
            createdBy: 'coach',
          },
        ],
      }))
      return ok({ packageName: pkg.pkg.name, remaining: balance.remaining - 1 })
    },

    reverseDeduction(workoutId: ID, reason: string): Result {
      const d = get()
      if (!isCoachRole(actor())) return fail('只有老師可以調整堂數')
      const tx = deductionFor(workoutId, d.transactions)
      if (!tx) return fail('此課程尚未扣堂')
      if (!reason.trim()) return fail('請輸入撤銷原因')
      update((d) => ({
        ...d,
        transactions: [
          ...d.transactions,
          {
            id: uid('tx'),
            packageId: tx.packageId,
            studentId: tx.studentId,
            type: 'reversal',
            delta: 1,
            reason: reason.trim(),
            workoutSessionId: workoutId,
            createdAt: nowISO(),
            createdBy: 'coach',
          },
        ],
      }))
      return ok(undefined)
    },

    addPackage(studentId: ID, input: PackageInput): Result<SessionPackage> {
      const first = Object.values(validatePackage(input))[0]
      if (first) return fail(first)
      if (!get().students.some((s) => s.id === studentId)) return fail('找不到此學員')
      const pkg: SessionPackage = {
        ...input,
        name: input.name.trim(),
        id: uid('pkg'),
        studentId,
        coachId: get().coach.id,
      }
      update((d) => ({ ...d, packages: [...d.packages, pkg] }))
      return ok(pkg)
    },

    updatePackage(id: ID, input: PackageInput): Result {
      const d = get()
      const pkg = d.packages.find((p) => p.id === id)
      if (!pkg) return fail('找不到方案')
      const first = Object.values(validatePackage(input))[0]
      if (first) return fail(first)
      const bal = packageBalance(pkg, d.transactions)
      if (input.totalSessions + bal.adjusted - bal.used < 0)
        return fail(`此方案已使用 ${bal.used} 堂，總堂數不可低於已使用數`)
      update((d) => ({ ...d, packages: d.packages.map((p) => (p.id === id ? { ...p, ...input, name: input.name.trim() } : p)) }))
      return ok(undefined)
    },

    deletePackage(id: ID): Result {
      const d = get()
      if (d.transactions.some((t) => t.packageId === id)) return fail('此方案已有異動紀錄，無法刪除')
      update((d) => ({ ...d, packages: d.packages.filter((p) => p.id !== id) }))
      return ok(undefined)
    },

    // ---------------- Custom exercises ----------------
    /** Teachers add moves for the whole studio. */
    addCustomExercise(input: ExerciseInput): Result<Exercise> {
      const d = get()
      if (!isCoachRole(actor())) return fail('只有老師可以新增動作')
      const first = Object.values(validateExercise(input, d.exercises))[0]
      if (first) return fail(first)
      const exercise: Exercise = {
        id: uid('cex'),
        name: input.name.trim(),
        nameEn: input.nameEn.trim(),
        muscleGroup: input.muscleGroup,
        equipment: input.equipment,
        custom: true,
      }
      update((d) => ({ ...d, exercises: [...d.exercises, exercise] }))
      return ok(exercise)
    },

    updateCustomExercise(id: ID, input: ExerciseInput): Result<Exercise> {
      const d = get()
      if (!isCoachRole(actor())) return fail('只有老師可以修改動作')
      const current = d.exercises.find((e) => e.id === id)
      if (!current?.custom) return fail('內建動作無法修改')
      const first = Object.values(validateExercise(input, d.exercises.filter((e) => e.id !== id)))[0]
      if (first) return fail(first)
      const next: Exercise = { ...current, name: input.name.trim(), nameEn: input.nameEn.trim(), muscleGroup: input.muscleGroup, equipment: input.equipment }
      update((d) => ({ ...d, exercises: d.exercises.map((e) => (e.id === id ? next : e)) }))
      return ok(next)
    },

    /** Takes a custom exercise off the picker; past workouts and plans keep showing it. */
    archiveCustomExercise(id: ID): Result {
      const d = get()
      if (!isCoachRole(actor())) return fail('只有老師可以刪除動作')
      if (!d.exercises.find((e) => e.id === id)?.custom) return fail('內建動作無法刪除')
      update((d) => ({ ...d, exercises: d.exercises.map((e) => (e.id === id ? { ...e, archived: true } : e)) }))
      return ok(undefined)
    },

    /** Replaces the signed-in coach's own quick-select options. */
    savePackagePresets(presets: PackagePreset[]): Result<PackagePreset[]> {
      if (!isCoachRole(actor())) return fail('只有老師可以設定快速選項')
      if (presets.length > MAX_PACKAGE_PRESETS) return fail(`快速選項最多 ${MAX_PACKAGE_PRESETS} 個`)
      for (const p of presets) {
        const error = validatePreset(p)
        if (error) return fail(error)
      }
      const saved = presets.map((p) => ({ name: p.name.trim(), totalSessions: p.totalSessions, priceTwd: p.priceTwd }))
      const coach = actingCoach()
      update((d) =>
        coach && d.studio
          ? { ...d, studio: { ...d.studio, coaches: d.studio.coaches.map((c) => (c.id === coach ? { ...c, packagePresets: saved } : c)) } }
          : { ...d, coach: { ...d.coach, packagePresets: saved } },
      )
      return ok(saved)
    },

    adjustPackage(packageId: ID, delta: number, reason: string): Result<number> {
      const d = get()
      if (!isCoachRole(actor())) return fail('只有老師可以調整堂數')
      const pkg = d.packages.find((p) => p.id === packageId)
      if (!pkg) return fail('找不到方案')
      if (!Number.isInteger(delta) || delta === 0) return fail('調整數量需為非 0 的整數')
      if (Math.abs(delta) > 50) return fail('單次調整不可超過 50 堂')
      if (!reason.trim()) return fail('請輸入調整原因')
      const bal = packageBalance(pkg, d.transactions)
      if (bal.remaining + delta < 0) return fail(`剩餘 ${bal.remaining} 堂，無法扣除 ${-delta} 堂（餘額不可為負）`)
      update((d) => ({
        ...d,
        transactions: [
          ...d.transactions,
          {
            id: uid('tx'),
            packageId,
            studentId: pkg.studentId,
            type: 'adjustment',
            delta,
            reason: reason.trim(),
            createdAt: nowISO(),
            createdBy: 'coach',
          },
        ],
      }))
      return ok(bal.remaining + delta)
    },
  }

  // Read-only mode (API mode, lapsed trial or plan): refuse every write up front with the reason,
  // instead of letting the server reject it after the screen already changed.
  for (const name of Object.keys(actions) as (keyof typeof actions)[]) {
    if (name === 'resetDemo') continue
    const fn = actions[name] as (...a: unknown[]) => unknown
    ;(actions as Record<string, unknown>)[name] = (...args: unknown[]) => {
      const b = get().billing
      return b && !b.writable ? fail(readOnlyMessage(b)) : fn(...args)
    }
  }
  return actions
}

export type DataActions = ReturnType<typeof createActions>
