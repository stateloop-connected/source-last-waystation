import type { GameState } from '../core/model/gameState'
import { migrateSave } from './migrations'
import {
  SAVE_SCHEMA_VERSION,
  type SaveFileV1,
  type SaveFileV2,
  type SaveResult,
} from './saveTypes'

export function createSaveFile(game: GameState, savedAt: number): SaveFileV2 {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt,
    game,
  }
}

export function encodeSave(
  save: SaveFileV1 | SaveFileV2,
  pretty = false,
): string {
  return JSON.stringify(save, null, pretty ? 2 : 0)
}

export function decodeSave(json: string): SaveResult<SaveFileV2> {
  let value: unknown

  try {
    value = JSON.parse(json)
  } catch {
    return {
      ok: false,
      code: 'invalid-json',
      error: '存档不是有效的 JSON。',
    }
  }

  return migrateSave(value)
}
