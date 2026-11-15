// Reformer springs, written the way studios say them: "1紅1藍" = one red and one blue spring.
// Colours follow Balanced Body (the most common reformers in Taiwan): red is a full spring, green
// three quarters, blue half, yellow a quarter. Other brands differ; a studio can still pick the
// nearest setting. More springs is not always harder (on Long Stretch fewer springs is harder),
// so a setting is shown, never charted as progress.
import type { Equipment } from '../types'

export const SPRING_COLORS = [
  { key: '紅', label: '紅（重）', load: 1, color: '#d63c3c' },
  { key: '綠', label: '綠（中重）', load: 0.75, color: '#2f9e5a' },
  { key: '藍', label: '藍（中）', load: 0.5, color: '#2f6fd6' },
  { key: '黃', label: '黃（輕）', load: 0.25, color: '#e8b400' },
] as const

/** Settings offered in the picker, lightest first. */
export const SPRING_SETTINGS = [
  '1黃',
  '1藍',
  '1藍1黃',
  '1綠',
  '2藍',
  '1紅',
  '1紅1黃',
  '1紅1藍',
  '1紅1綠',
  '2紅',
  '2紅1黃',
  '2紅1藍',
  '2紅1綠',
  '3紅',
  '3紅1藍',
  '4紅',
]

/** Apparatus with springs: their moves record a spring setting with the reps. */
export const SPRUNG: ReadonlySet<Equipment> = new Set<Equipment>(['reformer', 'cadillac', 'chair'])

export const hasSprings = (equipment: Equipment | undefined) => !!equipment && SPRUNG.has(equipment)

/** "1紅1藍" → [{ color: red, count: 1 }, { color: blue, count: 1 }], for drawing the dots. */
export function parseSprings(setting: string | null | undefined) {
  if (!setting) return []
  const out: { key: string; count: number; color: string }[] = []
  for (const m of setting.matchAll(/(\d+)\s*([紅綠藍黃])/g)) {
    const c = SPRING_COLORS.find((x) => x.key === m[2])!
    out.push({ key: c.key, count: Number(m[1]), color: c.color })
  }
  return out
}
