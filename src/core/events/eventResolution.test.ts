import { describe, expect, it } from 'vitest'
import { createNewGame } from '../commands/createNewGame'
import type {
  AdventureEventDefinition,
  EventEffect,
} from '../content/contentTypes'
import { nextUint32 } from '../rng/seededRng'
import {
  applyEventEffects,
  type EventEffectContext,
} from './applyEventEffects'
import { resolveAdventureEvent } from './resolveAdventureEvent'

function makeContext(seed = 123): EventEffectContext {
  const state = createNewGame(1_000)
  return {
    heroes: state.heroes.map((hero) => ({
      ...hero,
      health: hero.id === 'ron' ? 40 : hero.health,
    })),
    partyHeroIds: ['ron', 'eve'],
    loot: { wood: 5, coins: 0, food: 0, medicine: 0 },
    eventFlags: ['old.flag'],
    rngState: seed,
    policyModifier: {
      weightMultiplier: 1,
      rewardMultiplier: 1,
      damageMultiplier: 1,
    },
    timestamp: 2_000,
    expeditionId: 'expedition-test',
    eventIndex: 2,
  }
}

function effectsEvent(
  effects: readonly EventEffect[],
): AdventureEventDefinition {
  return {
    id: 'test-event',
    title: '测试事件',
    regionIds: ['black-fir-forest'],
    tags: ['safe'],
    baseWeight: 1,
    resolution: { type: 'effects', effects },
  }
}

describe('event effects', () => {
  it('固定奖励不消费 RNG，范围奖励消费一次并应用奖励倍率', () => {
    const context = makeContext(321)
    const fixed = applyEventEffects(
      [{ type: 'gainLoot', resource: 'wood', amount: { min: 2, max: 2 } }],
      context,
    )
    const ranged = applyEventEffects(
      [{ type: 'gainLoot', resource: 'wood', amount: { min: 2, max: 4 } }],
      { ...context, policyModifier: { ...context.policyModifier, rewardMultiplier: 2 } },
    )

    expect(fixed.loot.wood).toBe(7)
    expect(fixed.nextRngState).toBe(321)
    expect(ranged.loot.wood).toBeGreaterThanOrEqual(9)
    expect(ranged.nextRngState).toBe(nextUint32(321).nextState)
  })

  it('loseLoot 不低于零，多个效果严格按定义顺序', () => {
    const result = applyEventEffects(
      [
        { type: 'loseLoot', resource: 'wood', amount: { min: 99, max: 99 } },
        { type: 'gainLoot', resource: 'wood', amount: { min: 3, max: 3 } },
        { type: 'loseLoot', resource: 'wood', amount: { min: 1, max: 1 } },
      ],
      makeContext(),
    )
    expect(result.loot.wood).toBe(2)
  })

  it('奖励在安全整数上限饱和而不产生不可保存数值', () => {
    const context = {
      ...makeContext(),
      loot: {
        ...makeContext().loot,
        wood: Number.MAX_SAFE_INTEGER,
      },
    }
    const result = applyEventEffects(
      [{ type: 'gainLoot', resource: 'wood', amount: { min: 1, max: 1 } }],
      context,
    )

    expect(result.loot.wood).toBe(Number.MAX_SAFE_INTEGER)
    expect(Number.isSafeInteger(result.loot.wood)).toBe(true)
  })

  it('非随机目标与固定伤害不消费 RNG，平局按 heroId 稳定解决', () => {
    const context = makeContext(44)
    const tied = {
      ...context,
      heroes: context.heroes.map((hero) =>
        context.partyHeroIds.includes(hero.id) ? { ...hero, power: 5 } : hero,
      ),
    }
    const result = applyEventEffects(
      [
        {
          type: 'damageHero',
          target: 'lowestPower',
          amount: { min: 5, max: 5 },
        },
      ],
      tied,
    )
    expect(result.nextRngState).toBe(44)
    expect(result.heroes.find((hero) => hero.id === 'eve')?.health).toBe(85)
    expect(result.heroes.find((hero) => hero.id === 'ron')?.health).toBe(40)
  })

  it('随机英雄目标先消费一次，范围伤害随后消费一次且生命不低于 1', () => {
    const seed = 87
    const afterTarget = nextUint32(seed).nextState
    const afterAmount = nextUint32(afterTarget).nextState
    const result = applyEventEffects(
      [
        {
          type: 'damageHero',
          target: 'randomPartyMember',
          amount: { min: 100, max: 200 },
        },
      ],
      makeContext(seed),
    )
    expect(result.nextRngState).toBe(afterAmount)
    expect(
      result.heroes
        .filter((hero) => ['ron', 'eve'].includes(hero.id))
        .every((hero) => hero.health >= 1),
    ).toBe(true)
  })

  it('治疗不超过最大生命，固定目标和固定值不消费 RNG', () => {
    const context = makeContext(99)
    const result = applyEventEffects(
      [
        {
          type: 'healHero',
          target: 'lowestHealth',
          amount: { min: 999, max: 999 },
        },
      ],
      context,
    )
    const ron = result.heroes.find((hero) => hero.id === 'ron')
    expect(ron?.health).toBe(ron?.maxHealth)
    expect(result.nextRngState).toBe(99)
  })

  it('旗标去重和清除安全，日志、延迟与返程请求均被解释', () => {
    const result = applyEventEffects(
      [
        { type: 'setExpeditionFlag', flag: 'old.flag' },
        { type: 'setExpeditionFlag', flag: 'new.flag' },
        { type: 'clearExpeditionFlag', flag: 'missing.flag' },
        { type: 'clearExpeditionFlag', flag: 'old.flag' },
        {
          type: 'appendJournal',
          category: 'event',
          title: '额外记录',
          text: '记录正文。',
        },
        { type: 'adjustNextEventDelay', seconds: 5 },
        { type: 'adjustNextEventDelay', seconds: -2 },
        { type: 'requestReturn', reason: '道路中断。' },
      ],
      makeContext(),
    )
    expect(result.eventFlags).toEqual(['new.flag'])
    expect(result.journalEntries).toMatchObject([
      { category: 'event', title: '额外记录', text: '记录正文。' },
    ])
    expect(result.nextEventDelayAdjustmentSeconds).toBe(3)
    expect(result.requestedReturnReason).toBe('道路中断。')
  })

  it('不修改定义、英雄、战利品或旗标输入', () => {
    const context = makeContext()
    const effects: readonly EventEffect[] = [
      { type: 'gainLoot', resource: 'wood', amount: { min: 1, max: 2 } },
      {
        type: 'damageHero',
        target: 'randomPartyMember',
        amount: { min: 1, max: 2 },
      },
    ]
    const snapshot = JSON.stringify({ context, effects })
    applyEventEffects(effects, context)
    applyEventEffects(effects, context)
    expect(JSON.stringify({ context, effects })).toBe(snapshot)
  })
})

