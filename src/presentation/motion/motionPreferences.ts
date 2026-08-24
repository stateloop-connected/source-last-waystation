export const MOTION_PREFERENCES_STORAGE_KEY =
  'last-waystation.ui-preferences.v1'

export const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'

export type MotionPreference = 'system' | 'full' | 'reduced' | 'off'

export type EffectiveMotion = Exclude<MotionPreference, 'system'>

export interface MotionPreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

type StoredMotionPreferences = {
  motion: MotionPreference
}

export function isMotionPreference(value: unknown): value is MotionPreference {
  return (
    value === 'system' ||
    value === 'full' ||
    value === 'reduced' ||
    value === 'off'
  )
}

export function parseMotionPreference(storedValue: string | null): MotionPreference {
  if (storedValue === null) {
    return 'system'
  }

  try {
    const parsed: unknown = JSON.parse(storedValue)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'motion' in parsed &&
      isMotionPreference(parsed.motion)
    ) {
      return parsed.motion
    }
  } catch {
    // Invalid preferences are equivalent to having no saved preference.
  }

  return 'system'
}

export function serializeMotionPreference(
  preference: MotionPreference,
): string {
  const stored: StoredMotionPreferences = { motion: preference }
  return JSON.stringify(stored)
}

function browserStorage(): MotionPreferenceStorage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadMotionPreference(
  storage: MotionPreferenceStorage | null = browserStorage(),
): MotionPreference {
  if (storage === null) {
    return 'system'
  }

  try {
    return parseMotionPreference(
      storage.getItem(MOTION_PREFERENCES_STORAGE_KEY),
    )
  } catch {
    return 'system'
  }
}

export function saveMotionPreference(
  preference: MotionPreference,
  storage: MotionPreferenceStorage | null = browserStorage(),
): boolean {
  if (storage === null) {
    return false
  }

  try {
    storage.setItem(
      MOTION_PREFERENCES_STORAGE_KEY,
      serializeMotionPreference(preference),
    )
    return true
  } catch {
    return false
  }
}

export function resolveMotionPreference(
  preference: MotionPreference,
  systemPrefersReducedMotion: boolean,
): EffectiveMotion {
  if (preference === 'system') {
    return systemPrefersReducedMotion ? 'reduced' : 'full'
  }

  return preference
}
