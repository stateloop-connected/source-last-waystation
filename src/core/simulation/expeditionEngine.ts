import { getAdventureEvent } from '../content/events'
import { getPolicyDefinition } from '../content/policies'
import { getRegionDefinition } from '../content/regions'
import type {
  AdventureEventDefinition,
  AdventureEventEffect,
  ExpeditionPolicyDefinition,
} from '../content/contentTypes'
import type { ExpeditionLoot } from '../model/expedition'
import type { GameState } from '../model/gameState'
import type { HeroState } from '../model/hero'
import type { JournalCategory, JournalEntry } from '../model/journal'
import { randomInt, weightedChoice } from '../rng/seededRng'
import { appendJournal, settleExpedition } from './rewards'

type EffectResolution = {
  heroes: HeroState[]
  loot: ExpeditionLoot
  rngState: number
  messages: string[]
  usedAbilityCheck: boolean
}

const RESOURCE_NAMES: Readonly<Record<keyof ExpeditionLoot, string>> = {
  wood: '木材',
  coins: '金币',
  food: '食物',
  medicine: '药品',
}

function getAvailableEvents(
  state: GameState,
): AdventureEventDefinition[] {
  const expedition = state.activeExpedition
  if (expedition === null) {
    return []
  }

  const region = getRegionDefinition(expedition.regionId)
  if (region === undefined) {
    return []
  }

  const events: AdventureEventDefinition[] = []
  for (const eventId of region.eventIds) {
    const event = getAdventureEvent(eventId)
    if (
      event !== undefined &&
      (event.allowedPolicies === undefined ||
        event.allowedPolicies.includes(expedition.policy))
    ) {
      events.push(event)
    }
  }
  return events
}

function resolveEffects(
  effects: readonly AdventureEventEffect[],
  partyHeroIds: readonly string[],
  policy: ExpeditionPolicyDefinition,
  initial: EffectResolution,
): EffectResolution {
  let resolution = initial

  for (const effect of effects) {
    switch (effect.type) {
      case 'gainLoot': {
        const rolledAmount = randomInt(
          resolution.rngState,
          effect.min,
          effect.max,
        )
        const amount = Math.max(
          0,
          Math.round(rolledAmount.value * policy.rewardMultiplier),
        )
        resolution = {
          ...resolution,
          loot: {
            ...resolution.loot,
            [effect.resource]: resolution.loot[effect.resource] + amount,
          },
          rngState: rolledAmount.nextState,
          messages: [
            ...resolution.messages,
            `获得 ${amount} 份${RESOURCE_NAMES[effect.resource]}。`,
          ],
        }
        break
      }
      case 'damageRandomHero': {
        const party = resolution.heroes.filter((hero) =>
          partyHeroIds.includes(hero.id),
        )
        if (party.length === 0) {
          resolution = {
            ...resolution,
            messages: [...resolution.messages, '队伍成员数据缺失，未结算伤害。'],
          }
          break
        }

        const targetRoll = randomInt(
          resolution.rngState,
          0,
          party.length - 1,
        )
        const target = party[targetRoll.value]
        if (target === undefined) {
          break
        }
        const damageRoll = randomInt(
          targetRoll.nextState,
          effect.min,
          effect.max,
        )
        const intendedDamage = Math.max(
          1,
          Math.round(damageRoll.value * policy.damageMultiplier),
        )
        const nextHealth = Math.max(1, target.health - intendedDamage)
        const damageTaken = target.health - nextHealth
        resolution = {
          ...resolution,
          heroes: resolution.heroes.map((hero) =>
            hero.id === target.id ? { ...hero, health: nextHealth } : hero,
          ),
          rngState: damageRoll.nextState,
          messages: [
            ...resolution.messages,
            `${target.name} 失去 ${damageTaken} 点生命，当前生命 ${nextHealth}/${target.maxHealth}。`,
          ],
        }
        break
      }
      case 'abilityCheck': {
        const modifierRoll = randomInt(resolution.rngState, -3, 3)
        const partyScore = resolution.heroes
          .filter((hero) => partyHeroIds.includes(hero.id))
          .reduce((sum, hero) => sum + hero[effect.ability], 0)
        const total = partyScore + modifierRoll.value
        const succeeded = total >= effect.difficulty
        const checked: EffectResolution = {
          ...resolution,
          rngState: modifierRoll.nextState,
          messages: [
            ...resolution.messages,
            succeeded
              ? `能力检定成功（${total}/${effect.difficulty}）。`
              : `能力检定失败（${total}/${effect.difficulty}）。`,
          ],
          usedAbilityCheck: true,
        }
        resolution = resolveEffects(
          succeeded ? effect.successEffects : effect.failureEffects,
          partyHeroIds,
          policy,
          checked,
        )
        break
      }
    }
  }

  return resolution
}