describe('party checks', () => {
  it('总属性加随机修正等于 difficulty 时成功', () => {
    const event: AdventureEventDefinition = {
      ...effectsEvent([]),
      resolution: {
        type: 'partyCheck',
        stat: 'power',
        difficulty: 13,
        randomBonus: { min: 0, max: 0 },
        successEffects: [
          { type: 'gainLoot', resource: 'coins', amount: { min: 2, max: 2 } },
        ],
        failureEffects: [],
      },
    }
    const result = resolveAdventureEvent(event, makeContext(55))
    expect(result.checkSucceeded).toBe(true)
    expect(result.loot.coins).toBe(2)
    expect(result.nextRngState).toBe(55)
    expect(result.messages[0]).toBe('能力检定成功。')
  })

  it('失败时只应用失败效果', () => {
    const event: AdventureEventDefinition = {
      ...effectsEvent([]),
      resolution: {
        type: 'partyCheck',
        stat: 'insight',
        difficulty: 999,
        randomBonus: { min: 0, max: 0 },
        successEffects: [
          { type: 'gainLoot', resource: 'coins', amount: { min: 9, max: 9 } },
        ],
        failureEffects: [
          { type: 'loseLoot', resource: 'wood', amount: { min: 2, max: 2 } },
        ],
      },
    }
    const result = resolveAdventureEvent(event, makeContext(66))
    expect(result.checkSucceeded).toBe(false)
    expect(result.loot).toMatchObject({ wood: 3, coins: 0 })
    expect(result.messages[0]).toBe('能力检定失败。')
  })

  it('范围检定修正恰好消费一次 RNG 且相同状态可复现', () => {
    const event: AdventureEventDefinition = {
      ...effectsEvent([]),
      resolution: {
        type: 'partyCheck',
        stat: 'survival',
        difficulty: 15,
        randomBonus: { min: -2, max: 2 },
        successEffects: [],
        failureEffects: [],
      },
    }
    const first = resolveAdventureEvent(event, makeContext(77))
    const second = resolveAdventureEvent(event, makeContext(77))
    expect(first).toEqual(second)
    expect(first.nextRngState).toBe(nextUint32(77).nextState)
  })
})
