import type { GameState } from '../core'
import {
  deriveVisualEvents,
  type VisualEvent,
} from './visual-events'

export type BackgroundTransition = {
  previous: GameState
  next: GameState
}

export function accumulateBackgroundTransition(
  current: BackgroundTransition | null,
  previous: GameState,
  next: GameState,
): BackgroundTransition | null {
  return {
    previous: current?.previous ?? previous,
    next,
  }
}

export function deriveBackgroundVisualEvents(
  transition: BackgroundTransition | null,
): VisualEvent[] {
  return transition === null
    ? []
    : deriveVisualEvents(
        transition.previous,
        transition.next,
        'backgroundRecovery',
      )
}
