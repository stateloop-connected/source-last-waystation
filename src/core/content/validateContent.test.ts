import { describe, expect, it } from 'vitest'
import type {
  AdventureEventDefinition,
  ContentCatalog,
} from './contentTypes'
import { GAME_CONTENT, validateContent } from './validateContent'
import type { ResourceType } from '../model/gameState'

function requireFirstEvent(): AdventureEventDefinition {
  const event = GAME_CONTENT.events[0]
  if (event === undefined) {
    throw new Error('测试内容缺少事件。')
  }
  return event
}

describe('validateContent', () => {
  it('接受内置内容', () => {
    expect(validateContent()).toEqual({ valid: true, errors: [] })
  })

  it('报告英雄、区域、事件和建筑的重复 ID', () => {
    const hero = GAME_CONTENT.heroes[0]
    const region = GAME_CONTENT.regions[0]
    const event = GAME_CONTENT.events[0]
    const building = GAME_CONTENT.buildings[0]
    if (
      hero === undefined ||
      region === undefined ||
      event === undefined ||
      building === undefined
    ) {
      throw new Error('测试内容不完整。')
    }
    const invalid: ContentCatalog = {
      ...GAME_CONTENT,
      heroes: [...GAME_CONTENT.heroes, hero],
      regions: [...GAME_CONTENT.regions, region],
      events: [...GAME_CONTENT.events, event],
      buildings: [...GAME_CONTENT.buildings, building],
    }

    const result = validateContent(invalid)

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('英雄 ID 重复'))).toBe(true)
    expect(result.errors.some((error) => error.includes('区域 ID 重复'))).toBe(true)
    expect(result.errors.some((error) => error.includes('事件 ID 重复'))).toBe(true)
    expect(result.errors.some((error) => error.includes('建筑 ID 重复'))).toBe(true)
  })

  it('拒绝非正事件权重和非法资源效果', () => {
    const event = requireFirstEvent()
    const invalidResource = 'ore' as ResourceType
    const invalid: ContentCatalog = {
      ...GAME_CONTENT,
      events: [
        {
          ...event,
          weight: 0,
          effects: [
            {
              type: 'gainLoot',
              resource: invalidResource,
              min: 1,
              max: 2,
            },
          ],
        },
      ],
      regions: GAME_CONTENT.regions.map((region) => ({
        ...region,
        eventIds: [event.id],
      })),
    }

    const result = validateContent(invalid)

    expect(result.errors.some((error) => error.includes('权重必须大于 0'))).toBe(true)
    expect(result.errors.some((error) => error.includes('非法资源'))).toBe(true)
  })

  it('拒绝没有可达事件的区域', () => {
    const invalid: ContentCatalog = {
      ...GAME_CONTENT,
      regions: GAME_CONTENT.regions.map((region) => ({
        ...region,
        eventIds: ['missing-event'],
      })),
    }

    const result = validateContent(invalid)

    expect(result.errors.some((error) => error.includes('未知事件'))).toBe(true)
    expect(result.errors.some((error) => error.includes('没有可达事件'))).toBe(true)
  })

  it('要求黑杉林区域存在', () => {
    const invalid: ContentCatalog = {
      ...GAME_CONTENT,
      regions: [],
    }

    expect(
      validateContent(invalid).errors.some((error) =>
        error.includes('black-fir-forest'),
      ),
    ).toBe(true)
  })
})
