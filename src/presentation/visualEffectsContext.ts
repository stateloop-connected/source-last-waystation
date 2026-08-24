import { createContext } from 'react'
import type { GameState } from '../core'
import type {
  ExpeditionReturnedVisualEvent,
  GameTransitionSource,
  GameTransitionSummary,
  ProgressSummaryVisualEvent,
  VisualEvent,
} from './visual-events'

export type VisualEffectsContextValue = {
  events: readonly VisualEvent[]
  returnSummary: ExpeditionReturnedVisualEvent | null
  progressSummary: ProgressSummaryVisualEvent | null
  isPageVisible: boolean
  presentTransition: (
    previous: GameState,
    next: GameState,
    source: GameTransitionSource,
    transitionSummary?: GameTransitionSummary,
  ) => void
  presentBootstrapSummary: (
    summary: GameTransitionSummary,
    transitionKey: string,
  ) => void
  dismissEvent: (eventId: string) => void
  dismissReturnSummary: () => void
  dismissProgressSummary: () => void
}

export const VisualEffectsContext =
  createContext<VisualEffectsContextValue | null>(null)
