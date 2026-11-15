// Practice statistics for Pilates. Conventions:
// - A set counts once it is ticked off with reps; springs are recorded but never charted as
//   progress (more springs is not always harder, e.g. Long Stretch is harder on fewer).
// - Volume = Σ completed reps (cardio, logged as time, never counts).
// - "Top set" = the set with the most reps in a workout; its springs are shown alongside.
import type { ExerciseLog, ID, SetLog, WorkoutSession } from '../types'
import { duration, km, startOfWeek } from './format'

export const completedSets = (sets: SetLog[]) => sets.filter((s) => s.completed && s.reps != null && s.reps > 0)

/** Done with something to show for it: reps, or (cardio) a time. */
const loggedSets = (sets: SetLog[]) => sets.filter((s) => s.completed && ((s.reps ?? 0) > 0 || (s.durationSec ?? 0) > 0))

export function setVolume(s: SetLog) {
  return s.reps ?? 0
}

export function exerciseVolume(log: ExerciseLog) {
  return completedSets(log.sets).reduce((sum, s) => sum + setVolume(s), 0)
}

/** Total reps in a workout. */
export function workoutVolume(w: WorkoutSession) {
  return w.exercises.reduce((sum, e) => sum + exerciseVolume(e), 0)
}

export function workoutSetCount(w: WorkoutSession) {
  return w.exercises.reduce((n, e) => n + completedSets(e.sets).length, 0)
}

export function topSet(log: ExerciseLog): SetLog | null {
  const sets = completedSets(log.sets)
  if (!sets.length) return null
  return sets.reduce((best, s) => ((s.reps ?? 0) > (best.reps ?? 0) ? s : best))
}

export const completedWorkouts = (workouts: WorkoutSession[], studentId?: ID) =>
  workouts
    .filter((w) => w.status === 'completed' && (!studentId || w.studentId === studentId))
    .sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt))

export const workoutDate = (w: WorkoutSession) => w.completedAt ?? w.startedAt

export interface ExercisePoint {
  date: string
  workoutId: ID
  /** Most reps in one set that day. */
  topReps: number
  /** Springs used for that set (null off the springs). */
  springs: string | null
  /** Reps over all of the day's sets. */
  volume: number
  sets: number
}

