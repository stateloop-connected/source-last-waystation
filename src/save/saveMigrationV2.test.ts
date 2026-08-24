import { describe, expect, it } from 'vitest'
import { createNewGame } from '../core/commands/createNewGame'
import { createSaveFile, decodeSave, encodeSave } from './saveCodec'
import {
  migrateSave,
  migrateSaveV1ToV2,
} from './migrations'
import { normalizeSaveForNow } from './saveNormalization'
import type { SaveFileV1 } from './saveTypes'
import {
  SYNTHETIC_V1_NOW,
  createActiveV1Save,
  createFutureV1Save,
  createIdleV1Save,
  createInjuredV1Save,
} from './saveV1TestFixture'

describe('save schema V2', () => {
  it('新游戏使用 V2 运行时默认字段且导出信封为 V2', () => {
    const game = createNewGame(SYNTHETIC_V1_NOW)
    const save = createSaveFile(game, SYNTHETIC_V1_NOW)

    expect(save.schemaVersion).toBe(2)
    expect(game.unlockedRegionIds).toEqual(['black-fir-forest'])
    expect(game.station).toEqual({
      watchtowerLevel: 0,
      infirmaryLevel: 0,
    })
    expect(game.heroes.map((hero) => [hero.id, hero.traitIds])).toEqual([
      ['ron', ['ronn.guardian']],
      ['eve', ['eve.pathfinder']],
      ['mia', ['mia.field-medic']],
    ])
    expect(game.activeExpedition).toBeNull()
  })

  it('V2 编码解码往返保持完整状态', () => {
    const save = createSaveFile(
      createNewGame(SYNTHETIC_V1_NOW),
      SYNTHETIC_V1_NOW,
    )
    const decoded = decodeSave(encodeSave(save))

    expect(decoded.ok).toBe(true)
    if (decoded.ok) {
      expect(decoded.sourceSchemaVersion).toBe(2)
      expect(decoded.value).toEqual(save)
    }
  })

  it('纯迁移空闲 V1 并保留原对象和现有进度', () => {
    const v1 = createIdleV1Save()
    const originalJson = JSON.stringify(v1)
    const migrated = migrateSaveV1ToV2(v1)

    expect(JSON.stringify(v1)).toBe(originalJson)
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.savedAt).toBe(v1.savedAt)
    expect(migrated.game.resources).toEqual(v1.game.resources)
    expect(migrated.game.completedExpeditions).toBe(
      v1.game.completedExpeditions,
    )
    expect(migrated.game.hasClaimedFirstExpeditionReward).toBe(
      v1.game.hasClaimedFirstExpeditionReward,
    )
    expect(migrated.game.journal).toEqual(v1.game.journal)
    expect(migrated.game.journal).not.toBe(v1.game.journal)
    expect(migrated.game.unlockedRegionIds).toEqual(['black-fir-forest'])
    expect(migrated.game.station).toEqual({
      watchtowerLevel: v1.game.station.watchtowerLevel,
      infirmaryLevel: 0,
    })
  })

  it('迁移活跃 V1 远征时无损保留时间、RNG、战利品和日志', () => {
    const v1 = createActiveV1Save()
    const expedition = v1.game.activeExpedition
    if (expedition === null) {
      throw new Error('V1 测试夹具缺少远征。')
    }

    const migrated = migrateSaveV1ToV2(v1)
    const migratedExpedition = migrated.game.activeExpedition

    expect(migratedExpedition).not.toBeNull()
    expect(migratedExpedition).toMatchObject({
      id: expedition.id,
      seed: expedition.seed,
      rngState: expedition.rngState,
      startedAt: expedition.startedAt,
      lastProcessedAt: expedition.lastProcessedAt,
      nextEventAt: expedition.nextEventAt,
      processedEventCount: expedition.processedEventCount,
      carriedLoot: expedition.carriedLoot,
      eventFlags: [],
    })
    expect(migrated.game.journal).toEqual(v1.game.journal)
    expect(migrated.game.resources).toEqual(v1.game.resources)
  })

  it('迁移受伤英雄且补充固定特质，不改变生命值', () => {
    const v1 = createInjuredV1Save()
    const migrated = migrateSaveV1ToV2(v1)

    expect(migrated.game.heroes.map((hero) => ({
      id: hero.id,
      health: hero.health,
      status: hero.status,
      traitIds: hero.traitIds,
    }))).toEqual([
      {
        id: 'ron',
        health: 1,
        status: 'injured',
        traitIds: ['ronn.guardian'],
      },
      {
        id: 'eve',
        health: 9,
        status: 'idle',
        traitIds: ['eve.pathfinder'],
      },
      {
        id: 'mia',
        health: 10,
        status: 'idle',
        traitIds: ['mia.field-medic'],
      },
    ])
  })

  it('迁移并保留接近裁剪上限的完整日志顺序', () => {
    const v1 = createIdleV1Save()
    const journal = Array.from({ length: 200 }, (_, index) => ({
      id: `synthetic-v1-journal-${index}`,
      timestamp: SYNTHETIC_V1_NOW,
      category: 'event' as const,
      title: `合成日志 ${index}`,
      text: `迁移顺序测试 ${index}`,
    }))
    const crowded: SaveFileV1 = {
      ...v1,
      game: { ...v1.game, journal },
    }

    const migrated = migrateSave(crowded)

    expect(migrated.ok).toBe(true)
    if (migrated.ok) {
      expect(migrated.value.game.journal).toHaveLength(200)
      expect(migrated.value.game.journal.map((entry) => entry.id)).toEqual(
        journal.map((entry) => entry.id),
      )
    }
  })

  it('拒绝超过 200 条的 V1 和 V2 日志', () => {
    const v1 = createIdleV1Save()
    const v1Entry = v1.game.journal[0]
    if (v1Entry === undefined) {
      throw new Error('V1 测试夹具缺少日志。')
    }
    const oversizedJournal = Array.from({ length: 201 }, (_, index) => ({
      ...v1Entry,
      id: `oversized-journal-${index}`,
    }))
    const invalidV1: SaveFileV1 = {
      ...v1,
      game: { ...v1.game, journal: oversizedJournal },
    }
    const v2 = createSaveFile(
      createNewGame(SYNTHETIC_V1_NOW),
      SYNTHETIC_V1_NOW,
    )
    const invalidV2 = {
      ...v2,
      game: { ...v2.game, journal: oversizedJournal },
    }

    expect(decodeSave(JSON.stringify(invalidV1))).toMatchObject({
      ok: false,
      code: 'invalid-structure',
    })
    expect(decodeSave(JSON.stringify(invalidV2))).toMatchObject({
      ok: false,
      code: 'invalid-structure',
    })
  })

  it('接受兼容零 RNG 状态并拒绝 uint32 范围外的持久化状态', () => {
    const v1 = createActiveV1Save()
    const expedition = v1.game.activeExpedition
    if (expedition === null) {
      throw new Error('V1 测试夹具缺少远征。')
    }
    const withRng = (seed: number, rngState: number): SaveFileV1 => ({
      ...v1,
      game: {
        ...v1.game,
        activeExpedition: { ...expedition, seed, rngState },
      },
    })

    const zero = decodeSave(JSON.stringify(withRng(0, 0)))
    expect(zero.ok).toBe(true)
    if (zero.ok) {
      expect(zero.value.game.activeExpedition).toMatchObject({
        seed: 0,
        rngState: 0,
      })
    }

    for (const invalid of [-1, 0x1_0000_0000]) {
      expect(decodeSave(JSON.stringify(withRng(invalid, 1)))).toMatchObject({
        ok: false,
        code: 'invalid-structure',
      })
      expect(decodeSave(JSON.stringify(withRng(1, invalid)))).toMatchObject({
        ok: false,
        code: 'invalid-structure',
      })
    }
  })

  it('V1 未来时间先迁移为 V2 再整体归一化并保持事件间隔', () => {
    const v1 = createFutureV1Save()
    const decoded = decodeSave(JSON.stringify(v1))

    expect(decoded.ok).toBe(true)
    if (!decoded.ok) {
      return
    }

    const normalized = normalizeSaveForNow(
      decoded.value,
      SYNTHETIC_V1_NOW,
      'legacy-region-default',
    )
    expect(normalized.schemaVersion).toBe(2)
    expect(normalized.savedAt).toBe(SYNTHETIC_V1_NOW)
    expect(normalized.game.lastAdvancedAt).toBe(SYNTHETIC_V1_NOW)
    expect(normalized.game.activeExpedition?.lastProcessedAt).toBe(
      SYNTHETIC_V1_NOW,
    )
    expect(normalized.game.activeExpedition?.nextEventAt).toBe(
      SYNTHETIC_V1_NOW + 15_000,
    )
  })

  it('接受合法 V1 边界值且不发放或重算任何奖励', () => {
    const v1 = createInjuredV1Save()
    const boundary: SaveFileV1 = {
      ...v1,
      game: {
        ...v1.game,
        resources: { food: 0, medicine: 0, wood: 0, coins: 0 },
        station: { watchtowerLevel: 3 },
        completedExpeditions: 7,
        hasClaimedFirstExpeditionReward: true,
      },
    }

    const migrated = migrateSave(boundary)

    expect(migrated.ok).toBe(true)
    if (migrated.ok) {
      expect(migrated.value.game.resources).toEqual(boundary.game.resources)
      expect(migrated.value.game.completedExpeditions).toBe(7)
      expect(migrated.value.game.hasClaimedFirstExpeditionReward).toBe(true)
    }
  })

  it('明确拒绝未来 V3，而不按 V2 猜测解析', () => {
    const v2 = createSaveFile(
      createNewGame(SYNTHETIC_V1_NOW),
      SYNTHETIC_V1_NOW,
    )
    const decoded = decodeSave(JSON.stringify({ ...v2, schemaVersion: 3 }))

    expect(decoded).toEqual({
      ok: false,
      code: 'unsupported-version',
      error: '不支持的存档版本：3。',
    })
  })

  it('损坏的 V1 与 V2 分别在迁移前和迁移后被深层拒绝', () => {
    const v1 = createIdleV1Save()
    const invalidV1 = {
      ...v1,
      game: {
        ...v1.game,
        heroes: v1.game.heroes.map((hero, index) =>
          index === 0 ? { ...hero, health: 0 } : hero,
        ),
      },
    }
    const v2 = createSaveFile(
      createNewGame(SYNTHETIC_V1_NOW),
      SYNTHETIC_V1_NOW,
    )
    const invalidV2 = {
      ...v2,
      game: {
        ...v2.game,
        heroes: v2.game.heroes.map((hero, index) =>
          index === 0 ? { ...hero, traitIds: ['unknown-trait'] } : hero,
        ),
      },
    }

    expect(decodeSave(JSON.stringify(invalidV1))).toMatchObject({
      ok: false,
      code: 'invalid-reference',
    })
    expect(decodeSave(JSON.stringify(invalidV2))).toMatchObject({
      ok: false,
      code: 'invalid-reference',
    })
  })
})
