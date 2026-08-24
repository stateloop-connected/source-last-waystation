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
import {
  createActiveV1Save,
  createFutureV1Save,
  createIdleV1Save,
} from './saveV1TestFixture'

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
    if (!loaded.ok) {
      throw new Error('测试存档应成功载入')
    }
    expect(loaded.source).toBe('storage')
    expect(loaded.state.lastAdvancedAt).toBe(target)
    expect(loaded).not.toHaveProperty('transitionSummary')
  })

  it('没有实际离线进展时不返回展示层摘要', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const saved = createActiveSaveTestGame()
    storage.setItem(
      SAVE_STORAGE_KEY,
      encodeSave(createSaveFile(saved, saved.updatedAt)),
    )

    const loaded = repository.load(
      saved.lastAdvancedAt,
      createSaveTestGame(saved.lastAdvancedAt),
    )

    expect(loaded.ok).toBe(true)
    if (!loaded.ok) {
      throw new Error('测试存档应成功载入')
    }
    expect(loaded).not.toHaveProperty('transitionSummary')
  })

  it('活跃远征离线推进后返回一份聚合元数据', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const saved = createActiveSaveTestGame()
    const target = saved.lastAdvancedAt + 60_000
    storage.setItem(
      SAVE_STORAGE_KEY,
      encodeSave(createSaveFile(saved, saved.updatedAt)),
    )

    const loaded = repository.load(
      target,
      createSaveTestGame(target),
    )

    expect(loaded.ok).toBe(true)
    if (!loaded.ok) {
      throw new Error('测试存档应成功载入')
    }
    expect(loaded.transitionSummary).toMatchObject({
      elapsedMs: 60_000,
      eventCount: 4,
      completedExpeditions: 0,
    })
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

  it('V2 往返保留超过一小时的效果延迟与远征旗标', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const game = createActiveSaveTestGame()
    const expedition = game.activeExpedition
    if (expedition === null) {
      throw new Error('测试夹具缺少远征')
    }
    const adjustedInterval = 2 * 60 * 60 * 1_000 + 15_000
    const adjusted = {
      ...game,
      activeExpedition: {
        ...expedition,
        nextEventAt: expedition.lastProcessedAt + adjustedInterval,
        eventFlags: ['delay-applied'],
      },
    }

    const imported = repository.import(
      encodeSave(createSaveFile(adjusted, adjusted.updatedAt)),
      createSaveTestGame(adjusted.updatedAt),
      adjusted.updatedAt,
    )

    expect(imported.ok).toBe(true)
    expect(imported.state.activeExpedition).toMatchObject({
      nextEventAt: expedition.lastProcessedAt + adjustedInterval,
      eventFlags: ['delay-applied'],
    })

    const reloaded = repository.load(
      adjusted.updatedAt,
      createSaveTestGame(adjusted.updatedAt),
    )
    expect(reloaded.ok).toBe(true)
    expect(reloaded.state.activeExpedition).toMatchObject({
      nextEventAt: expedition.lastProcessedAt + adjustedInterval,
      eventFlags: ['delay-applied'],
    })
  })

  it('V1 未来时间加载使用旧版区域基础间隔修复漂移', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const now = 1_700_000_000_000
    const v1 = createFutureV1Save(now)
    const expedition = v1.game.activeExpedition
    if (expedition === null) {
      throw new Error('V1 测试夹具缺少远征')
    }
    const drifted = {
      ...v1,
      game: {
        ...v1.game,
        activeExpedition: {
          ...expedition,
          nextEventAt: expedition.lastProcessedAt + 2 * 60 * 60 * 1_000,
        },
      },
    }
    storage.setItem(SAVE_STORAGE_KEY, encodeSave(drifted))

    const loaded = repository.load(now, createSaveTestGame(now))

    expect(loaded.ok).toBe(true)
    expect(loaded.state.activeExpedition).toMatchObject({
      lastProcessedAt: now,
      nextEventAt: now + 15_000,
    })
  })

  it('从生产 key 加载 V1 后立即原子回写 V2', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const v1 = createActiveV1Save()
    const originalExpedition = v1.game.activeExpedition
    storage.setItem(SAVE_STORAGE_KEY, encodeSave(v1))

    const loaded = repository.load(v1.savedAt, createSaveTestGame(v1.savedAt))

    expect(loaded.ok).toBe(true)
    if (!loaded.ok) {
      return
    }
    expect(loaded.source).toBe('storage')
    expect(loaded.migration).toBe('v1-persisted')
    expect(loaded.state.resources).toEqual(v1.game.resources)
    expect(loaded.state.activeExpedition).toMatchObject({
      rngState: originalExpedition?.rngState,
      startedAt: originalExpedition?.startedAt,
      lastProcessedAt: originalExpedition?.lastProcessedAt,
      nextEventAt: originalExpedition?.nextEventAt,
      eventFlags: [],
    })
    expect(loaded.state.journal).toEqual(v1.game.journal)

    const persisted = storage.read(SAVE_STORAGE_KEY)
    expect(persisted).not.toBeNull()
    expect(JSON.parse(persisted ?? 'null')).toMatchObject({
      schemaVersion: 2,
      game: {
        unlockedRegionIds: ['black-fir-forest'],
        station: { infirmaryLevel: 0 },
      },
    })
  })

  it('V1 边界资源在到期结算后保持为可保存的安全整数', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const v1 = createActiveV1Save()
    const expedition = v1.game.activeExpedition
    if (expedition === null) {
      throw new Error('V1 测试夹具缺少远征')
    }
    const boundary = {
      ...v1,
      game: {
        ...v1.game,
        resources: {
          ...v1.game.resources,
          wood: Number.MAX_SAFE_INTEGER,
        },
        completedExpeditions: Number.MAX_SAFE_INTEGER,
        hasClaimedFirstExpeditionReward: true,
        activeExpedition: {
          ...expedition,
          lastProcessedAt: v1.savedAt - 15_000,
          nextEventAt: v1.savedAt,
          processedEventCount: expedition.maxEventCount - 1,
          carriedLoot: { ...expedition.carriedLoot, wood: 1 },
        },
      },
    }
    storage.setItem(SAVE_STORAGE_KEY, encodeSave(boundary))

    const loadAt = v1.savedAt + 15_001
    const loaded = repository.load(loadAt, createSaveTestGame(loadAt))

    expect(loaded.ok).toBe(true)
    expect(loaded.state.activeExpedition).toBeNull()
    expect(loaded.state.resources.wood).toBe(Number.MAX_SAFE_INTEGER)
    expect(loaded.state.completedExpeditions).toBe(Number.MAX_SAFE_INTEGER)
    expect(Number.isSafeInteger(loaded.state.resources.wood)).toBe(true)
    expect(JSON.parse(storage.read(SAVE_STORAGE_KEY) ?? 'null')).toMatchObject({
      schemaVersion: 2,
      game: {
        resources: { wood: Number.MAX_SAFE_INTEGER },
        completedExpeditions: Number.MAX_SAFE_INTEGER,
      },
    })
  })

  it('V1 升级回写在变更后失败时恢复原文且继续使用迁移状态', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const v1 = createIdleV1Save()
    const originalJson = encodeSave(v1)
    storage.setItem(SAVE_STORAGE_KEY, originalJson)
    storage.mutateThenFailNextWrite = true

    const loaded = repository.load(v1.savedAt, createSaveTestGame(v1.savedAt))

    expect(loaded.ok).toBe(true)
    if (loaded.ok) {
      expect(loaded.source).toBe('storage')
      expect(loaded.migration).toBe('v1-write-failed')
      expect(loaded.state.unlockedRegionIds).toEqual(['black-fir-forest'])
    }
    expect(storage.read(SAVE_STORAGE_KEY)).toBe(originalJson)
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

  it('导入活跃远征时只返回正式推进后的聚合元数据', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const importedGame = createActiveSaveTestGame()
    const target = importedGame.lastAdvancedAt + 45_000

    const imported = repository.import(
      encodeSave(createSaveFile(importedGame, importedGame.updatedAt)),
      createSaveTestGame(target),
      target,
    )

    expect(imported.ok).toBe(true)
    if (!imported.ok) {
      throw new Error('测试存档应成功导入')
    }
    expect(imported.state.activeExpedition?.processedEventCount).toBe(3)
    expect(imported.transitionSummary).toMatchObject({
      elapsedMs: 45_000,
      eventCount: 3,
      completedExpeditions: 0,
    })
    expect(
      JSON.parse(storage.read(SAVE_STORAGE_KEY) ?? 'null'),
    ).toMatchObject({
      schemaVersion: 2,
      game: { lastAdvancedAt: target },
    })
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

  it('普通保存写入在变更后抛错时也恢复原存档', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const original = createSaveTestGame()
    expect(repository.save(original, original.updatedAt).ok).toBe(true)
    const previousStoredValue = storage.read(SAVE_STORAGE_KEY)
    storage.mutateThenFailNextWrite = true

    const replacement = {
      ...original,
      resources: { ...original.resources, wood: 99 },
    }
    const saved = repository.save(replacement, replacement.updatedAt)

    expect(saved.ok).toBe(false)
    expect(storage.read(SAVE_STORAGE_KEY)).toBe(previousStoredValue)
  })

  it('导出文件名稳定且内容可再次导入', () => {
    const repository = createSaveRepository(new MemoryStorage())
    const game = createSaveTestGame(new Date(2026, 7, 24).getTime())

    const exported = repository.export(game, game.updatedAt)

    expect(exported.ok).toBe(true)
    if (exported.ok) {
      expect(exported.filename).toBe('last-waystation-save-2026-08-24.json')
      expect(exported.json).toContain('"schemaVersion": 2')
    }
  })

  it('导出再导入保留未知但非空的日志来源事件 ID', () => {
    const repository = createSaveRepository(new MemoryStorage())
    const game = createSaveTestGame()
    const journalEntry = game.journal[0]
    if (journalEntry === undefined) {
      throw new Error('测试夹具缺少日志')
    }
    const withSource = {
      ...game,
      journal: [
        { ...journalEntry, sourceEventId: 'retired-content.event' },
        ...game.journal.slice(1),
      ],
    }

    const exported = repository.export(withSource, withSource.updatedAt)
    expect(exported.ok).toBe(true)
    if (!exported.ok) {
      return
    }

    const imported = repository.import(
      exported.json,
      createSaveTestGame(withSource.updatedAt),
      withSource.updatedAt,
    )
    expect(imported.ok).toBe(true)
    expect(imported.state.journal[0]?.sourceEventId).toBe(
      'retired-content.event',
    )
  })

  it('V1 导入写入 V2 且可再次作为 V2 导入', () => {
    const storage = new MemoryStorage()
    const repository = createSaveRepository(storage)
    const current = createSaveTestGame()
    const v1 = createIdleV1Save(current.updatedAt + 1_000)

    const imported = repository.import(
      encodeSave(v1),
      current,
      v1.savedAt,
    )

    expect(imported.ok).toBe(true)
    const persisted = storage.read(SAVE_STORAGE_KEY)
    expect(JSON.parse(persisted ?? 'null')).toMatchObject({ schemaVersion: 2 })
    if (persisted !== null) {
      expect(repository.import(persisted, current, v1.savedAt).ok).toBe(true)
    }
  })
})
