import { describe, expect, it } from 'vitest'
import { createNewGame } from '../commands/createNewGame'
import type {
  AdventureEventDefinition,
  EventCondition,
} from '../content/contentTypes'
import { nextUint32 } from '../rng/seededRng'
import {
  evaluateEventCondition,
  evaluateEventConditions,
  type EventConditionContext,
} from './evaluateEventConditions'
import { calculateEventWeight } from './calculateEventWeight'
import { selectAdventureEvent } from './selectAdventureEvent'

function makeContext(): EventConditionContext {
  const game = createNewGame(100)
  return {
    regionId: 'black-fir-forest',
    policy: 'explore',
    party: game.heroes.slice(0, 2).map((hero, index) => ({
      ...hero,
      health: index === 0 ? hero.maxHealth / 2 : hero.maxHealth,
    })),
    eventIndex: 3,
    loot: { wood: 4, coins: 0, food: 0, medicine: 1 },
    eventFlags: ['found.cache'],
  }
}

function makeEvent(
  id: string,
  baseWeight = 1,
  conditions?: readonly EventCondition[],
): AdventureEventDefinition {
  return {
    id,
    title: id,
    regionIds: ['black-fir-forest'],
    tags: ['safe'],
    baseWeight,
    ...(conditions === undefined ? {} : { conditions }),
    resolution: { type: 'effects', effects: [] },
  }
}

describe('event conditions', () => {
  it.each<[EventCondition, boolean]>([
    [{ type: 'regionIs', regionId: 'black-fir-forest' }, true],
    [{ type: 'regionIs', regionId: 'another-region' }, false],
    [{ type: 'policyIs', policy: 'explore' }, true],
    [{ type: 'policyIs', policy: 'cautious' }, false],
    [{ type: 'partyHasRole', role: 'vanguard' }, true],
    [{ type: 'partyHasRole', role: 'vanguard', minimum: 2 }, false],
    [{ type: 'partyHasHero', heroId: 'eve' }, true],
    [{ type: 'partyHasTrait', traitId: 'eve.pathfinder' }, true],
    [{ type: 'minimumPartyHealthRatioAtMost', ratio: 0.5 }, true],
    [{ type: 'minimumPartyHealthRatioAtLeast', ratio: 0.51 }, false],
    [{ type: 'eventIndexBetween', minimum: 2, maximum: 3 }, true],
    [{ type: 'lootAtLeast', resource: 'wood', amount: 4 }, true],
    [{ type: 'expeditionFlagPresent', flag: 'found.cache' }, true],
    [{ type: 'expeditionFlagAbsent', flag: 'other.flag' }, true],
  ])('集中解析 $type', (condition, expected) => {
    expect(evaluateEventCondition(condition, makeContext())).toBe(expected)
  })

  it('多个条件使用 AND，且不修改上下文', () => {
    const context = makeContext()
    const snapshot = JSON.stringify(context)
    expect(
      evaluateEventConditions(
        [
          { type: 'partyHasHero', heroId: 'ron' },
          { type: 'lootAtLeast', resource: 'wood', amount: 5 },
        ],
        context,
      ),
    ).toBe(false)
    expect(JSON.stringify(context)).toBe(snapshot)
  })
})

describe('event weights and selection', () => {
  it('集中应用方针权重修正并保留默认值', () => {
    const event: AdventureEventDefinition = {
      ...makeEvent('weighted', 10),
      policyModifiers: {
        cautious: { weightMultiplier: 0 },
        greedy: { weightMultiplier: 1.5 },
      },
    }
    expect(calculateEventWeight(event, 'cautious')).toBe(0)
    expect(calculateEventWeight(event, 'explore')).toBe(10)
    expect(calculateEventWeight(event, 'greedy')).toBe(15)
  })

  it('无候选和零权重均安全返回且不消费 RNG', () => {
    const rngState = 123
    const none = selectAdventureEvent(
      [makeEvent('blocked', 1, [{ type: 'policyIs', policy: 'greedy' }])],
      makeContext(),
      rngState,
    )
    const zero = selectAdventureEvent(
      [
        {
          ...makeEvent('zero'),
          policyModifiers: { explore: { weightMultiplier: 0 } },
        },
      ],
      makeContext(),
      rngState,
    )
    expect(none).toMatchObject({
      event: null,
      nextRngState: rngState,
      fallbackReason: 'no-eligible-events',
    })
    expect(zero).toMatchObject({
      event: null,
      nextRngState: rngState,
      fallbackReason: 'no-positive-weight-events',
    })
  })

  it('单候选和多候选都只消费一次 RNG，并可由状态复现', () => {
    const events = [makeEvent('first', 1), makeEvent('second', 3)]
    const expectedState = nextUint32(456).nextState
    const single = selectAdventureEvent([events[0]!], makeContext(), 456)
    const first = selectAdventureEvent(events, makeContext(), 456)
    const recreated = selectAdventureEvent(
      events.map((event) => ({ ...event })),
      makeContext(),
      456,
    )

    expect(single.nextRngState).toBe(expectedState)
    expect(first.nextRngState).toBe(expectedState)
    expect(recreated).toEqual(first)
  })

  it('被条件过滤的额外事件不改变选择或 RNG 状态', () => {
    const eligible = makeEvent('eligible')
    const blocked = makeEvent('blocked', 100, [
      { type: 'policyIs', policy: 'greedy' },
    ])
    expect(
      selectAdventureEvent([blocked, eligible], makeContext(), 789),
    ).toEqual(selectAdventureEvent([eligible], makeContext(), 789))
  })
})
