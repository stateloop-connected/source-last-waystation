import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react'
import {
  REDUCED_MOTION_MEDIA_QUERY,
  loadMotionPreference,
  resolveMotionPreference,
  saveMotionPreference,
  type MotionPreference,
} from './motionPreferences'
import {
  MotionPreferencesContext,
  type MotionPreferencesContextValue,
} from './motionPreferencesContext'

function systemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches
}

function subscribeToReducedMotion(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined
  }

  const mediaQuery = window.matchMedia(REDUCED_MOTION_MEDIA_QUERY)
  mediaQuery.addEventListener('change', onStoreChange)
  return () => {
    mediaQuery.removeEventListener('change', onStoreChange)
  }
}

export function MotionPreferencesProvider({
  children,
}: PropsWithChildren) {
  const [preference, setStoredPreference] = useState(loadMotionPreference)
  const systemReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    systemPrefersReducedMotion,
    () => false,
  )

  const setPreference = useCallback((nextPreference: MotionPreference) => {
    setStoredPreference(nextPreference)
    saveMotionPreference(nextPreference)
  }, [])

  const effectiveMotion = resolveMotionPreference(
    preference,
    systemReducedMotion,
  )

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const root = document.documentElement
    const previousMotion = root.getAttribute('data-motion')
    const previousPreference = root.getAttribute('data-motion-preference')
    root.dataset.motion = effectiveMotion
    root.dataset.motionPreference = preference

    return () => {
      if (previousMotion === null) {
        root.removeAttribute('data-motion')
      } else {
        root.setAttribute('data-motion', previousMotion)
      }

      if (previousPreference === null) {
        root.removeAttribute('data-motion-preference')
      } else {
        root.setAttribute('data-motion-preference', previousPreference)
      }
    }
  }, [effectiveMotion, preference])

  const value = useMemo<MotionPreferencesContextValue>(
    () => ({ preference, effectiveMotion, setPreference }),
    [effectiveMotion, preference, setPreference],
  )

  return (
    <MotionPreferencesContext.Provider value={value}>
      <div
        className="motion-root"
        data-motion={effectiveMotion}
        data-motion-preference={preference}
      >
        {children}
      </div>
    </MotionPreferencesContext.Provider>
  )
}
