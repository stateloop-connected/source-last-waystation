import type { GameState } from '../core/model/gameState'
import { advanceTo } from '../core/simulation/advanceTo'
import { createSaveFile, decodeSave, encodeSave } from './saveCodec'
import { isGameState, isSaveFileV2 } from './migrations'
import { normalizeSaveForNow } from './saveNormalization'
import {
  SAVE_STORAGE_KEY,
  type SaveErrorCode,
  type SaveFailure,
} from './saveTypes'

export interface SaveStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type SaveWriteResult =
  | { ok: true; savedAt: number }
  | SaveFailure

export type SaveLoadResult =
  | {
      ok: true
      state: GameState
      source: 'storage' | 'fallback'
      migration?: 'v1-persisted' | 'v1-write-failed'
    }
  | (SaveFailure & {
      state: GameState
      source: 'fallback'
    })

export type SaveImportResult =
  | {
      ok: true
      state: GameState
    }
  | (SaveFailure & {
      state: GameState
    })

export type SaveExportResult =
  | {
      ok: true
      json: string
      filename: string
    }
  | SaveFailure

export type SaveResetResult = { ok: true } | SaveFailure

export interface SaveRepository {
  readonly key: string
  save(game: GameState, savedAt: number): SaveWriteResult
  load(now: number, fallback: GameState): SaveLoadResult
  import(json: string, current: GameState, now: number): SaveImportResult
  export(game: GameState, savedAt: number): SaveExportResult
  reset(): SaveResetResult
}

function failure(code: SaveErrorCode, error: string): SaveFailure {
  return { ok: false, code, error }
}

function createFilename(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear().toString().padStart(4, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `last-waystation-save-${year}-${month}-${day}.json`
}

function unavailableBrowserStorage(): SaveStorage {
  const unavailable = (): never => {
    throw new Error('浏览器本地存储不可用。')
  }

  return {
    getItem: unavailable,
    setItem: unavailable,
    removeItem: unavailable,
  }
}

function browserStorage(): SaveStorage {
  if (typeof window === 'undefined') {
    return unavailableBrowserStorage()
  }

  try {
    return window.localStorage
  } catch {
    return unavailableBrowserStorage()
  }
}

function restoreStoredValue(
  storage: SaveStorage,
  key: string,
  previousValue: string | null,
): void {
  try {
    if (previousValue === null) {
      storage.removeItem(key)
    } else {
      storage.setItem(key, previousValue)
    }
  } catch {
    // localStorage writes are atomic; this is a best-effort safeguard for
    // injected storage implementations that mutate before throwing.
  }
}

function writeStoredValue(
  storage: SaveStorage,
  key: string,
  value: string,
  previousValue: string | null,
): boolean {
  try {
    storage.setItem(key, value)
    return true
  } catch {
    restoreStoredValue(storage, key, previousValue)
    return false
  }
}

export function createSaveRepository(
  storage: SaveStorage = browserStorage(),
  key = SAVE_STORAGE_KEY,
): SaveRepository {
  const save = (game: GameState, savedAt: number): SaveWriteResult => {
    const saveFile = createSaveFile(game, savedAt)
    if (!isSaveFileV2(saveFile)) {
      return failure(
        'invalid-structure',
        '当前游戏状态无效，无法保存。',
      )
    }

    let previousValue: string | null
    try {
      previousValue = storage.getItem(key)
    } catch {
      return failure('storage-read-failed', '读取当前存档失败，保存已取消。')
    }

    if (!writeStoredValue(storage, key, encodeSave(saveFile), previousValue)) {
      return failure(
        'storage-write-failed',
        '保存存档失败，浏览器可能已禁用本地存储。',
      )
    }

    return { ok: true, savedAt }
  }

  const load = (now: number, fallback: GameState): SaveLoadResult => {
    let json: string | null

    try {
      json = storage.getItem(key)
    } catch {
      return {
        ...failure('storage-read-failed', '读取本地存档失败。'),
        state: fallback,
        source: 'fallback',
      }
    }

    if (json === null) {
      return { ok: true, state: fallback, source: 'fallback' }
    }

    const decoded = decodeSave(json)
    if (!decoded.ok) {
      return {
        ...decoded,
        state: fallback,
        source: 'fallback',
      }
    }

    try {
      const normalized = normalizeSaveForNow(
        decoded.value,
        now,
        decoded.sourceSchemaVersion === 1
          ? 'legacy-region-default'
          : 'preserve',
      )
      const state = advanceTo(normalized.game, now)
      if (!isGameState(state)) {
        throw new Error('存档推进后状态无效。')
      }
      if (decoded.sourceSchemaVersion === 1) {
        const migratedSave = createSaveFile(state, state.lastAdvancedAt)
        if (!isSaveFileV2(migratedSave)) {
          throw new Error('迁移后的存档状态无效。')
        }
        const persisted = writeStoredValue(
          storage,
          key,
          encodeSave(migratedSave),
          json,
        )

        return {
          ok: true,
          state,
          source: 'storage',
          migration: persisted ? 'v1-persisted' : 'v1-write-failed',
        }
      }

      return {
        ok: true,
        state,
        source: 'storage',
      }
    } catch {
      return {
        ...failure(
          'simulation-failed',
          '存档推进失败，已继续使用当前游戏。',
        ),
        state: fallback,
        source: 'fallback',
      }
    }
  }

  const importSave = (
    json: string,
    current: GameState,
    now: number,
  ): SaveImportResult => {
    const decoded = decodeSave(json)
    if (!decoded.ok) {
      return { ...decoded, state: current }
    }

    let imported: GameState
    try {
      const normalized = normalizeSaveForNow(
        decoded.value,
        now,
        decoded.sourceSchemaVersion === 1
          ? 'legacy-region-default'
          : 'preserve',
      )
      imported = advanceTo(normalized.game, now)
    } catch {
      return {
        ...failure(
          'simulation-failed',
          '导入的存档无法推进，已保留当前游戏。',
        ),
        state: current,
      }
    }

    const importedSave = createSaveFile(imported, now)
    if (!isSaveFileV2(importedSave)) {
      return {
        ...failure('invalid-structure', '导入后的游戏状态无效。'),
        state: current,
      }
    }

    let previousValue: string | null
    try {
      previousValue = storage.getItem(key)
    } catch {
      return {
        ...failure(
          'storage-read-failed',
          '无法读取当前存档，导入已取消。',
        ),
        state: current,
      }
    }

    if (
      !writeStoredValue(
        storage,
        key,
        encodeSave(importedSave),
        previousValue,
      )
    ) {
      return {
        ...failure(
          'storage-write-failed',
          '导入存档写入失败，已保留当前游戏。',
        ),
        state: current,
      }
    }

    return { ok: true, state: imported }
  }

  const exportSave = (
    game: GameState,
    savedAt: number,
  ): SaveExportResult => {
    const saveFile = createSaveFile(game, savedAt)
    if (!isSaveFileV2(saveFile)) {
      return failure(
        'invalid-structure',
        '当前游戏状态无效，无法导出。',
      )
    }

    try {
      return {
        ok: true,
        json: encodeSave(saveFile, true),
        filename: createFilename(savedAt),
      }
    } catch {
      return failure('invalid-structure', '当前游戏状态无法序列化。')
    }
  }

  const reset = (): SaveResetResult => {
    try {
      storage.removeItem(key)
      return { ok: true }
    } catch {
      return failure('storage-remove-failed', '重置本地存档失败。')
    }
  }

  return {
    key,
    save,
    load,
    import: importSave,
    export: exportSave,
    reset,
  }
}
