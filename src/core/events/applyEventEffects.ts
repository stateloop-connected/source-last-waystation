import type {
  EventEffect,
  EventPolicyModifier,
  HeroTarget,
  NumericRange,
} from '../content/contentTypes'
import type { ExpeditionLoot } from '../model/expedition'
import type { HeroState } from '../model/hero'
import type { JournalEntry } from '../model/journal'
import { randomInt } from '../rng/seededRng'
import {
  addNonNegativeSafeIntegers,
  roundToNonNegativeSafeInteger,
} from '../safeInteger'

export type EventEffectContext = {
  heroes: readonly HeroState[]
  partyHeroIds: readonly string[]
  loot: Readonly<ExpeditionLoot>
  eventFlags: readonly string[]
  rngState: number
  policyModifier: Required<EventPolicyModifier>
  timestamp: number
  expeditionId: string
  eventIndex: number
}

export type EventEffectResult = {
  heroes: HeroState[]
  loot: ExpeditionLoot
  eventFlags: string[]
  nextRngState: number
  journalEntries: JournalEntry[]
  messages: string[]
  nextEventDelayAdjustmentSeconds: number
  requestedReturnReason: string | null
}

const RESOURCE_NAMES: Readonly<Record<keyof ExpeditionLoot, string>> = {
  wood: '木材',
  coins: '金币',
  food: '食物',
  medicine: '药品',
}

type RangeRoll = {
  value: number
  nextRngState: number
}

type TargetSelection = {
  hero: HeroState | null
  nextRngState: number
}

function assertNever(value: never): never {
  throw new Error(
    `不支持的事件效果：${String((value as { type?: unknown }).type)}`,
  )
}

function rollRange(range: NumericRange, rngState: number): RangeRoll {
  if (range.min === range.max) {
    return { value: range.min, nextRngState: rngState }
  }

  const roll = randomInt(rngState, range.min, range.max)
  return { value: roll.value, nextRngState: roll.nextState }
}

function byHeroId(left: HeroState, right: HeroState): number {
  return left.id.localeCompare(right.id)
}

function selectHeroTarget(
  target: HeroTarget,
  heroes: readonly HeroState[],
  partyHeroIds: readonly string[],
  rngState: number,
): TargetSelection {
  const party = heroes
    .filter((hero) => partyHeroIds.includes(hero.id))
    .sort(byHeroId)
  if (party.length === 0) {
    return { hero: null, nextRngState: rngState }
  }

  if (target === 'randomPartyMember') {
    const roll = randomInt(rngState, 0, party.length - 1)
    return {
      hero: party[roll.value] ?? null,
      nextRngState: roll.nextState,
    }
  }

  const sorted = [...party].sort((left, right) => {
    let comparison = 0
    switch (target) {
      case 'lowestHealth':
        comparison = left.health - right.health
        break
      case 'highestHealth':
        comparison = right.health - left.health
        break
      case 'lowestPower':
        comparison = left.power - right.power
        break
      case 'highestPower':
        comparison = right.power - left.power
        break
    }
    return comparison === 0 ? byHeroId(left, right) : comparison
  })
  return { hero: sorted[0] ?? null, nextRngState: rngState }
}

function updateHero(
  heroes: readonly HeroState[],
  heroId: string,
  health: number,
): HeroState[] {
  return heroes.map((hero) =>
    hero.id === heroId ? { ...hero, health } : hero,
  )
}

function initialResult(context: EventEffectContext): EventEffectResult {
  return {
    heroes: [...context.heroes],
    loot: { ...context.loot },
    eventFlags: [...context.eventFlags],
    nextRngState: context.rngState,
    journalEntries: [],
    messages: [],
    nextEventDelayAdjustmentSeconds: 0,
    requestedReturnReason: null,
  }
}

