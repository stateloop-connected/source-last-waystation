import type { GameState } from '../core'
import type { GameNotice } from './gameContext'

export type GameAppState = {
  game: GameState
  now: number
  lastSavedAt: number | null
  saveMessage: string
  notice: GameNotice | null
  persistenceStatus: 'active' | 'quarantined'
}

export type GameAppAction =
  | {
      type: 'set-game'
      game: GameState
      now: number
      notice?: GameNotice
      persistenceStatus?: GameAppState['persistenceStatus']
    }
  | { type: 'save-status'; savedAt: number | null; message: string }
  | { type: 'notify'; notice: GameNotice }
  | { type: 'clear-notice'; id: number }

export function gameReducer(
  state: GameAppState,
  action: GameAppAction,
): GameAppState {
  switch (action.type) {
    case 'set-game':
      return {
        ...state,
        game: action.game,
        now: action.now,
        ...(action.notice === undefined ? {} : { notice: action.notice }),
        ...(action.persistenceStatus === undefined
          ? {}
          : { persistenceStatus: action.persistenceStatus }),
      }
    case 'save-status':
      return {
        ...state,
        lastSavedAt: action.savedAt,
        saveMessage: action.message,
      }
    case 'notify':
      return { ...state, notice: action.notice }
    case 'clear-notice':
      return state.notice?.id === action.id
        ? { ...state, notice: null }
        : state
  }
}
