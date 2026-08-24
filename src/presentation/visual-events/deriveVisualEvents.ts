import {
  GAME_CONTENT,
  RESOURCE_TYPES,
  getAdventureEvent,
  type EventTag,
  type GameState,
  type JournalEntry,
  type Resources,
} from '../../core'
import {
  deriveTransitionSummary,
  hasTransitionProgress,
  isPrimaryAdventureJournalEntry,
} from './deriveTransitionSummary'
import type {
  EventRevealedVisualEvent,
  GameTransitionSource,
  HeroHealthDeltas,
  ProgressSummaryKind,
  ProgressSummaryVisualEvent,
  VisualEvent,
} from './visualEventTypes'
import { VISUAL_EVENT_TAG_PRIORITY } from './visualEventTypes'

const IMPORTANT_EVENT_TAGS = new Set<EventTag>([
  ...VISUAL_EVENT_TAG_PRIORITY.filter((tag) => tag !== 'safe'),
])

function hashText(value: string): string {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(36)
}

function getNewJournalEntries(
  previous: GameState,
  next: GameState,
): JournalEntry[] {
  const previousIds = new Set(previous.journal.map((entry) => entry.id))
  return next.journal.filter((entry) => !previousIds.has(entry.id))
}

function getTransitionId(
  previous: GameState,
  next: GameState,
  source: GameTransitionSource,
  newJournalEntries: readonly JournalEntry[],
): string {
  const heroHealth = next.heroes
    .map((hero) => {
      const previousHero = previous.heroes.find(
        (candidate) => candidate.id === hero.id,
      )
      return `${hero.id}:${previousHero?.health ?? 'new'}:${hero.health}`
    })
    .join(',')
  const expeditionLoot = RESOURCE_TYPES.map((resource) =>
    [
      resource,
      previous.activeExpedition?.carriedLoot[resource] ?? 'none',
      next.activeExpedition?.carriedLoot[resource] ?? 'none',
    ].join(':'),
  ).join(',')
  const fingerprint = [
    source,
    previous.updatedAt,
    next.updatedAt,
    previous.lastAdvancedAt,
    next.lastAdvancedAt,
    previous.activeExpedition?.id ?? 'none',
    previous.activeExpedition?.processedEventCount ?? 0,
    next.activeExpedition?.id ?? 'none',
    next.activeExpedition?.processedEventCount ?? 0,
    RESOURCE_TYPES.map(
      (resource) =>
        `${resource}:${previous.resources[resource]}:${next.resources[resource]}`,
    ).join(','),
    expeditionLoot,
    heroHealth,
    newJournalEntries.map((entry) => entry.id).join(','),
  ].join('|')
  return `transition-${hashText(fingerprint)}`
}

function getTransitionExpeditionId(
  previous: GameState,
  next: GameState,
): string | undefined {
  const previousExpedition = previous.activeExpedition
  const nextExpedition = next.activeExpedition
  if (
    previousExpedition !== null &&
    nextExpedition !== null &&
    previousExpedition.id === nextExpedition.id
  ) {
    return nextExpedition.id
  }
  if (previousExpedition !== null && nextExpedition === null) {
    return previousExpedition.id
  }
  return undefined
}

function getFallbackTags(entry: JournalEntry): readonly EventTag[] {
  switch (entry.category) {
    case 'combat':
      return ['combat', 'danger']
    case 'warning':
      return ['danger']
    case 'reward':
      return ['reward']
    case 'travel':
      return ['safe']
    case 'event':
      return ['discovery']
    case 'return':
    case 'system':
      return ['safe']
  }
}

function getEventDefinition(entry: JournalEntry) {
  if (entry.sourceEventId !== undefined) {
    return getAdventureEvent(entry.sourceEventId)
  }
  return GAME_CONTENT.events.find((event) => event.title === entry.title)
}

function createEventRevealed(
  entry: JournalEntry,
  transitionId: string,
  source: GameTransitionSource,
): EventRevealedVisualEvent | null {
  if (entry.expeditionId === undefined) {
    return null
  }
  const definition = getEventDefinition(entry)
  return {
    id: `${transitionId}:journal:${entry.id}`,
    transitionId,
    source,
    type: 'eventRevealed',
    expeditionId: entry.expeditionId,
    journalEntryId: entry.id,
    ...(entry.sourceEventId === undefined
      ? {}
      : { sourceEventId: entry.sourceEventId }),
    title: entry.title,
    text: entry.text,
    tags:
      definition === undefined
        ? [...getFallbackTags(entry)]
        : [...definition.tags],
  }
}

