import { useContext } from 'react'
import {
  VisualEffectsContext,
  type VisualEffectsContextValue,
} from './visualEffectsContext'

export function useVisualEffects(): VisualEffectsContextValue {
  const context = useContext(VisualEffectsContext)
  if (context === null) {
    throw new Error(
      'useVisualEffects 必须在 VisualEffectsProvider 内使用。',
    )
  }
  return context
}
