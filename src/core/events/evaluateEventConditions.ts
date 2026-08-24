import type { EventCondition } from '../content/contentTypes'
import type {
  ExpeditionLoot,
  ExpeditionPolicy,
} from '../model/expedition'
import type { HeroState } from '../model/hero'

export type EventConditionContext = {
  regionId: string
  policy: ExpeditionPolicy
  party: readonly HeroState[]
  /** The event about to be processed, using a 1-based index. */
  eventIndex: number
  loot: Readonly<ExpeditionLoot>
  eventFlags: readonly string[]
}

function assertNever(value: never): never {
  throw new Error(
    `不支持的事件条件：${String((value as { type?: unknown }).type)}`,
  )
}

function minimumHealthRatio(party: readonly HeroState[]): number | null {
  if (party.length === 0) {
    return null
  }

  return Math.min(
    ...party.map((hero) =>
      hero.maxHealth > 0 ? hero.health / hero.maxHealth : 0,
    ),
  )
}

export function evaluateEventCondition(
  condition: EventCondition,
  context: EventConditionContext,
): boolean {
  switch (condition.type) {
    case 'regionIs':
      return context.regionId === condition.regionId
    case 'policyIs':
      return context.policy === condition.policy
    case 'partyHasRole':
      return (
        context.party.filter((hero) => hero.role === condition.role).length >=
        (condition.minimum ?? 1)
      )
    case 'partyHasHero':
      return context.party.some((hero) => hero.id === condition.heroId)
    case 'partyHasTrait':
      return context.party.some((hero) =>
        hero.traitIds.includes(condition.traitId),
      )
    case 'minimumPartyHealthRatioAtMost': {
      const ratio = minimumHealthRatio(context.party)
      return ratio !== null && ratio <= condition.ratio
    }
    case 'minimumPartyHealthRatioAtLeast': {
      const ratio = minimumHealthRatio(context.party)
      return ratio !== null && ratio >= condition.ratio
    }
    case 'eventIndexBetween':
      return (
        (condition.minimum === undefined ||
          context.eventIndex >= condition.minimum) &&
        (condition.maximum === undefined ||
          context.eventIndex <= condition.maximum)
      )
    case 'lootAtLeast':
      return context.loot[condition.resource] >= condition.amount
    case 'expeditionFlagPresent':
      return context.eventFlags.includes(condition.flag)
    case 'expeditionFlagAbsent':
      return !context.eventFlags.includes(condition.flag)
    default:
      return assertNever(condition)
  }
}

export function evaluateEventConditions(
  conditions: readonly EventCondition[] | undefined,
  context: EventConditionContext,
): boolean {
  return (conditions ?? []).every((condition) =>
    evaluateEventCondition(condition, context),
  )
}
