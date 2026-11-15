import type { ID } from '../types'
import { uid } from './id'

/**
 * Supersets: consecutive exercises sharing a `supersetId` are done back to back, resting only
 * after the round. Plans and workouts store them the same way; a lone exercise has no id.
 * The list is a run of blocks (a lone exercise, or a whole superset) that move as one.
 */
interface Grouped {
  supersetId?: ID
}

export interface SupersetSlot {
  /** "A" for the first superset of the list, "B" for the next… */
  letter: string
  /** 1-based place inside its superset. */
  position: number
  size: number
}

const letter = (n: number) => (n < 26 ? String.fromCharCode(65 + n) : String(n + 1))

/** A new superset id, shared by the exercises added together. */
export const newSupersetId = () => uid('ss')

/** [start, end) of the block holding item i. */
export function blockAt(list: Grouped[], i: number): [number, number] {
  const id = list[i]?.supersetId
  if (!id) return [i, i + 1]
  let start = i
  let end = i + 1
  while (start > 0 && list[start - 1].supersetId === id) start--
  while (end < list.length && list[end].supersetId === id) end++
  return [start, end]
}

/** Each exercise's place in its superset, or null when it is done on its own. */
export function supersetSlots(list: Grouped[]): (SupersetSlot | null)[] {
  const slots: (SupersetSlot | null)[] = list.map(() => null)
  let groups = 0
  for (let i = 0; i < list.length; ) {
    const [start, end] = blockAt(list, i)
    if (end - start > 1) {
      const l = letter(groups++)
      for (let j = start; j < end; j++) slots[j] = { letter: l, position: j - start + 1, size: end - start }
    }
    i = end
  }
  return slots
}

/** After removing exercises: drop ids left on a single exercise, split ids that ended up apart. */
export function normalizeSupersets<T extends Grouped>(list: T[]): T[] {
  const seen = new Set<ID>()
  const out = [...list]
  for (let i = 0; i < out.length; ) {
    const [start, end] = blockAt(out, i)
    const id = out[start].supersetId
    if (id) {
      const next = end - start < 2 ? undefined : seen.has(id) ? newSupersetId() : id
      if (next) seen.add(next)
      for (let j = start; j < end; j++) if (next !== id) out[j] = { ...out[j], supersetId: next }
    }
    i = end
  }
  return out
}

/** Whether the block holding item i can move one block up (-1) or down (1). */
export function canMoveBlock(list: Grouped[], i: number, dir: -1 | 1) {
  const [start, end] = blockAt(list, i)
  return dir === -1 ? start > 0 : end < list.length
}

/** Moves the block holding item i past the neighbouring block, whole supersets included. */
export function moveBlock<T extends Grouped>(list: T[], i: number, dir: -1 | 1): T[] {
  if (!canMoveBlock(list, i, dir)) return list
  const [start, end] = blockAt(list, i)
  const [nStart, nEnd] = dir === -1 ? blockAt(list, start - 1) : blockAt(list, end)
  const [a, b] = dir === -1 ? [[nStart, nEnd], [start, end]] : [[start, end], [nStart, nEnd]]
  return [...list.slice(0, a[0]), ...list.slice(b[0], b[1]), ...list.slice(a[0], a[1]), ...list.slice(b[1])]
}

/** Inside a superset, an exercise trades places with its neighbour; it never leaves the superset. */
export function canMoveWithin(list: Grouped[], i: number, dir: -1 | 1) {
  const id = list[i]?.supersetId
  return !!id && list[i + dir]?.supersetId === id
}

export function moveWithin<T extends Grouped>(list: T[], i: number, dir: -1 | 1): T[] {
  if (!canMoveWithin(list, i, dir)) return list
  const out = [...list]
  ;[out[i], out[i + dir]] = [out[i + dir], out[i]]
  return out
}

/** Up/down for one exercise: within its superset, or past the next block when it is on its own. */
export const canMoveItem = (list: Grouped[], i: number, dir: -1 | 1) =>
  list[i]?.supersetId && blockAt(list, i)[1] - blockAt(list, i)[0] > 1 ? canMoveWithin(list, i, dir) : canMoveBlock(list, i, dir)

export const moveItem = <T extends Grouped>(list: T[], i: number, dir: -1 | 1): T[] =>
  list[i]?.supersetId && blockAt(list, i)[1] - blockAt(list, i)[0] > 1 ? moveWithin(list, i, dir) : moveBlock(list, i, dir)

/** Splits the superset holding item i back into single exercises. */
export function breakSuperset<T extends Grouped>(list: T[], i: number): T[] {
  const [start, end] = blockAt(list, i)
  return list.map((e, j) => (j >= start && j < end ? { ...e, supersetId: undefined } : e))
}
