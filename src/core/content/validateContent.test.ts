import { describe, expect, it } from 'vitest'
import type {
  AdventureEventDefinition,
  ContentCatalog,
  EventCondition,
  EventEffect,
} from './contentTypes'
import { RESERVED_ADVENTURE_EVENT_TITLES } from './contentDiagnostics'
import { GAME_CONTENT } from './contentRegistry'
import { validateGameContent } from './validateContent'

function firstEvent(): AdventureEventDefinition {
  const event = GAME_CONTENT.events[0]
  if (event === undefined) {
    throw new Error('测试内容缺少事件。')
  }
  return event
}

function catalogWithEvent(event: AdventureEventDefinition): ContentCatalog {
  return {
    ...GAME_CONTENT,
    events: GAME_CONTENT.events.map((candidate) =>
      candidate.id === event.id ? event : candidate,
    ),
  }
}

function catalogWithFirstEvent(event: unknown): unknown {
  return {
    ...GAME_CONTENT,
    events: [event, ...GAME_CONTENT.events.slice(1)],
  }
}

function errorCodes(catalog: unknown): string[] {
  return validateGameContent(catalog).errors.map((entry) => entry.code)
}

function expectMalformedEventError(event: unknown, code: string): void {
  const catalog = catalogWithFirstEvent(event)
  expect(() => validateGameContent(catalog)).not.toThrow()
  expect(errorCodes(catalog)).toContain(code)
}

