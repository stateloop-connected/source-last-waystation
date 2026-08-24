import { createContext } from 'react'
import type {
  EffectiveMotion,
  MotionPreference,
} from './motionPreferences'

export type MotionPreferencesContextValue = {
  preference: MotionPreference
  effectiveMotion: EffectiveMotion
  setPreference: (preference: MotionPreference) => void
}

export const MotionPreferencesContext =
  createContext<MotionPreferencesContextValue | null>(null)
