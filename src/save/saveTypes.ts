import type { GameState } from '../core/model/gameState'

export const LEGACY_SAVE_SCHEMA_VERSION = 1 as const
export const SAVE_SCHEMA_VERSION = 2 as const
export const SAVE_STORAGE_KEY = 'last-waystation.save.v1'
export const MAX_SAVE_TIMESTAMP = 8_640_000_000_000_000

export type HeroStateV1 = {
  id: string
  name: string
  role: 'vanguard' | 'scout' | 'medic'
  level: number
  maxHealth: number
  health: number
  power: number
  insight: number
  survival: number
  status: 'idle' | 'expedition' | 'injured'
}

export type ExpeditionStateV1 = {
  id: string
  regionId: string
  partyHeroIds: string[]
  policy: 'cautious' | 'explore' | 'greedy'
  seed: number
  rngState: number
  startedAt: number
  lastProcessedAt: number
  nextEventAt: number
  processedEventCount: number
  maxEventCount: number
  carriedLoot: {
    wood: number
    coins: number
    food: number
    medicine: number
  }
  status: 'active' | 'returning' | 'completed'
}

export type GameStateV1 = {
  gameVersion: string
  createdAt: number
  updatedAt: number
  lastAdvancedAt: number
  resources: {
    food: number
    medicine: number
    wood: number
    coins: number
  }
  heroes: HeroStateV1[]
  station: {
    watchtowerLevel: number
  }
  activeExpedition: ExpeditionStateV1 | null
  completedExpeditions: number
  hasClaimedFirstExpeditionReward: boolean
  journal: {
    id: string
    timestamp: number
    expeditionId?: string
    sourceEventId?: string
    category:
      | 'system'
      | 'travel'
      | 'event'
      | 'combat'
      | 'reward'
      | 'warning'
      | 'return'
    title: string
    text: string
  }[]
}

export type SaveFileV1 = {
  schemaVersion: typeof LEGACY_SAVE_SCHEMA_VERSION
  savedAt: number
  game: GameStateV1
}

export type SaveFileV2 = {
  schemaVersion: typeof SAVE_SCHEMA_VERSION
  savedAt: number
  game: GameState
}

export type SaveFile = SaveFileV2

export type SaveErrorCode =
  | 'invalid-json'
  | 'invalid-structure'
  | 'invalid-reference'
  | 'missing-version'
  | 'unsupported-version'
  | 'storage-read-failed'
  | 'storage-write-failed'
  | 'storage-remove-failed'
  | 'simulation-failed'

export type SaveFailure = {
  ok: false
  code: SaveErrorCode
  error: string
}

export type SaveSuccess<T> = {
  ok: true
  value: T
  sourceSchemaVersion: 1 | 2
}

export type SaveResult<T> = SaveSuccess<T> | SaveFailure
