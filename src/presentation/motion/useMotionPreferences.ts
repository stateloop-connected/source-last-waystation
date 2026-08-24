import { useContext } from 'react'
import {
  MotionPreferencesContext,
  type MotionPreferencesContextValue,
} from './motionPreferencesContext'

export function useMotionPreferences(): MotionPreferencesContextValue {
  const context = useContext(MotionPreferencesContext)
  if (context === null) {
    throw new Error(
      'useMotionPreferences 必须在 MotionPreferencesProvider 内使用。',
    )
  }

  return context
}