// Effect order is definition order. Damage/healing select a target first, then
// roll the amount. Fixed ranges and non-random targets consume no RNG values.
export function applyEventEffects(
  effects: readonly EventEffect[],
  context: EventEffectContext,
): EventEffectResult {
  let result = initialResult(context)

  for (const effect of effects) {
    switch (effect.type) {
      case 'gainLoot': {
        const roll = rollRange(effect.amount, result.nextRngState)
        const amount = roundToNonNegativeSafeInteger(
          roll.value * context.policyModifier.rewardMultiplier,
        )
        result = {
          ...result,
          loot: {
            ...result.loot,
            [effect.resource]: addNonNegativeSafeIntegers(
              result.loot[effect.resource],
              amount,
            ),
          },
          nextRngState: roll.nextRngState,
          messages: [
            ...result.messages,
            `获得 ${amount} 份${RESOURCE_NAMES[effect.resource]}。`,
          ],
        }
        break
      }
      case 'loseLoot': {
        const roll = rollRange(effect.amount, result.nextRngState)
        const amount = roundToNonNegativeSafeInteger(roll.value)
        const lost = Math.min(result.loot[effect.resource], amount)
        result = {
          ...result,
          loot: {
            ...result.loot,
            [effect.resource]: result.loot[effect.resource] - lost,
          },
          nextRngState: roll.nextRngState,
          messages: [
            ...result.messages,
            `失去 ${lost} 份${RESOURCE_NAMES[effect.resource]}。`,
          ],
        }
        break
      }
      case 'damageHero': {
        const target = selectHeroTarget(
          effect.target,
          result.heroes,
          context.partyHeroIds,
          result.nextRngState,
        )
        if (target.hero === null) {
          result = {
            ...result,
            messages: [
              ...result.messages,
              '队伍成员数据缺失，未结算伤害。',
            ],
          }
          break
        }
        const roll = rollRange(effect.amount, target.nextRngState)
        const damage = roundToNonNegativeSafeInteger(
          roll.value * context.policyModifier.damageMultiplier,
        )
        const healthFloor = Math.min(
          target.hero.health,
          Math.max(1, Math.round(effect.minimumHealth ?? 1)),
        )
        const nextHealth = Math.max(healthFloor, target.hero.health - damage)
        const damageTaken = target.hero.health - nextHealth
        result = {
          ...result,
          heroes: updateHero(result.heroes, target.hero.id, nextHealth),
          nextRngState: roll.nextRngState,
          messages: [
            ...result.messages,
            `${target.hero.name} 失去 ${damageTaken} 点生命，当前生命 ${nextHealth}/${target.hero.maxHealth}。`,
          ],
        }
        break
      }
      case 'healHero': {
        const target = selectHeroTarget(
          effect.target,
          result.heroes,
          context.partyHeroIds,
          result.nextRngState,
        )
        if (target.hero === null) {
          result = { ...result }
          break
        }
        const roll = rollRange(effect.amount, target.nextRngState)
        const healing = roundToNonNegativeSafeInteger(roll.value)
        const nextHealth = Math.min(
          target.hero.maxHealth,
          target.hero.health + healing,
        )
        const healed = nextHealth - target.hero.health
        result = {
          ...result,
          heroes: updateHero(result.heroes, target.hero.id, nextHealth),
          nextRngState: roll.nextRngState,
          messages: [
            ...result.messages,
            `${target.hero.name} 恢复 ${healed} 点生命。`,
          ],
        }
        break
      }
      case 'appendJournal': {
        const journalIndex = result.journalEntries.length + 1
        result = {
          ...result,
          journalEntries: [
            ...result.journalEntries,
            {
              id: `${context.expeditionId}-event-${context.eventIndex}-journal-${journalIndex}`,
              timestamp: context.timestamp,
              expeditionId: context.expeditionId,
              category: effect.category,
              title: effect.title,
              text: effect.text,
            },
          ],
        }
        break
      }
      case 'setExpeditionFlag':
        result = {
          ...result,
          eventFlags: result.eventFlags.includes(effect.flag)
            ? [...result.eventFlags]
            : [...result.eventFlags, effect.flag],
        }
        break
      case 'clearExpeditionFlag':
        result = {
          ...result,
          eventFlags: result.eventFlags.filter((flag) => flag !== effect.flag),
        }
        break
      case 'adjustNextEventDelay':
        result = {
          ...result,
          nextEventDelayAdjustmentSeconds:
            result.nextEventDelayAdjustmentSeconds + effect.seconds,
        }
        break
      case 'requestReturn':
        result = {
          ...result,
          requestedReturnReason: effect.reason,
          messages: [
            ...result.messages,
            `队伍决定返程：${effect.reason}`,
          ],
        }
        break
      default:
        assertNever(effect)
    }
  }

  return result
}
