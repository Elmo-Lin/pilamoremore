// Read-outs from completed sessions: goals, body-area balance and the monthly recap.
// Like the rest of the stats, everything counts completed sets only.
import type { Exercise, Goal, ID, ISODate, MuscleGroup, WorkoutSession } from '../types'
import { MUSCLE_LABEL } from './format'
import { exerciseSeries, workoutDate, workoutVolume } from './stats'

const DAY = 86400000

/** A set that was done: ticked off with at least one rep. */
const doneSets = (w: WorkoutSession, exerciseId?: ID) =>
  w.exercises.filter((e) => !exerciseId || e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((s) => s.completed && (s.reps ?? 0) > 0))

// ------------------------------------------------------------------------------------- goals

export interface GoalProgress {
  /** Most reps done in one set of the move, ever. */
  best: number
  /** best / target, at most 1. */
  ratio: number
  /** The workout where the target was first reached. */
  reachedAt?: ISODate
  /** When the recent trend would get there; absent without a rising trend (or beyond a year). */
  eta?: Date
}

/** Trend from the last 12 weeks: a straight line through each session's best set (most reps). */
const TREND_WEEKS = 12

export function goalProgress(goal: Goal, workouts: WorkoutSession[], now = Date.now()): GoalProgress {
  const series = exerciseSeries(workouts, goal.exerciseId)
  const best = series.reduce((m, p) => Math.max(m, p.topReps), 0)
  const reached = series.find((p) => p.topReps >= goal.targetReps)
  if (reached) return { best, ratio: 1, reachedAt: reached.date }

  const recent = series.filter((p) => new Date(p.date).getTime() >= now - TREND_WEEKS * 7 * DAY)
  let eta: Date | undefined
  if (recent.length >= 3) {
    const xs = recent.map((p) => new Date(p.date).getTime() / DAY)
    const ys = recent.map((p) => p.topReps)
    const mx = xs.reduce((a, b) => a + b) / xs.length
    const my = ys.reduce((a, b) => a + b) / ys.length
    const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
    const slope = sxx && xs.at(-1)! - xs[0] >= 14 ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx : 0
    if (slope > 0) {
      const today = now / DAY
      const days = (goal.targetReps - (my + slope * (today - mx))) / slope
      if (days <= 365) eta = new Date(now + Math.max(days, 7) * DAY)
    }
  }
  return { best, ratio: Math.min(1, best / goal.targetReps), eta }
}

// ---------------------------------------------------------------------------- muscle balance

export interface MuscleBalance {
  /** Sets per muscle group in the last 7 days, most first (groups trained in the last 8 weeks, plus any this week). */
  week: { group: MuscleGroup; sets: number }[]
  /** Suggestions in plain words, most useful first; empty when nothing stands out. */
  notes: string[]
}

const PUSH: MuscleGroup[] = ['chest', 'shoulders']
const PULL: MuscleGroup[] = ['back']
const LOWER: MuscleGroup[] = ['legs', 'glutes']
const UPPER: MuscleGroup[] = ['chest', 'back', 'shoulders', 'arms']
/** A group left this long while the rest is trained is worth a mention. */
const NEGLECT_DAYS = 10

export function muscleBalance(workouts: WorkoutSession[], exercises: Map<ID, Exercise>, now = Date.now()): MuscleBalance {
  const setsSince = (since: number) => {
    const by = new Map<MuscleGroup, number>()
    for (const w of workouts) {
      if (w.status !== 'completed' || new Date(workoutDate(w)).getTime() < since) continue
      for (const e of w.exercises) {
        const group = exercises.get(e.exerciseId)?.muscleGroup
        if (!group) continue
        const n = e.sets.filter((s) => s.completed && (s.reps ?? 0) > 0).length
        if (n) by.set(group, (by.get(group) ?? 0) + n)
      }
    }
    return by
  }
  const week = setsSince(now - 7 * DAY)
  const month = setsSince(now - 28 * DAY)
  const usual = setsSince(now - 56 * DAY)
  const sum = (m: Map<MuscleGroup, number>, groups: MuscleGroup[]) => groups.reduce((s, g) => s + (m.get(g) ?? 0), 0)

  const notes: string[] = []
  // Left out lately, while still training: only groups this person normally trains.
  const lately = setsSince(now - NEGLECT_DAYS * DAY)
  if (lately.size) {
    const last = new Map<MuscleGroup, number>()
    for (const w of workouts) {
      if (w.status !== 'completed') continue
      const t = new Date(workoutDate(w)).getTime()
      for (const e of w.exercises) {
        const group = exercises.get(e.exerciseId)?.muscleGroup
        if (group && e.sets.some((s) => s.completed) && t > (last.get(group) ?? 0)) last.set(group, t)
      }
    }
    for (const group of [...usual.keys()].filter((g) => !lately.has(g) && g !== 'core')) {
      const days = Math.floor((now - (last.get(group) ?? now)) / DAY)
      notes.push(`${MUSCLE_LABEL[group]}已經 ${days} 天沒練了`)
    }
  }
  const push = sum(month, PUSH)
  const pull = sum(month, PULL)
  if (push >= 6 && push >= pull * 2) {
    notes.push(`近 4 週推的動作（胸、肩）有 ${push} 組，拉的動作（背）只有 ${pull} 組，可以多安排胸部擴展、俯臥拉繩等背部動作，肩膀也比較不容易緊繃`)
  } else if (pull >= 6 && pull >= push * 2) {
    notes.push(`近 4 週拉的動作（背）有 ${pull} 組，推的動作（胸、肩）只有 ${push} 組，可以多安排長伸展、皮拉提斯伏地挺身`)
  }
  const lower = sum(month, LOWER)
  const upper = sum(month, UPPER)
  if (upper >= 12 && lower * 3 < upper) notes.push(`近 4 週下半身（腿、臀）只有 ${lower} 組，上半身有 ${upper} 組，可以多安排腳步運動、橋式或側踢系列`)

  const groups = new Set<MuscleGroup>([...usual.keys(), ...week.keys()])
  return {
    week: [...groups].map((group) => ({ group, sets: week.get(group) ?? 0 })).sort((a, b) => b.sets - a.sets),
    notes,
  }
}