describe('validateGameContent', () => {
  it('接受可 JSON 序列化的内置注册表', () => {
    expect(validateGameContent()).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    })
    expect(() => JSON.stringify(GAME_CONTENT)).not.toThrow()
  })

  it('报告所有内容类型的重复 ID', () => {
    const invalid: ContentCatalog = {
      ...GAME_CONTENT,
      heroes: [...GAME_CONTENT.heroes, GAME_CONTENT.heroes[0]],
      traits: [...GAME_CONTENT.traits, GAME_CONTENT.traits[0]],
      regions: [...GAME_CONTENT.regions, GAME_CONTENT.regions[0]],
      events: [...GAME_CONTENT.events, GAME_CONTENT.events[0]],
      buildings: [...GAME_CONTENT.buildings, GAME_CONTENT.buildings[0]],
    }

    expect(errorCodes(invalid)).toEqual(
      expect.arrayContaining([
        'duplicate-hero-id',
        'duplicate-trait-id',
        'duplicate-region-id',
        'duplicate-event-id',
        'duplicate-building-id',
      ]),
    )
  })

  it('拒绝未知引用、非法权重和不可序列化值', () => {
    const event: AdventureEventDefinition = {
      ...firstEvent(),
      description: (() => 'bad') as unknown as string,
      regionIds: ['missing-region'],
      baseWeight: 0,
      conditions: [
        { type: 'partyHasHero', heroId: 'missing-hero' },
        { type: 'partyHasTrait', traitId: 'missing-trait' },
      ],
    }

    expect(errorCodes(catalogWithEvent(event))).toEqual(
      expect.arrayContaining([
        'non-serializable-content-value',
        'unknown-event-region',
        'unknown-condition-hero',
        'unknown-condition-trait',
        'invalid-event-base-weight',
      ]),
    )
  })

  it('拒绝条件冲突、非法比例和非法 1 基事件范围', () => {
    const conditions: EventCondition[] = [
      { type: 'policyIs', policy: 'cautious' },
      { type: 'policyIs', policy: 'greedy' },
      { type: 'regionIs', regionId: 'black-fir-forest' },
      { type: 'regionIs', regionId: 'missing-region' },
      { type: 'minimumPartyHealthRatioAtLeast', ratio: 1.1 },
      { type: 'eventIndexBetween', minimum: 3, maximum: 2 },
      { type: 'expeditionFlagPresent', flag: 'found.cache' },
      { type: 'expeditionFlagAbsent', flag: 'found.cache' },
    ]
    const codes = errorCodes(
      catalogWithEvent({ ...firstEvent(), conditions }),
    )

    expect(codes).toEqual(
      expect.arrayContaining([
        'conflicting-policy-conditions',
        'conflicting-region-conditions',
        'conflicting-flag-conditions',
        'invalid-health-ratio',
        'invalid-event-index-range',
      ]),
    )
  })

  it('拒绝非法效果范围、资源、目标、日志类别和旗标', () => {
    const effects = [
      {
        type: 'gainLoot',
        resource: 'ore',
        amount: { min: -1, max: 2 },
      },
      {
        type: 'damageHero',
        target: 'firstHero',
        amount: { min: 5, max: 2 },
      },
      {
        type: 'appendJournal',
        category: 'other',
        title: '',
        text: '',
      },
      { type: 'setExpeditionFlag', flag: 'Bad flag' },
    ] as unknown as readonly EventEffect[]
    const event: AdventureEventDefinition = {
      ...firstEvent(),
      resolution: { type: 'effects', effects },
    }
    const codes = errorCodes(catalogWithEvent(event))

    expect(codes).toEqual(
      expect.arrayContaining([
        'unknown-effect-resource',
        'negative-resource-effect',
        'invalid-numeric-range',
        'unknown-hero-target',
        'unknown-journal-category',
        'empty-journal-copy',
        'invalid-expedition-flag',
      ]),
    )
  })

  it('安全报告事件缺失 tags 与效果缺失 amount', () => {
    const missingTags = { ...firstEvent() } as Record<string, unknown>
    delete missingTags.tags
    expectMalformedEventError(missingTags, 'invalid-content-structure')

    expectMalformedEventError(
      {
        ...firstEvent(),
        resolution: {
          type: 'effects',
          effects: [{ type: 'gainLoot', resource: 'wood' }],
        },
      },
      'invalid-effect-range-structure',
    )
  })

  it('安全报告未知条件与未知效果', () => {
    expectMalformedEventError(
      {
        ...firstEvent(),
        conditions: [{ type: 'futureCondition' }],
      },
      'unknown-event-condition',
    )
    expectMalformedEventError(
      {
        ...firstEvent(),
        resolution: {
          type: 'effects',
          effects: [{ type: 'futureEffect' }],
        },
      },
      'unknown-event-effect',
    )
  })

  it('安全格式化无法转换为字符串的未知字段值', () => {
    const unformattable = Object.create(null) as Record<string, unknown>
    expectMalformedEventError(
      {
        ...firstEvent(),
        conditions: [{ type: 'policyIs', policy: unformattable }],
      },
      'unknown-condition-policy',
    )
  })

  it('拒绝稀疏效果数组', () => {
    const effects: unknown[] = []
    effects.length = 1

    expectMalformedEventError(
      {
        ...firstEvent(),
        resolution: { type: 'effects', effects },
      },
      'sparse-content-array',
    )
  })

  it('拒绝条件、效果、解析和方针修正中的未知字段', () => {
    const codes = errorCodes(
      catalogWithFirstEvent({
        ...firstEvent(),
        conditions: [
          { type: 'eventIndexBetween', minimum: 1, minmum: 2 },
        ],
        policyModifiers: {
          cautious: { weightMultipler: 0 },
        },
        resolution: {
          type: 'effects',
          effectz: [],
          effects: [
            {
              type: 'gainLoot',
              resource: 'wood',
              amount: { min: 1, max: 1 },
              ammount: { min: 2, max: 2 },
            },
          ],
        },
      }),
    )

    expect(codes).toEqual(
      expect.arrayContaining([
        'unknown-event-condition-field',
        'unknown-event-effect-field',
        'unknown-event-resolution-field',
        'unknown-policy-modifier-field',
      ]),
    )
  })

  it('安全报告缺失或未知的事件解析类型', () => {
    const missingResolution = { ...firstEvent() } as Record<string, unknown>
    delete missingResolution.resolution
    expectMalformedEventError(
      missingResolution,
      'invalid-event-resolution-structure',
    )
    expectMalformedEventError(
      { ...firstEvent(), resolution: { type: 'futureResolution' } },
      'unknown-event-resolution',
    )
  })

  it('拒绝在唯一允许方针下权重为零的不可触发事件', () => {
    const event: AdventureEventDefinition = {
      ...firstEvent(),
      conditions: [{ type: 'policyIs', policy: 'cautious' }],
      policyModifiers: { cautious: { weightMultiplier: 0 } },
    }

    expect(errorCodes(catalogWithEvent(event))).toContain('unreachable-event')
  })

  it('接受仅在后续 1 基事件序号可触发的事件', () => {
    const event: AdventureEventDefinition = {
      ...firstEvent(),
      conditions: [{ type: 'eventIndexBetween', minimum: 2, maximum: 2 }],
    }
    const eventErrors = validateGameContent(catalogWithEvent(event)).errors.filter(
      (entry) => entry.contentId === event.id,
    )

    expect(eventErrors.map((entry) => entry.code)).not.toContain(
      'unreachable-event',
    )
  })

  it('拒绝空白、标准化后重复与系统保留的事件标题', () => {
    const duplicateTitle = GAME_CONTENT.events[1]?.title
    const reservedTitle = RESERVED_ADVENTURE_EVENT_TITLES[0]
    expect(duplicateTitle).toBeDefined()
    expect(reservedTitle).toBeDefined()

    const codes = errorCodes({
      ...GAME_CONTENT,
      events: GAME_CONTENT.events.map((event, index) => {
        if (index === 0) {
          return { ...event, title: '   ' }
        }
        if (index === 2) {
          return { ...event, title: ` ${duplicateTitle ?? ''} ` }
        }
        if (index === 3) {
          return { ...event, title: reservedTitle ?? '' }
        }
        return event
      }),
    })

    expect(codes).toEqual(
      expect.arrayContaining([
        'empty-event-title',
        'duplicate-event-title',
        'reserved-event-title',
      ]),
    )
  })

  it('要求区域具备 safe、reward 和每种队伍方针的候选事件', () => {
    const dangerOnly = GAME_CONTENT.events.find(
      (event) => event.id === 'lost-trail',
    )!
    const invalid: ContentCatalog = {
      ...GAME_CONTENT,
      events: [dangerOnly],
      regions: GAME_CONTENT.regions.map((region) => ({
        ...region,
        eventIds: [dangerOnly.id],
      })),
    }

    expect(errorCodes(invalid)).toEqual(
      expect.arrayContaining([
        'region-without-safe-event',
        'region-without-reward-event',
      ]),
    )
  })

  it('拒绝区域中的重复事件引用', () => {
    const invalid: ContentCatalog = {
      ...GAME_CONTENT,
      regions: GAME_CONTENT.regions.map((region) => ({
        ...region,
        eventIds: [...region.eventIds, firstEvent().id],
      })),
    }

    expect(errorCodes(invalid)).toContain('duplicate-region-event-id')
  })

  it('要求每个事件序号都有不依赖可变远征状态的保证候选', () => {
    const indexLimited = {
      ...GAME_CONTENT,
      events: GAME_CONTENT.events.map((event) => ({
        ...event,
        conditions: [
          { type: 'eventIndexBetween' as const, maximum: 1 },
        ],
      })),
    }
    const indexError = validateGameContent(indexLimited).errors.find(
      (entry) =>
        entry.code ===
        'region-party-index-has-no-guaranteed-candidate',
    )
    expect(indexError?.message).toContain('事件序号 2')

    const healthDependent = {
      ...GAME_CONTENT,
      events: GAME_CONTENT.events.map((event) => ({
        ...event,
        conditions: [
          {
            type: 'minimumPartyHealthRatioAtLeast' as const,
            ratio: 1,
          },
        ],
      })),
    }
    const healthError = validateGameContent(healthDependent).errors.find(
      (entry) =>
        entry.code ===
        'region-party-index-has-no-guaranteed-candidate',
    )
    expect(healthError?.message).toContain('事件序号 1')
  })

  it('拒绝会产生非法新游戏英雄状态的基础定义', () => {
    const invalid: ContentCatalog = {
      ...GAME_CONTENT,
      heroes: [
        {
          ...GAME_CONTENT.heroes[0],
          id: '',
          name: '   ',
          level: 0,
          maxHealth: 0,
          power: -1,
          insight: 1.5,
          traitIds: ['bad trait'],
        },
        ...GAME_CONTENT.heroes.slice(1),
      ],
      traits: [
        { ...GAME_CONTENT.traits[0], id: 'bad trait' },
        ...GAME_CONTENT.traits.slice(1),
      ],
    }

    expect(errorCodes(invalid)).toEqual(
      expect.arrayContaining([
        'invalid-hero-id',
        'empty-hero-name',
        'invalid-hero-level',
        'invalid-hero-max-health',
        'invalid-hero-stat',
        'invalid-hero-trait-id',
        'invalid-trait-id',
      ]),
    )
  })
})