function shouldCautiousPartyReturn(
  heroes: readonly HeroState[],
  partyHeroIds: readonly string[],
  threshold: number | null,
): boolean {
  if (threshold === null) {
    return false
  }

  return heroes.some(
    (hero) =>
      partyHeroIds.includes(hero.id) &&
      hero.health < hero.maxHealth * threshold,
  )
}

function getJournalCategory(
  event: AdventureEventDefinition,
  usedAbilityCheck: boolean,
): JournalCategory {
  if (usedAbilityCheck) {
    return 'combat'
  }
  return event.tag === 'travel' ? 'travel' : 'event'
}

export function processNextExpeditionEvent(
  state: GameState,
  eventTimestamp: number,
): GameState {
  const expedition = state.activeExpedition
  if (expedition === null || expedition.status !== 'active') {
    return state
  }

  const policy = getPolicyDefinition(expedition.policy)
  const region = getRegionDefinition(expedition.regionId)
  const availableEvents = getAvailableEvents(state)
  if (
    policy === undefined ||
    region === undefined ||
    availableEvents.length === 0
  ) {
    const warning: JournalEntry = {
      id: `${expedition.id}-event-${expedition.processedEventCount + 1}`,
      timestamp: eventTimestamp,
      expeditionId: expedition.id,
      category: 'warning',
      title: '远征配置异常',
      text: '无法找到可处理的事件，队伍已安全返程。',
    }
    return settleExpedition(
      { ...state, journal: appendJournal(state.journal, warning) },
      eventTimestamp,
      'completed',
    )
  }

  const selected = weightedChoice(
    expedition.rngState,
    availableEvents.map((event) => ({
      value: event,
      weight: event.weight * policy.eventWeightMultipliers[event.tag],
    })),
  )
  const resolution = resolveEffects(
    selected.value.effects,
    expedition.partyHeroIds,
    policy,
    {
      heroes: state.heroes,
      loot: expedition.carriedLoot,
      rngState: selected.nextState,
      messages: [],
      usedAbilityCheck: false,
    },
  )
  const processedEventCount = expedition.processedEventCount + 1
  const eventEntry: JournalEntry = {
    id: `${expedition.id}-event-${processedEventCount}`,
    timestamp: eventTimestamp,
    expeditionId: expedition.id,
    category: getJournalCategory(selected.value, resolution.usedAbilityCheck),
    title: selected.value.title,
    text: [selected.value.text, ...resolution.messages].join(' '),
  }
  const processedState: GameState = {
    ...state,
    updatedAt: Math.max(state.updatedAt, eventTimestamp),
    heroes: resolution.heroes,
    activeExpedition: {
      ...expedition,
      rngState: resolution.rngState,
      lastProcessedAt: eventTimestamp,
      nextEventAt: eventTimestamp + region.eventIntervalMs,
      processedEventCount,
      carriedLoot: resolution.loot,
    },
    journal: appendJournal(state.journal, eventEntry),
  }

  if (processedEventCount >= expedition.maxEventCount) {
    return settleExpedition(processedState, eventTimestamp, 'completed')
  }
  if (
    shouldCautiousPartyReturn(
      resolution.heroes,
      expedition.partyHeroIds,
      policy.healthReturnThreshold,
    )
  ) {
    return settleExpedition(processedState, eventTimestamp, 'cautious')
  }

  return processedState
}