// ----------------------------------------------------------------------------- monthly recap

export interface MonthRecap {
  year: number
  /** 0–11. */
  month: number
  workouts: number
  /** Same count for the month before, for the comparison line. */
  previousWorkouts: number
  volume: number
  sets: number
  /** Days with at least one workout. */
  days: number
  /** Heavier than ever before, set this month: the best of each exercise. */
  records: { exerciseId: ID; reps: number; springs: string | null }[]
  /** The muscle group with the most sets. */
  topGroup?: MuscleGroup
  /** The exercise done most often. */
  topExerciseId?: ID
  /** Cardio done in the month. */
  cardioSec: number
  cardioKm: number
}

export function monthRecap(workouts: WorkoutSession[], exercises: Map<ID, Exercise>, year: number, month: number): MonthRecap {
  const start = new Date(year, month, 1).getTime()
  const end = new Date(year, month + 1, 1).getTime()
  const prevStart = new Date(year, month - 1, 1).getTime()
  const done = workouts.filter((w) => w.status === 'completed')
  const at = (w: WorkoutSession) => new Date(workoutDate(w)).getTime()
  const inMonth = done.filter((w) => at(w) >= start && at(w) < end)

  let cardioSec = 0
  let cardioKm = 0
  for (const w of inMonth)
    for (const e of w.exercises)
      for (const s of e.sets)
        if (s.completed && (s.durationSec ?? 0) > 0) {
          cardioSec += s.durationSec!
          cardioKm += s.distanceKm ?? 0
        }

  const groupSets = new Map<MuscleGroup, number>()
  const exerciseCount = new Map<ID, number>()
  let sets = 0
  for (const w of inMonth) {
    const n = doneSets(w).length
    sets += n
    for (const e of w.exercises) {
      const k = e.sets.filter((s) => s.completed && (s.reps ?? 0) > 0).length
      if (!k) continue
      exerciseCount.set(e.exerciseId, (exerciseCount.get(e.exerciseId) ?? 0) + 1)
      const group = exercises.get(e.exerciseId)?.muscleGroup
      if (group) groupSets.set(group, (groupSets.get(group) ?? 0) + k)
    }
  }

  const records: MonthRecap['records'] = []
  for (const exerciseId of exerciseCount.keys()) {
    let before = 0
    let top: MonthRecap['records'][number] | null = null
    for (const p of exerciseSeries(done, exerciseId)) {
      const t = new Date(p.date).getTime()
      if (t < start) before = Math.max(before, p.topReps)
      else if (t < end && before > 0 && p.topReps > before && (!top || p.topReps > top.reps)) top = { exerciseId, reps: p.topReps, springs: p.springs }
    }
    if (top) records.push(top)
  }
  const most = <K,>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

  return {
    year,
    month,
    workouts: inMonth.length,
    previousWorkouts: done.filter((w) => at(w) >= prevStart && at(w) < start).length,
    volume: inMonth.reduce((s, w) => s + workoutVolume(w), 0),
    sets,
    days: new Set(inMonth.map((w) => new Date(workoutDate(w)).toDateString())).size,
    records: records.sort((a, b) => b.reps - a.reps),
    topGroup: most(groupSets),
    topExerciseId: most(exerciseCount),
    cardioSec,
    cardioKm: Math.round(cardioKm * 100) / 100,
  }
}
