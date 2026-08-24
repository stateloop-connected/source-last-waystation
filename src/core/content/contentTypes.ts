import type { ExpeditionPolicy } from '../model/expedition'
import type { ResourceType } from '../model/gameState'
import type { HeroRole } from '../model/hero'
import type { JournalCategory } from '../model/journal'

export type NumericRange = {
  min: number
  max: number
}

export type HeroDefinition = {
  id: string
  name: string
  role: HeroRole
  level: number
  maxHealth: number
  power: number
  insight: number
  survival: number
  traitIds: readonly string[]
}

export type TraitDefinition = {
  id: string
  name: string
  description: string
}

export const EVENT_TAGS = [
  'safe',
  'reward',
  'danger',
  'combat',
  'discovery',
  'recovery',
] as const

export type EventTag = (typeof EVENT_TAGS)[number]
export type AdventureEventTag = EventTag
export type LootResourceKey = ResourceType

export type EventCondition =
  | { type: 'regionIs'; regionId: string }
  | { type: 'policyIs'; policy: ExpeditionPolicy }
  | { type: 'partyHasRole'; role: HeroRole; minimum?: number }
  | { type: 'partyHasHero'; heroId: string }
  | { type: 'partyHasTrait'; traitId: string }
  | { type: 'minimumPartyHealthRatioAtMost'; ratio: number }
  | { type: 'minimumPartyHealthRatioAtLeast'; ratio: number }
  | { type: 'eventIndexBetween'; minimum?: number; maximum?: number }
  | { type: 'lootAtLeast'; resource: LootResourceKey; amount: number }
  | { type: 'expeditionFlagPresent'; flag: string }
  | { type: 'expeditionFlagAbsent'; flag: string }

export type EventPolicyModifier = {
  weightMultiplier?: number
  rewardMultiplier?: number
  damageMultiplier?: number
}

export type HeroTarget =
  | 'randomPartyMember'
  | 'lowestHealth'
  | 'highestHealth'
  | 'lowestPower'
  | 'highestPower'

export type EventEffect =
  | {
      type: 'gainLoot'
      resource: LootResourceKey
      amount: NumericRange
    }
  | {
      type: 'loseLoot'
      resource: LootResourceKey
      amount: NumericRange
    }
  | {
      type: 'damageHero'
      target: HeroTarget
      amount: NumericRange
      minimumHealth?: number
    }
  | {
      type: 'healHero'
      target: HeroTarget
      amount: NumericRange
    }
  | {
      type: 'appendJournal'
      category: JournalCategory
      title: string
      text: string
    }
  | { type: 'setExpeditionFlag'; flag: string }
  | { type: 'clearExpeditionFlag'; flag: string }
  | { type: 'adjustNextEventDelay'; seconds: number }
  | { type: 'requestReturn'; reason: string }

export type AdventureEventEffect = EventEffect

export type EventResolution =
  | { type: 'effects'; effects: readonly EventEffect[] }
  | {
      type: 'partyCheck'
      stat: 'power' | 'insight' | 'survival'
      difficulty: number
      randomBonus: NumericRange
      successEffects: readonly EventEffect[]
      failureEffects: readonly EventEffect[]
    }

export type AdventureEventDefinition = {
  id: string
  title: string
  description?: string
  regionIds: readonly string[]
  tags: readonly EventTag[]
  baseWeight: number
  conditions?: readonly EventCondition[]
  policyModifiers?: Partial<
    Readonly<Record<ExpeditionPolicy, EventPolicyModifier>>
  >
  resolution: EventResolution
}

export type RegionDefinition = {
  id: string
  name: string
  description: string
  eventIds: readonly string[]
  eventIntervalMs: number
  maxEventCount: number
}

export type BuildingDefinition = {
  id: string
  name: string
  maxLevel: number
  upgradeWoodCosts: readonly number[]
}

export type ExpeditionPolicyDefinition = {
  id: ExpeditionPolicy
  name: string
  description: string
  eventWeightMultipliers: Readonly<
    Record<'travel' | 'discovery' | 'danger', number>
  >
  rewardMultiplier: number
  damageMultiplier: number
  healthReturnThreshold: number | null
}

export type ContentCatalog = {
  heroes: readonly HeroDefinition[]
  traits: readonly TraitDefinition[]
  regions: readonly RegionDefinition[]
  events: readonly AdventureEventDefinition[]
  buildings: readonly BuildingDefinition[]
  policies: readonly ExpeditionPolicyDefinition[]
}

export const RESOURCE_TYPES = [
  'food',
  'medicine',
  'wood',
  'coins',
] as const satisfies readonly ResourceType[]
