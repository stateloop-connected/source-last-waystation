import { HERO_ROLES } from '../model/hero'
import { BUILDING_DEFINITIONS } from './buildings'
import type {
  AdventureEventEffect,
  ContentCatalog,
} from './contentTypes'
import { RESOURCE_TYPES } from './contentTypes'
import { ADVENTURE_EVENTS } from './events'
import { HERO_DEFINITIONS } from './heroes'
import { EXPEDITION_POLICY_DEFINITIONS } from './policies'
import { REGION_DEFINITIONS } from './regions'

export type ContentValidationResult = {
  valid: boolean
  errors: string[]
}

export const GAME_CONTENT: ContentCatalog = {
  heroes: HERO_DEFINITIONS,
  regions: REGION_DEFINITIONS,
  events: ADVENTURE_EVENTS,
  buildings: BUILDING_DEFINITIONS,
  policies: EXPEDITION_POLICY_DEFINITIONS,
}

function collectDuplicateIds(
  label: string,
  values: readonly { id: string }[],
): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const value of values) {
    if (seen.has(value.id)) {
      duplicates.add(value.id)
    }
    seen.add(value.id)
  }

  return [...duplicates].map((id) => `${label} ID 重复：${id}`)
}

function validateEffects(
  eventId: string,
  effects: readonly AdventureEventEffect[],
): string[] {
  const errors: string[] = []
  const resources = new Set<string>(RESOURCE_TYPES)

  for (const effect of effects) {
    switch (effect.type) {
      case 'gainLoot':
        if (!resources.has(effect.resource)) {
          errors.push(`事件 ${eventId} 使用了非法资源：${effect.resource}`)
        }
        if (
          !Number.isInteger(effect.min) ||
          !Number.isInteger(effect.max) ||
          effect.min < 0 ||
          effect.max < effect.min
        ) {
          errors.push(`事件 ${eventId} 的战利品范围无效。`)
        }
        break
      case 'damageRandomHero':
        if (
          !Number.isInteger(effect.min) ||
          !Number.isInteger(effect.max) ||
          effect.min < 0 ||
          effect.max < effect.min
        ) {
          errors.push(`事件 ${eventId} 的伤害范围无效。`)
        }
        break
      case 'abilityCheck':
        if (!Number.isFinite(effect.difficulty)) {
          errors.push(`事件 ${eventId} 的能力检定难度无效。`)
        }
        errors.push(
          ...validateEffects(eventId, effect.successEffects),
          ...validateEffects(eventId, effect.failureEffects),
        )
        break
    }
  }

  return errors
}

export function validateContent(
  catalog: ContentCatalog = GAME_CONTENT,
): ContentValidationResult {
  const errors = [
    ...collectDuplicateIds('英雄', catalog.heroes),
    ...collectDuplicateIds('区域', catalog.regions),
    ...collectDuplicateIds('事件', catalog.events),
    ...collectDuplicateIds('建筑', catalog.buildings),
    ...collectDuplicateIds('行动方针', catalog.policies),
  ]
  const roles = new Set<string>(HERO_ROLES)
  const eventIds = new Set(catalog.events.map((event) => event.id))
  const policyIds = new Set(catalog.policies.map((policy) => policy.id))

  for (const hero of catalog.heroes) {
    if (!roles.has(hero.role)) {
      errors.push(`英雄 ${hero.id} 使用了非法职业：${hero.role}`)
    }
  }

  for (const event of catalog.events) {
    if (!Number.isFinite(event.weight) || event.weight <= 0) {
      errors.push(`事件 ${event.id} 的权重必须大于 0。`)
    }
    for (const policy of event.allowedPolicies ?? []) {
      if (!policyIds.has(policy)) {
        errors.push(`事件 ${event.id} 引用了未知行动方针：${policy}`)
      }
    }
    errors.push(...validateEffects(event.id, event.effects))
  }

  for (const region of catalog.regions) {
    const reachableEvents = region.eventIds
      .map((id) => catalog.events.find((event) => event.id === id))
      .filter((event) => event !== undefined)
    for (const eventId of region.eventIds) {
      if (!eventIds.has(eventId)) {
        errors.push(`区域 ${region.id} 引用了未知事件：${eventId}`)
      }
    }
    if (
      !reachableEvents.some(
        (event) =>
          event.allowedPolicies === undefined ||
          event.allowedPolicies.some((policy) => policyIds.has(policy)),
      )
    ) {
      errors.push(`区域 ${region.id} 没有可达事件。`)
    }
    if (
      !Number.isInteger(region.eventIntervalMs) ||
      !Number.isInteger(region.maxEventCount) ||
      region.eventIntervalMs <= 0 ||
      region.maxEventCount <= 0
    ) {
      errors.push(`区域 ${region.id} 的推进配置无效。`)
    }
  }

  if (!catalog.regions.some((region) => region.id === 'black-fir-forest')) {
    errors.push('缺少必需区域：black-fir-forest')
  }

  for (const building of catalog.buildings) {
    if (
      building.maxLevel < 0 ||
      building.upgradeWoodCosts.length !== building.maxLevel ||
      building.upgradeWoodCosts.some(
        (cost) => !Number.isInteger(cost) || cost <= 0,
      )
    ) {
      errors.push(`建筑 ${building.id} 的升级配置无效。`)
    }
  }

  for (const policy of catalog.policies) {
    if (
      !Number.isFinite(policy.rewardMultiplier) ||
      !Number.isFinite(policy.damageMultiplier) ||
      policy.rewardMultiplier <= 0 ||
      policy.damageMultiplier <= 0 ||
      Object.values(policy.eventWeightMultipliers).some(
        (multiplier) => !Number.isFinite(multiplier) || multiplier <= 0,
      )
    ) {
      errors.push(`行动方针 ${policy.id} 的倍率配置无效。`)
    }
  }

  return { valid: errors.length === 0, errors }
}

export function assertValidContent(
  catalog: ContentCatalog = GAME_CONTENT,
): void {
  const result = validateContent(catalog)
  if (!result.valid) {
    throw new Error(`内容校验失败：\n${result.errors.join('\n')}`)
  }
}
