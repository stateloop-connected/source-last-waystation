import { describe, expect, it } from 'vitest'
import { createSaveFile, encodeSave } from './saveCodec'
import {
  createSaveRepository,
  type SaveStorage,
} from './saveRepository'
import { SAVE_STORAGE_KEY } from './saveTypes'
import {
  createActiveSaveTestGame,
  createSaveTestGame,
} from './saveTestFixture'

class MemoryStorage implements SaveStorage {
  private readonly values = new Map<string, string>()
  failWrites = false
  mutateThenFailNextWrite = false

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('写入失败')
    }
    this.values.set(key, value)
    if (this.mutateThenFailNextWrite) {
      this.mutateThenFailNextWrite = false
      throw new Error('写入后失败')
    }
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  read(key: string): string | null {
    return this.values.get(key) ?? null
  }
}

describe('save repository', () => {
  it('没有本地存档时返回传入的初始状态', () => {
    const repository = createSaveRepository(new MemoryStorage())
    const fallback = createSaveTestGame()

    const loaded = repository.load(fallback.lastAdvancedAt, fallback)

    expect(loaded).toEqual({
      ok: true,
      state: fallback,
      source: 'fallback',
    })
  })

  it('读取有效存档后使用统一推进函数推进到当前时间', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const saved = createSaveTestGame()
    const fallback = createSaveTestGame(saved.lastAdvancedAt + 1)
    storage.setItem(
      SAVE_STORAGE_KEY,
      encodeSave(createSaveFile(saved, saved.updatedAt)),
    )

    const target = saved.lastAdvancedAt + 60_000
    const loaded = repository.load(target, fallback)

    expect(loaded.ok).toBe(true)
    expect(loaded.source).toBe('storage')
    expect(loaded.state.lastAdvancedAt).toBe(target)
  })

  it('未来时钟存档归一化后仍可继续推进', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const now = 1_700_000_000_000
    const future = now + 60 * 60 * 1_000
    const saved = createActiveSaveTestGame(future)
    storage.setItem(
      SAVE_STORAGE_KEY,
      encodeSave(createSaveFile(saved, future + 1_000)),
    )

    const loaded = repository.load(now, createSaveTestGame(now))

    expect(loaded.ok).toBe(true)
    expect(loaded.source).toBe('storage')
    expect(loaded.state.lastAdvancedAt).toBe(now)
    expect(loaded.state.activeExpedition?.nextEventAt).toBe(now + 15_000)
  })

  it('损坏的本地存档返回回退状态而不抛异常', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const fallback = createSaveTestGame()
    storage.setItem(SAVE_STORAGE_KEY, 'not json')

    const loaded = repository.load(fallback.lastAdvancedAt, fallback)

    expect(loaded.ok).toBe(false)
    expect(loaded.state).toBe(fallback)
    if (!loaded.ok) {
      expect(loaded.code).toBe('invalid-json')
    }
  })

  it('无效导入不会覆盖当前状态或已有存档', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const current = createSaveTestGame()
    expect(repository.save(current, current.updatedAt).ok).toBe(true)
    const previousStoredValue = storage.read(SAVE_STORAGE_KEY)

    const imported = repository.import('{}', current, current.updatedAt)

    expect(imported.ok).toBe(false)
    expect(imported.state).toBe(current)
    expect(storage.read(SAVE_STORAGE_KEY)).toBe(previousStoredValue)
  })

  it('有效导入写入失败时也保留当前状态和原存档', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const current = createSaveTestGame()
    expect(repository.save(current, current.updatedAt).ok).toBe(true)
    const previousStoredValue = storage.read(SAVE_STORAGE_KEY)
    const candidate = createSaveTestGame(current.updatedAt + 1_000)
    const json = encodeSave(createSaveFile(candidate, candidate.updatedAt))
    storage.failWrites = true

    const imported = repository.import(json, current, candidate.updatedAt)

    expect(imported.ok).toBe(false)
    expect(imported.state).toBe(current)
    expect(storage.read(SAVE_STORAGE_KEY)).toBe(previousStoredValue)
  })

  it('注入存储在变更后抛错时回滚导入写入', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const current = createSaveTestGame()
    expect(repository.save(current, current.updatedAt).ok).toBe(true)
    const previousStoredValue = storage.read(SAVE_STORAGE_KEY)
    const candidate = createSaveTestGame(current.updatedAt + 1_000)
    const json = encodeSave(createSaveFile(candidate, candidate.updatedAt))
    storage.mutateThenFailNextWrite = true

    const imported = repository.import(json, current, candidate.updatedAt)

    expect(imported.ok).toBe(false)
    expect(imported.state).toBe(current)
    expect(storage.read(SAVE_STORAGE_KEY)).toBe(previousStoredValue)
  })

  it('导出文件名稳定且内容可再次导入', () => {
    const repository = createSaveRepository(new MemoryStorage())
    const game = createSaveTestGame(new Date(2026, 7, 24).getTime())

    const exported = repository.export(game, game.updatedAt)

    expect(exported.ok).toBe(true)
    if (exported.ok) {
      expect(exported.filename).toBe('last-waystation-save-2026-08-24.json')
      expect(exported.json).toContain('"schemaVersion": 1')
    }
  })
})
