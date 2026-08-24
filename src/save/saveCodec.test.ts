import { describe, expect, it } from 'vitest'
import { ADVENTURE_EVENTS } from '../core/content/events'
import { HERO_DEFINITIONS } from '../core/content/heroes'
import { REGION_DEFINITIONS } from '../core/content/regions'
import { createSaveFile, decodeSave, encodeSave } from './saveCodec'
import { hasKnownContentReferences, migrateSave } from './migrations'
import {
  createActiveSaveTestGame,
  createSaveTestGame,
} from './saveTestFixture'
import { createIdleV1Save } from './saveV1TestFixture'

describe('save codec', () => {
  it('编码后可以无损解码游戏状态', () => {
    const game = createSaveTestGame()
    const save = createSaveFile(game, game.updatedAt)

    const decoded = decodeSave(encodeSave(save))

    expect(decoded.ok).toBe(true)
    if (decoded.ok) {
      expect(decoded.value).toEqual(save)
      expect(decoded.value.game).toEqual(game)
    }
  })

  it('迁移缺少首次奖励里程碑的早期 V1 存档', () => {
    const save = createIdleV1Save()
    const legacyGame: Record<string, unknown> = { ...save.game }
    delete legacyGame.hasClaimedFirstExpeditionReward

    const decoded = decodeSave(
      JSON.stringify({
        schemaVersion: 1,
        savedAt: save.savedAt,
        game: legacyGame,
      }),
    )

    expect(decoded.ok).toBe(true)
    if (decoded.ok) {
      expect(decoded.value.game.hasClaimedFirstExpeditionReward).toBe(false)
    }
  })

  it('拒绝损坏的 JSON', () => {
    const decoded = decodeSave('{"schemaVersion": 1')

    expect(decoded).toEqual({
      ok: false,
      code: 'invalid-json',
      error: '存档不是有效的 JSON。',
    })
  })

  it('拒绝缺少关键字段的 V1 存档', () => {
    const decoded = decodeSave(
      JSON.stringify({ schemaVersion: 1, savedAt: 1 }),
    )

    expect(decoded.ok).toBe(false)
    if (!decoded.ok) {
      expect(decoded.code).toBe('invalid-structure')
      expect(decoded.error).toContain('结构无效')
    }
  })

  it('未知版本从迁移入口返回明确错误', () => {
    const migrated = migrateSave({
      schemaVersion: 99,
      savedAt: 1,
      game: createSaveTestGame(),
    })

    expect(migrated.ok).toBe(false)
    if (!migrated.ok) {
      expect(migrated.code).toBe('unsupported-version')
      expect(migrated.error).toContain('99')
    }
  })

  it('深度校验嵌套的英雄字段', () => {
    const game = createSaveTestGame()
    const firstHero = game.heroes[0]
    if (firstHero === undefined) {
      throw new Error('测试夹具结构错误')
    }

    const invalidSave = {
      ...createSaveFile(game, 1_700_000_000_000),
      game: {
        ...game,
        heroes: [
          { ...firstHero, health: '满血' },
          ...game.heroes.slice(1),
        ],
      },
    }

    const decoded = decodeSave(JSON.stringify(invalidSave))
    expect(decoded.ok).toBe(false)
  })

  it('拒绝未知英雄和缺失的固定英雄引用', () => {
    const game = createSaveTestGame()
    const firstHero = game.heroes[0]
    if (firstHero === undefined) {
      throw new Error('测试夹具结构错误')
    }
    const save = createSaveFile(
      {
        ...game,
        heroes: [{ ...firstHero, id: 'unknown-hero' }, ...game.heroes.slice(1)],
      },
      game.updatedAt,
    )

    const decoded = decodeSave(encodeSave(save))

    expect(decoded.ok).toBe(false)
    if (!decoded.ok) {
      expect(decoded.code).toBe('invalid-reference')
      expect(decoded.error).toContain('未知')
    }
  })

  it('拒绝未知区域和悬空队伍成员引用', () => {
    const game = createActiveSaveTestGame()
    const expedition = game.activeExpedition
    if (expedition === null) {
      throw new Error('测试夹具缺少远征')
    }
    const unknownRegion = createSaveFile(
      {
        ...game,
        activeExpedition: { ...expedition, regionId: 'unknown-region' },
      },
      game.updatedAt,
    )
    const danglingHero = createSaveFile(
      {
        ...game,
        activeExpedition: {
          ...expedition,
          partyHeroIds: ['ron', 'unknown-hero'],
        },
      },
      game.updatedAt,
    )

    expect(decodeSave(encodeSave(unknownRegion)).ok).toBe(false)
    expect(decodeSave(encodeSave(danglingHero)).ok).toBe(false)
  })

  it('拒绝区域目录中的未知事件引用', () => {
    const game = createActiveSaveTestGame()
    const region = REGION_DEFINITIONS[0]
    if (region === undefined) {
      throw new Error('测试内容缺少区域')
    }

    expect(
      hasKnownContentReferences(game, {
        heroes: HERO_DEFINITIONS,
        regions: [{ ...region, eventIds: ['unknown-event'] }],
        events: ADVENTURE_EVENTS,
      }),
    ).toBe(false)
  })

  it('拒绝会让 V2 游戏永久卡住的语义状态', () => {
    const game = createActiveSaveTestGame()
    const expedition = game.activeExpedition
    const firstHero = game.heroes[0]
    if (expedition === null || firstHero === undefined) {
      throw new Error('测试夹具结构错误')
    }
    const invalidSaves = [
      createSaveFile(
        {
          ...game,
          activeExpedition: { ...expedition, status: 'completed' },
        },
        game.updatedAt,
      ),
      createSaveFile(
        {
          ...game,
          activeExpedition: { ...expedition, maxEventCount: 0 },
        },
        game.updatedAt,
      ),
      createSaveFile(
        {
          ...game,
          activeExpedition: {
            ...expedition,
            processedEventCount: expedition.maxEventCount,
          },
        },
        game.updatedAt,
      ),
      createSaveFile(
        {
          ...game,
          heroes: [
            { ...firstHero, health: firstHero.maxHealth + 1 },
            ...game.heroes.slice(1),
          ],
        },
        game.updatedAt,
      ),
      createSaveFile(
        {
          ...game,
          station: { ...game.station, watchtowerLevel: 99 },
        },
        game.updatedAt,
      ),
    ]

    for (const save of invalidSaves) {
      const decoded = decodeSave(encodeSave(save))
      expect(decoded.ok).toBe(false)
      if (!decoded.ok) {
        expect(decoded.code).toBe('invalid-reference')
      }
    }
  })
})
