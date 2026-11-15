import { setThemePref, useThemePref, type ThemePref } from '../../lib/theme'
import { Segmented } from '../ui/Form'

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: '跟隨系統' },
  { value: 'light', label: '淺色' },
  { value: 'dark', label: '深色' },
]

/** Light, dark, or whatever the device uses. */
export function AppearancePicker() {
  const pref = useThemePref()
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[15px] text-ink-900">外觀</span>
      <Segmented label="外觀" value={pref} onChange={setThemePref} options={OPTIONS} />
    </div>
  )
}
