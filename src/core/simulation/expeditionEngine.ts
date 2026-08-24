import { getAdventureEvent } from '../content/events'
import { INVALID_EXPEDITION_CONFIGURATION_TITLE } from '../content/contentDiagnostics'
import { getPolicyDefinition } from '../content/policies'
import { getRegionDefinition } from '../content/regions'
import type { AdventureEventDefinition } from '../content/contentTypes'
import {
  getEventPolicyModifier,
} from '../events/calculateEventWeight'
import type { EventConditionContext } from '../events/evaluateEventConditions'
import { resolveAdventureEvent } from '../events/resolveAdventureEvent'
import { selectAdventureEvent } from '../events/selectAdventureEvent'
import type { GameState } from '../model/gameState'
import type { HeroState } from '../model/hero'
import type { JournalCategory, JournalEntry } from '../model/journal'
import { appendJournal, settleExpedition } from './rewards'

function getRegionEvents(regionEventIds: readonly string[]): AdventureEventDefinition[] {
  return regionEventIds
    .map((eventId) => getAdventureEvent(eventId))
    .filter((event) => event !== undefined)
}

function getParty(
  heroes: readonly HeroState[],
  partyHeroIds: readonly string[],
): HeroState[] {
  return heroes.filter((hero) => partyHeroIds.includes(hero.id))
}

function getConditionContext(
  state: GameState,
  eventIndex: number,
): EventConditionContext | null {
  const expedition = state.activeExpedition
  if (expedition === null) {
    return null
  }

  return {
    regionId: expedition.regionId,
    policy: expedition.policy,
    party: getParty(state.heroes, expedition.partyHeroIds),
    eventIndex,
    loot: expedition.carriedLoot,
    eventFlags: expedition.eventFlags,
  }
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
): JournalCategory {
  if (event.tags.includes('combat')) {
    return 'combat'
  }
  return event.tags.includes('safe') ? 'travel' : 'event'
}

function settleInvalidConfiguration(
  state: GameState,
  eventTimestamp: number,
  detail: string,
): GameState {
  const expedition = state.activeExpedition
  if (expedition === null) {
    return state
  }

  const warning: JournalEntry = {
    id: `${expedition.id}-event-${expedition.processedEventCount + 1}`,
    timestamp: eventTimestamp,
    expeditionId: expedition.id,
    category: 'warning',
    title: INVALID_EXPEDITION_CONFIGURATION_TITLE,
    text: `无法找到可处理的事件，队伍已安全返程。${detail}`,
  }
  return settleExpedition(
    { ...state, journal: appendJournal(state.journal, warning) },
    eventTimestamp,
    'completed',
  )
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
  const eventIndex = expedition.processedEventCount + 1
  const conditionContext = getConditionContext(state, eventIndex)
  if (policy === undefined || region === undefined || conditionContext === null) {
    return settleInvalidConfiguration(state, eventTimestamp, '区域或方针无效。')
  }

  const selection = selectAdventureEvent(
    getRegionEvents(region.eventIds),
    conditionContext,
    expedition.rngState,
  )
  if (selection.event === null) {
    const detail =
      selection.fallbackReason === 'no-positive-weight-events'
        ? '符合条件的事件权重均为零。'
        : '没有事件满足当前条件。'
    return settleInvalidConfiguration(state, eventTimestamp, detail)
  }

  const resolution = resolveAdventureEvent(selection.event, {
    heroes: state.heroes,
    partyHeroIds: expedition.partyHeroIds,
    loot: expedition.carriedLoot,
    eventFlags: expedition.eventFlags,
    rngState: selection.nextRngState,
    policyModifier: getEventPolicyModifier(selection.event, expedition.policy),
    timestamp: eventTimestamp,
    expeditionId: expedition.id,
    eventIndex,
  })
  const eventEntry: JournalEntry = {
    id: `${expedition.id}-event-${eventIndex}`,
    timestamp: eventTimestamp,
    expeditionId: expedition.id,
    sourceEventId: selection.event.id,
    category: getJournalCategory(selection.event),
    title: selection.event.title,
    text: [selection.event.description, ...resolution.messages]
      .filter((part) => part !== undefined && part.length > 0)
      .join(' '),
  }
  const adjustedDelayMs =
    region.eventIntervalMs +
    Math.round(resolution.nextEventDelayAdjustmentSeconds * 1_000)
  const processedState: GameState = {
    ...state,
    updatedAt: Math.max(state.updatedAt, eventTimestamp),
    heroes: resolution.heroes,
    activeExpedition: {
      ...expedition,
      rngState: resolution.nextRngState,
      lastProcessedAt: eventTimestamp,
      nextEventAt: Math.max(eventTimestamp, eventTimestamp + adjustedDelayMs),
      processedEventCount: eventIndex,
      carriedLoot: resolution.loot,
      eventFlags: resolution.eventFlags,
    },
    journal: appendJournal(
      state.journal,
      eventEntry,
      ...resolution.journalEntries,
    ),
  }

  if (eventIndex >= expedition.maxEventCount) {
    return settleExpedition(processedState, eventTimestamp, 'completed')
  }
  if (resolution.requestedReturnReason !== null) {
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
