import type { Muscle, MuscleTargets } from '../../lib/muscles'

/** One piece of the figure: a muscle, or (null) a part that is never lit, like the head. */
type Shape =
  | { m: Muscle | null; e: [cx: number, cy: number, rx: number, ry: number] }
  | { m: Muscle | null; r: [x: number, y: number, w: number, h: number, radius: number] }
  | { m: Muscle | null; d: string }

/** Both sides of a pair, mirrored around the figure's middle (x = 20). */
const pair = (m: Muscle | null, cx: number, cy: number, rx: number, ry: number): Shape[] => [
  { m, e: [cx, cy, rx, ry] },
  { m, e: [40 - cx, cy, rx, ry] },
]

const HEAD: Shape[] = [
  { m: null, e: [20, 6.5, 4.5, 4.5] },
  { m: null, r: [18, 10.5, 4, 3.5, 0] },
]
const HANDS_FEET: Shape[] = [...pair(null, 8.2, 42, 1.8, 1.8), ...pair(null, 16, 79.2, 2.2, 1.3)]

/** Front and back, each 40 wide in an 84 × 82 box; keep in sync with ios MuscleMapView. */
const FRONT: Shape[] = [
  ...HEAD,
  { m: 'traps', d: 'M15 14.5L18.2 12V15.2Z' },
  { m: 'traps', d: 'M25 14.5L21.8 12V15.2Z' },
  ...pair('delts', 12, 17.5, 3.6, 3.8),
  { m: 'chest', d: 'M19.4 14.5C16 14.5 14.6 15.5 14.6 18V21.5C15.6 23.5 18 24 19.4 23.4Z' },
  { m: 'chest', d: 'M20.6 14.5C24 14.5 25.4 15.5 25.4 18V21.5C24.4 23.5 22 24 20.6 23.4Z' },
  ...pair('biceps', 10.3, 25, 2.4, 4.6),
  ...pair('forearms', 8.8, 35, 2, 5),
  { m: 'obliques', r: [14.6, 24, 2.2, 12.5, 1.1] },
  { m: 'obliques', r: [23.2, 24, 2.2, 12.5, 1.1] },
  { m: 'abs', r: [17, 24.6, 6, 13, 2] },
  { m: null, d: 'M15 38.2H25L24 42L20 44L16 42Z' },
  ...pair('quads', 16.5, 52, 3.6, 9),
  ...pair(null, 16.4, 62.6, 2, 2),
  ...pair('calves', 16.2, 71, 2.2, 6.4),
  ...HANDS_FEET,
]

const BACK: Shape[] = [
  ...HEAD,
  { m: 'lats', d: 'M15 19C14.6 24 15.5 29 18.2 33H19.6V24Z' },
  { m: 'lats', d: 'M25 19C25.4 24 24.5 29 21.8 33H20.4V24Z' },
  { m: 'traps', d: 'M20 11.5L14 16L20 27L26 16Z' },
  ...pair('rearDelts', 12, 17.5, 3.6, 3.8),
  ...pair('triceps', 10.3, 25, 2.4, 4.6),
  ...pair('forearms', 8.8, 35, 2, 5),
  { m: 'lowerBack', r: [17.4, 32.4, 5.2, 6.4, 1.6] },
  ...pair('glutes', 17, 43.2, 3.4, 4),
  ...pair('hamstrings', 16.6, 54.6, 3.3, 7),
  ...pair('calves', 16.2, 69.4, 2.6, 6.2),
  ...HANDS_FEET,
]

function Figure({ shapes, fill }: { shapes: Shape[]; fill: (m: Muscle | null) => string }) {
  return shapes.map((s, i) =>
    'e' in s ? (
      <ellipse key={i} cx={s.e[0]} cy={s.e[1]} rx={s.e[2]} ry={s.e[3]} className={fill(s.m)} />
    ) : 'r' in s ? (
      <rect key={i} x={s.r[0]} y={s.r[1]} width={s.r[2]} height={s.r[3]} rx={s.r[4]} className={fill(s.m)} />
    ) : (
      <path key={i} d={s.d} className={fill(s.m)} />
    ),
  )
}

/**
 * Front and back of a figure with the muscles an exercise works lit up: the main movers in the
 * accent, the helpers lighter. Sits on a canvas-coloured tile (the outlines are that colour).
 */
export function MuscleMap({ targets, className }: { targets: MuscleTargets; className?: string }) {
  const fill = (m: Muscle | null) =>
    m === null
      ? 'fill-muscle-rest'
      : targets.primary.includes(m)
        ? 'fill-accent-600'
        : targets.secondary.includes(m)
          ? 'fill-muscle-secondary'
          : 'fill-muscle-idle'
  return (
    <svg aria-hidden viewBox="0 0 84 82" className={className}>
      <g className="stroke-canvas" strokeWidth={0.6}>
        <Figure shapes={FRONT} fill={fill} />
      </g>
      <g transform="translate(44 0)" className="stroke-canvas" strokeWidth={0.6}>
        <Figure shapes={BACK} fill={fill} />
      </g>
    </svg>
  )
}
