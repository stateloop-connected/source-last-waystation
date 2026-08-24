import type { ExpeditionState } from './expedition'
import type { HeroState } from './hero'
import type { JournalEntry } from './journal'

export const GAME_VERSION = '1.0.0'

export type Resources = {
  food: number
  medicine: number
  wood: number
  coins: number
}

export type ResourceType = keyof Resources

export type StationState = {
  watchtowerLevel: number
  infirmaryLevel: number
}

export type GameState = {
  gameVersion: string
  createdAt: number
  updatedAt: number
  lastAdvancedAt: number
  resources: Resources
  unlockedRegionIds: string[]
  heroes: HeroState[]
  station: StationState
  activeExpedition: ExpeditionState | null
  completedExpeditions: number
  hasClaimedFirstExpeditionReward: boolean
  journal: JournalEntry[]
}

export type CommandResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; error: string }