function getSummaryKind(
  source: GameTransitionSource,
): ProgressSummaryKind {
  switch (source) {
    case 'bootstrap':
      return 'offline'
    case 'importSave':
      return 'import'
    case 'backgroundRecovery':
      return 'background'
    case 'liveTick':
    case 'startCommand':
    case 'retreatCommand':
    case 'debugAdvance':
    case 'resetGame':
    case 'upgradeCommand':
    case 'debugCommand':
      return 'batch'
  }
}

function createProgressSummary(
  previous: GameState,
  next: GameState,
  source: GameTransitionSource,
  transitionId: string,
): ProgressSummaryVisualEvent {
  const summary = deriveTransitionSummary(previous, next)
  const summaryKind = getSummaryKind(source)
  return {
    id: `${transitionId}:summary:${summaryKind}`,
    transitionId,
    source,
    type: 'progressSummary',
    summaryKind,
    elapsedMs: summary.elapsedMs,
    eventCount: summary.eventCount,
    completedExpeditions: summary.completedExpeditions,
    resourceDeltas: { ...summary.resourceDeltas },
    heroHealthDeltas: { ...summary.heroHealthDeltas },
  }
}

function getHealthEvents(
  previous: GameState,
  next: GameState,
  transitionId: string,
  source: GameTransitionSource,
): VisualEvent[] {
  const previousHeroes = new Map(
    previous.heroes.map((hero) => [hero.id, hero]),
  )
  const events: VisualEvent[] = []
  for (const hero of next.heroes) {
    const previousHero = previousHeroes.get(hero.id)
    if (previousHero === undefined || previousHero.health === hero.health) {
      continue
    }
    if (hero.health < previousHero.health) {
      events.push({
        id: `${transitionId}:hero:${hero.id}:damaged`,
        transitionId,
        source,
        type: 'heroDamaged',
        heroId: hero.id,
        amount: previousHero.health - hero.health,
      })
    } else {
      events.push({
        id: `${transitionId}:hero:${hero.id}:healed`,
        transitionId,
        source,
        type: 'heroHealed',
        heroId: hero.id,
        amount: hero.health - previousHero.health,
      })
    }
  }
  return events
}

function getLootEvents(
  previous: GameState,
  next: GameState,
  transitionId: string,
  source: GameTransitionSource,
): VisualEvent[] {
  const previousExpedition = previous.activeExpedition
  const nextExpedition = next.activeExpedition
  if (
    previousExpedition === null ||
    nextExpedition === null ||
    previousExpedition.id !== nextExpedition.id
  ) {
    return []
  }

  const events: VisualEvent[] = []
  for (const resource of RESOURCE_TYPES) {
    const amount =
      nextExpedition.carriedLoot[resource] -
      previousExpedition.carriedLoot[resource]
    if (amount === 0) {
      continue
    }
    events.push({
      id: `${transitionId}:loot:${resource}`,
      transitionId,
      source,
      type: 'lootChanged',
      expeditionId: nextExpedition.id,
      resource,
      amount,
    })
  }
  return events
}

function subtractResources(
  previous: Readonly<Resources>,
  next: Readonly<Resources>,
): Resources {
  return {
    food: next.food - previous.food,
    medicine: next.medicine - previous.medicine,
    wood: next.wood - previous.wood,
    coins: next.coins - previous.coins,
  }
}

function getHeroHealthDeltas(
  previous: GameState,
  next: GameState,
): HeroHealthDeltas {
  const previousHeroes = new Map(
    previous.heroes.map((hero) => [hero.id, hero.health]),
  )
  const deltas: Record<string, number> = {}
  for (const hero of next.heroes) {
    const previousHealth = previousHeroes.get(hero.id)
    if (previousHealth !== undefined && previousHealth !== hero.health) {
      deltas[hero.id] = hero.health - previousHealth
    }
  }
  return deltas
}

