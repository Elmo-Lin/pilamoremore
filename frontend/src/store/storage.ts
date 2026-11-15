import { compressToUTF16, decompressFromUTF16 } from 'lz-string'
import { BRAND } from '../config/brand'

export const STORAGE_KEYS = {
  data: `${BRAND.storagePrefix}:data:v1`,
  session: `${BRAND.storagePrefix}:session:v1`,
} as const

/** Offline demo: each demo workspace keeps its own data (the studio uses the original key). */
export const dataKey = (space?: 'studio' | 'solo' | 'self') => (!space || space === 'studio' ? STORAGE_KEYS.data : `${BRAND.storagePrefix}:data:${space}:v1`)

export function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeJSON(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/**
 * Demo workspaces hold months of a studio's records (several MB as JSON, near the browser's
 * storage limit), so they're stored compressed. Plain JSON from before is still read.
 */
export function parseData<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    const json = raw.startsWith('{') ? raw : decompressFromUTF16(raw)
    return json ? (JSON.parse(json) as T) : null
  } catch {
    return null
  }
}

export function readData<T>(key: string): T | null {
  try {
    return parseData<T>(localStorage.getItem(key))
  } catch {
    return null
  }
}

/** False when it didn't fit (or storage is unavailable): the demo then simply isn't kept across visits. */
export function writeData(key: string, value: unknown) {
  try {
    localStorage.setItem(key, compressToUTF16(JSON.stringify(value)))
    return true
  } catch {
    return false
  }
}
