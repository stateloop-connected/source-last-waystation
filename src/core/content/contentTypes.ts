import type { ExpeditionPolicy } from '../model/expedition'
import type { ResourceType } from '../model/gameState'
import type { HeroRole } from '../model/hero'

export type HeroDefinition = {
  id: string
  name: string
  role: HeroRole
  level: number
  maxHealth: number
  power: number
  insight: number
  survival: number
}

export type AdventureEventTag = 'travel' | 'discovery' | 'danger'

export type GainLootEffect = {
  type: 'gainLoot'
  resource: ResourceType
  min: number
  max: number
}

export type DamageRandomHeroEffect = {
  type: 'damageRandomHero'
  min: number
  max: number
}

export type AbilityCheckEffect = {
  type: 'abilityCheck'
  ability: 'power' | 'insight' | 'survival'
  difficulty: number
  successEffects: readonly AdventureEventEffect[]
  failureEffects: readonly AdventureEventEffect[]
}

export type AdventureEventEffect =
  | GainLootEffect
  | DamageRandomHeroEffect
  | AbilityCheckEffect

export type AdventureEventDefinition = {
  id: string
  title: string
  text: string
  weight: number
  tag: AdventureEventTag
  allowedPolicies?: readonly ExpeditionPolicy[]
  effects: readonly AdventureEventEffect[]
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
  eventWeightMultipliers: Readonly<Record<AdventureEventTag, number>>
  rewardMultiplier: number
  damageMultiplier: number
  healthReturnThreshold: number | null
}

export type ContentCatalog = {
  heroes: readonly HeroDefinition[]
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
