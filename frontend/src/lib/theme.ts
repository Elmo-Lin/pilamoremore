// Light / dark appearance. "system" follows the device; a choice is kept per browser. The page
// is themed by data-theme on <html>, set before the first paint by the script in index.html.
import { useSyncExternalStore } from 'react'
import { BRAND } from '../config/brand'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = `${BRAND.storagePrefix}:theme`
const listeners = new Set<() => void>()
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && darkQuery().matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  // The browser bar / status bar takes the page colour.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0a0b' : '#f6f0ed')
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    /* private mode: applies to this visit only */
  }
  apply(pref)
  listeners.forEach((l) => l())
}

/** Keeps following the device while on "system" (e.g. it turns dark at sunset). */
export function watchSystemTheme() {
  darkQuery().addEventListener('change', () => {
    if (readThemePref() === 'system') apply('system')
  })
}

export function useThemePref() {
  return useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, readThemePref)
}
