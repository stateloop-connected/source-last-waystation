import type { GameState } from '../core/model/gameState'

export const SAVE_SCHEMA_VERSION = 1 as const
export const SAVE_STORAGE_KEY = 'last-waystation.save.v1'
export const MAX_SAVE_TIMESTAMP = 8_640_000_000_000_000

export type SaveFileV1 = {
  schemaVersion: typeof SAVE_SCHEMA_VERSION
  savedAt: number
  game: GameState
}

export type SaveFile = SaveFileV1

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
}

export type SaveResult<T> = SaveSuccess<T> | SaveFailure
