import { parseSprings } from '../../lib/springs'

/** A spring setting as coloured dots, one per spring: "1紅1藍" → ● ●. */
export function SpringDots({ setting, faded = false }: { setting: string | null | undefined; faded?: boolean }) {
  const springs = parseSprings(setting)
  if (!springs.length) return null
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center gap-0.5 ${faded ? 'opacity-40' : ''}`}>
      {springs.flatMap((sp) => Array.from({ length: sp.count }, (_, i) => <span key={`${sp.key}${i}`} className="size-2 rounded-full" style={{ background: sp.color }} />))}
    </span>
  )
}
