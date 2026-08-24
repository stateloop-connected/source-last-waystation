import type { GameState } from '../core'

export function addDebugWood(state: GameState, now: number): GameState {
  return {
    ...state,
    updatedAt: Math.max(state.updatedAt, now),
    resources: {
      ...state.resources,
      wood: state.resources.wood + 20,
    },
  }
}
