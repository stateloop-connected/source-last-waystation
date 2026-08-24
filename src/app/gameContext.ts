import { createContext } from 'react'
import type { ExpeditionPolicy, GameState } from '../core'

export type NoticeTone = 'success' | 'error' | 'info'

export type GameNotice = {
  id: number
  message: string
  tone: NoticeTone
}

export type GameContextValue = {
  game: GameState
  now: number
  lastSavedAt: number | null
  saveMessage: string
  notice: GameNotice | null
  start: (heroIds: readonly string[], policy: ExpeditionPolicy) => void
  retreat: () => void
  upgradeWatchtower: () => void
  exportSave: () => void
  importSave: (json: string) => void
  resetGame: () => void
  debugAdvance: (milliseconds: number) => void
  debugAddWood: () => void
  clearNotice: () => void
}

export const GameContext = createContext<GameContextValue | null>(null)