/** Per-workout series for one move, oldest first. */
export function exerciseSeries(workouts: WorkoutSession[], exerciseId: ID): ExercisePoint[] {
  const points: ExercisePoint[] = []
  for (const w of workouts) {
    if (w.status !== 'completed') continue
    const logs = w.exercises.filter((e) => e.exerciseId === exerciseId)
    if (!logs.length) continue
    let top: SetLog | null = null
    let volume = 0
    let sets = 0
    for (const log of logs) {
      const t = topSet(log)
      if (t && (!top || (t.reps ?? 0) > (top.reps ?? 0))) top = t
      volume += exerciseVolume(log)
      sets += completedSets(log.sets).length
    }
    if (!top) continue
    points.push({ date: workoutDate(w), workoutId: w.id, topReps: top.reps ?? 0, springs: top.springs ?? null, volume, sets })
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}

/** Where someone stands on a move: the most reps they've done, and what they did last time. */
export interface PersonalRecord {
  exerciseId: ID
  maxReps: number
  maxRepsDate: string
  /** Springs on the most recent session (what to set up next time). */
  lastSprings: string | null
  lastDate: string
  /** Sessions this move was practised in. */
  sessions: number
}

export function personalRecords(workouts: WorkoutSession[]): PersonalRecord[] {
  const ids = new Set<ID>()
  workouts.forEach((w) => w.status === 'completed' && w.exercises.forEach((e) => ids.add(e.exerciseId)))
  const prs: PersonalRecord[] = []
  for (const id of ids) {
    const series = exerciseSeries(workouts, id)
    if (!series.length) continue
    const top = series.reduce((b, p) => (p.topReps >= b.topReps ? p : b))
    const last = series[series.length - 1]
    prs.push({ exerciseId: id, maxReps: top.topReps, maxRepsDate: top.date, lastSprings: last.springs, lastDate: last.date, sessions: series.length })
  }
  return prs.sort((a, b) => b.sessions - a.sessions || b.lastDate.localeCompare(a.lastDate))
}

export interface WeekBucket {
  weekStart: string
  label: string
  coached: number
  independent: number
  volume: number
}

/** Weekly buckets covering the last `weeks` weeks, including empty weeks. */
export function weeklyBuckets(workouts: WorkoutSession[], weeks: number, now = new Date()): WeekBucket[] {
  const current = startOfWeek(now)
  const buckets: WeekBucket[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(current)
    ws.setDate(ws.getDate() - i * 7)
    buckets.push({
      weekStart: ws.toISOString(),
      label: `${ws.getMonth() + 1}/${ws.getDate()}`,
      coached: 0,
      independent: 0,
      volume: 0,
    })
  }
  const index = new Map(buckets.map((b, i) => [startOfWeek(b.weekStart).getTime(), i]))
  for (const w of workouts) {
    if (w.status !== 'completed') continue
    const i = index.get(startOfWeek(workoutDate(w)).getTime())
    if (i == null) continue
    buckets[i][w.type] += 1
    buckets[i].volume += workoutVolume(w)
  }
  return buckets
}

/** Share of the last N weeks with at least `target` sessions. */
export function consistency(buckets: WeekBucket[], target: number) {
  if (!buckets.length) return 0
  const hit = buckets.filter((b) => b.coached + b.independent >= target).length
  return hit / buckets.length
}

/** Most recent completed log for a move before a given time. */
export function lastExerciseLog(
  workouts: WorkoutSession[],
  studentId: ID,
  exerciseId: ID,
  excludeWorkoutId?: ID,
): { log: ExerciseLog; workout: WorkoutSession } | null {
  const list = completedWorkouts(workouts, studentId)
  for (const w of list) {
    if (w.id === excludeWorkoutId) continue
    const log = w.exercises.find((e) => e.exerciseId === exerciseId && loggedSets(e.sets).length)
    if (log) return { log, workout: w }
  }
  return null
}

/** Sessions since `sinceISO` where a move was done for more reps than ever before. */
export function recentPRs(workouts: WorkoutSession[], sinceISO: string) {
  const ids = new Set<ID>()
  workouts.forEach((w) => w.status === 'completed' && w.exercises.forEach((e) => ids.add(e.exerciseId)))
  const hits: { exerciseId: ID; reps: number; springs: string | null; previous: number; date: string }[] = []
  for (const id of ids) {
    let best = -Infinity
    let latestHit: (typeof hits)[number] | null = null
    for (const p of exerciseSeries(workouts, id)) {
      if (p.topReps > best) {
        if (best > 0 && p.date >= sinceISO) latestHit = { exerciseId: id, reps: p.topReps, springs: p.springs, previous: best, date: p.date }
        best = p.topReps
      }
    }
    if (latestHit) hits.push(latestHit)
  }
  return hits.sort((a, b) => b.date.localeCompare(a.date))
}

/** Consecutive weeks (ending this or last week) with at least one session. */
export function weekStreak(workouts: WorkoutSession[], now = new Date()) {
  const buckets = weeklyBuckets(workouts, 52, now)
  let i = buckets.length - 1
  if (buckets[i].coached + buckets[i].independent === 0) i-- // current week may still be in progress
  let streak = 0
  for (; i >= 0 && buckets[i].coached + buckets[i].independent > 0; i--) streak++
  return streak
}

/** One set as written in records: "1紅1藍 × 10", or "10 下" off the springs. */
export const describeSet = (s: Pick<SetLog, 'springs' | 'reps'>) => (s.springs ? `${s.springs} × ${s.reps}` : `${s.reps} 下`)

export function summarizeSets(log: ExerciseLog, max = 4) {
  // Cardio: "30 分鐘・5 km" per bout.
  const bouts = log.sets.filter((s) => s.completed && (s.durationSec ?? 0) > 0)
  if (bouts.length) return bouts.slice(0, max).map((s) => [duration(s.durationSec!), s.distanceKm ? km(s.distanceKm) : ''].filter(Boolean).join('・')).join('、')
  const sets = completedSets(log.sets)
  const parts = sets.slice(0, max).map(describeSet)
  if (sets.length > max) parts.push(`+${sets.length - max}`)
  return parts.join('、')
}
