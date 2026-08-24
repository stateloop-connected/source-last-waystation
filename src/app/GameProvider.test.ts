import { describe, expect, it } from 'vitest'
import { createSaveTestGame } from '../save/saveTestFixture'
import {
  createSaveRepository,
  type SaveLoadResult,
} from '../save/saveRepository'
import { SAVE_STORAGE_KEY } from '../save/saveTypes'
import { createInitialGameAppState } from './initialGameState'
import { canWriteSave } from './savePersistence'

const NOW = 1_700_000_000_000

describe('GameProvider initial save status', () => {
  it('V1 回写失败时保留迁移状态并显示可理解的错误', () => {
    const migratedGame = createSaveTestGame(NOW)
    const loaded: SaveLoadResult = {
      ok: true,
      state: migratedGame,
      source: 'storage',
      migration: 'v1-write-failed',
    }

    const state = createInitialGameAppState(NOW, loaded)

    expect(state.game).toBe(migratedGame)
    expect(state.lastSavedAt).toBeNull()
    expect(state.saveMessage).toBe('V1 存档升级未保存')
    expect(state.notice).toEqual({
      id: NOW,
      message: 'V1 存档已载入，但 V2 升级写入失败；原 V1 存档已保留。',
      tone: 'error',
    })
    expect(state.persistenceStatus).toBe('active')
  })

  it('V1 成功回写后显示已升级且保持存储来源', () => {
    const migratedGame = createSaveTestGame(NOW)
    const loaded: SaveLoadResult = {
      ok: true,
      state: migratedGame,
      source: 'storage',
      migration: 'v1-persisted',
    }

    const state = createInitialGameAppState(NOW, loaded)

    expect(state.game).toBe(migratedGame)
    expect(state.lastSavedAt).toBe(NOW)
    expect(state.saveMessage).toBe('V1 存档已升级')
    expect(state.notice).toMatchObject({
      message: 'V1 存档已升级为 V2，离线进度已结算',
      tone: 'info',
    })
    expect(state.persistenceStatus).toBe('active')
  })

  it('损坏存档隔离后自动保存不覆盖原始文本', () => {
    const original = '{"schemaVersion":1,"broken":true}'
    let stored: string | null = original
    const repository = createSaveRepository({
      getItem: () => stored,
      setItem: (_key, value) => {
        stored = value
      },
      removeItem: () => {
        stored = null
      },
    })
    const fallback = createSaveTestGame(NOW)
    const loaded = repository.load(NOW, fallback)
    const state = createInitialGameAppState(NOW, loaded)

    expect(loaded.ok).toBe(false)
    expect(state.persistenceStatus).toBe('quarantined')
    expect(canWriteSave(state.persistenceStatus, true)).toBe(true)
    if (canWriteSave(state.persistenceStatus)) {
      repository.save(state.game, NOW + 5_000)
    }

    expect(stored).toBe(original)
    expect(repository.key).toBe(SAVE_STORAGE_KEY)
  })
})