function deriveFullVisualEvents(
  previous: GameState,
  next: GameState,
  source: GameTransitionSource,
  transitionId: string,
  newJournalEntries: readonly JournalEntry[],
): VisualEvent[] {
  const events: VisualEvent[] = []
  const previousExpedition = previous.activeExpedition
  const nextExpedition = next.activeExpedition

  if (previousExpedition === null && nextExpedition !== null) {
    events.push({
      id: `${transitionId}:expedition:${nextExpedition.id}:started`,
      transitionId,
      source,
      type: 'expeditionStarted',
      expeditionId: nextExpedition.id,
      heroIds: [...nextExpedition.partyHeroIds],
    })
  }

  if (
    previousExpedition !== null &&
    nextExpedition !== null &&
    previousExpedition.id === nextExpedition.id &&
    nextExpedition.processedEventCount >
      previousExpedition.processedEventCount
  ) {
    events.push({
      id: `${transitionId}:expedition:${nextExpedition.id}:advanced`,
      transitionId,
      source,
      type: 'partyAdvanced',
      expeditionId: nextExpedition.id,
      fromIndex: previousExpedition.processedEventCount,
      toIndex: nextExpedition.processedEventCount,
      maxEventCount: nextExpedition.maxEventCount,
    })
  }

  const expeditionId = getTransitionExpeditionId(previous, next)
  if (expeditionId !== undefined) {
    for (const entry of newJournalEntries) {
      if (
        entry.expeditionId !== expeditionId ||
        !isPrimaryAdventureJournalEntry(entry)
      ) {
        continue
      }
      const revealed = createEventRevealed(entry, transitionId, source)
      if (revealed !== null) {
        events.push(revealed)
      }
    }
  }

  events.push(...getHealthEvents(previous, next, transitionId, source))
  events.push(...getLootEvents(previous, next, transitionId, source))

  if (previousExpedition !== null && nextExpedition === null) {
    const summary = deriveTransitionSummary(previous, next)
    events.push({
      id: `${transitionId}:expedition:${previousExpedition.id}:returned`,
      transitionId,
      source,
      type: 'expeditionReturned',
      expeditionId: previousExpedition.id,
      processedEventCount:
        previousExpedition.processedEventCount + summary.eventCount,
      completedExpeditionsDelta: summary.completedExpeditions,
      resourceDeltas: subtractResources(previous.resources, next.resources),
      heroHealthDeltas: getHeroHealthDeltas(previous, next),
    })
  }

  return events
}

function isImportantEvent(
  event: EventRevealedVisualEvent,
): boolean {
  return event.tags.some((tag) => IMPORTANT_EVENT_TAGS.has(tag))
}

export function deriveVisualEvents(
  previous: GameState,
  next: GameState,
  source: GameTransitionSource,
): VisualEvent[] {
  if (source === 'resetGame') {
    return []
  }

  const newJournalEntries = getNewJournalEntries(previous, next)
  const transitionId = getTransitionId(
    previous,
    next,
    source,
    newJournalEntries,
  )
  const summary = deriveTransitionSummary(previous, next)
  const progressSummary = createProgressSummary(
    previous,
    next,
    source,
    transitionId,
  )

  if (source === 'importSave') {
    return [progressSummary]
  }
  if (source === 'bootstrap' || source === 'backgroundRecovery') {
    return hasTransitionProgress(summary) ? [progressSummary] : []
  }

  const fullEvents = deriveFullVisualEvents(
    previous,
    next,
    source,
    transitionId,
    newJournalEntries,
  )
  const returned = fullEvents.find(
    (event) => event.type === 'expeditionReturned',
  )

  if (summary.eventCount > 3) {
    return returned === undefined
      ? [progressSummary]
      : [progressSummary, returned]
  }
  if (summary.eventCount >= 2) {
    const lastImportantEvent = fullEvents
      .filter(
        (event): event is EventRevealedVisualEvent =>
          event.type === 'eventRevealed',
      )
      .findLast(isImportantEvent)
    return [
      ...(lastImportantEvent === undefined ? [] : [lastImportantEvent]),
      progressSummary,
      ...(returned === undefined ? [] : [returned]),
    ]
  }

  return fullEvents
}
