import { describe, expect, it } from 'vitest'
import { createSaveFile } from './saveCodec'
import { normalizeSaveForNow } from './saveNormalization'
import {
  createActiveSaveTestGame,
  createSaveTestGame,
} from './saveTestFixture'

const NOW = 1_700_000_000_000
const HOUR_MS = 60 * 60 * 1_000

describe('save timestamp normalization', () => {
  it('整体平移来自未来系统时钟的游戏时间线', () => {
    const futureNow = NOW + HOUR_MS
    const game = createActiveSaveTestGame(futureNow)
    const save = createSaveFile(game, futureNow + 5_000)

    const normalized = normalizeSaveForNow(save, NOW)

    expect(normalized).not.toBe(save)
    expect(normalized.savedAt).toBe(NOW)
    expect(normalized.game.lastAdvancedAt).toBe(NOW)
    expect(normalized.game.updatedAt).toBe(NOW)
    expect(normalized.game.createdAt).toBe(NOW)
    expect(normalized.game.journal.every((entry) => entry.timestamp <= NOW)).toBe(
      true,
    )
    expect(normalized.game.activeExpedition?.lastProcessedAt).toBe(NOW)
    expect(normalized.game.activeExpedition?.nextEventAt).toBe(NOW + 15_000)
    expect(save.game.lastAdvancedAt).toBe(futureNow)
  })

  it('根据区域间隔修复独立漂移到远期的下一事件时间', () => {
    const startedAt = NOW - 1_000
    const game = createActiveSaveTestGame(startedAt)
    const expedition = game.activeExpedition
    if (expedition === null) {
      throw new Error('测试夹具缺少远征')
    }
    const save = createSaveFile(
      {
        ...game,
        activeExpedition: {
          ...expedition,
          nextEventAt: NOW + HOUR_MS,
        },
      },
      startedAt,
    )

    const normalized = normalizeSaveForNow(save, NOW)

    expect(normalized.game.activeExpedition?.nextEventAt).toBe(
      startedAt + 15_000,
    )
  })

  it('未来 savedAt 不会改变本来有效的游戏进度', () => {
    const game = createSaveTestGame(NOW - 1_000)
    const normalized = normalizeSaveForNow(
      createSaveFile(game, NOW + HOUR_MS),
      NOW,
    )

    expect(normalized.savedAt).toBe(NOW)
    expect(normalized.game).toEqual(game)
  })
})
