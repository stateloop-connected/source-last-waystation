import type {
  GameState,
  JournalEntry,
  Resources,
} from '../../core'
import { GAME_CONTENT } from '../../core'
import type { GameTransitionSummary } from './visualEventTypes'

const RESOURCE_KEYS = [
  'food',
  'medicine',
  'wood',
  'coins',
] as const satisfies readonly (keyof Resources)[]

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

function getNewJournalEntries(
  previous: GameState,
  next: GameState,
): JournalEntry[] {
  const previousIds = new Set(previous.journal.map((entry) => entry.id))
  return next.journal.filter((entry) => !previousIds.has(entry.id))
}

export function isPrimaryAdventureJournalEntry(
  entry: JournalEntry,
): boolean {
  if (entry.expeditionId === undefined) {
    return false
  }
  if (entry.sourceEventId !== undefined) {
    return entry.sourceEventId.trim().length > 0
  }
  return getAdventureEventByTitle(entry.title) !== undefined
}

function getAdventureEventByTitle(title: string) {
  return GAME_CONTENT.events.find((event) => event.title === title)
}

function getProcessedEventCount(
  previous: GameState,
  next: GameState,
): number {
  const previousExpedition = previous.activeExpedition
  const nextExpedition = next.activeExpedition

  if (
    previousExpedition !== null &&
    nextExpedition !== null &&
    previousExpedition.id === nextExpedition.id
  ) {
    return Math.max(
      0,
      nextExpedition.processedEventCount -
        previousExpedition.processedEventCount,
    )
  }

  if (previousExpedition !== null && nextExpedition === null) {
    return getNewJournalEntries(previous, next).filter(
      (entry) =>
        entry.expeditionId === previousExpedition.id &&
        isPrimaryAdventureJournalEntry(entry),
    ).length
  }

  return 0
}

function getResourceDeltas(
  previous: GameState,
  next: GameState,
): Resources {
  const previousExpedition = previous.activeExpedition
  const nextExpedition = next.activeExpedition
  if (
    previousExpedition !== null &&
    nextExpedition !== null &&
    previousExpedition.id === nextExpedition.id
  ) {
    return subtractResources(
      previousExpedition.carriedLoot,
      nextExpedition.carriedLoot,
    )
  }
  return subtractResources(previous.resources, next.resources)
}

function getHeroHealthDeltas(
  previous: GameState,
  next: GameState,
): Readonly<Record<string, number>> {
  const previousHealth = new Map(
    previous.heroes.map((hero) => [hero.id, hero.health]),
  )
  const deltas: Record<string, number> = {}
  for (const hero of next.heroes) {
    const priorHealth = previousHealth.get(hero.id)
    if (priorHealth === undefined || priorHealth === hero.health) {
      continue
    }
    deltas[hero.id] = hero.health - priorHealth
  }
  return deltas
}

export function deriveTransitionSummary(
  previous: GameState,
  next: GameState,
): GameTransitionSummary {
  return {
    elapsedMs: Math.max(0, next.lastAdvancedAt - previous.lastAdvancedAt),
    eventCount: getProcessedEventCount(previous, next),
    completedExpeditions: Math.max(
      0,
      next.completedExpeditions - previous.completedExpeditions,
    ),
    resourceDeltas: getResourceDeltas(previous, next),
    heroHealthDeltas: getHeroHealthDeltas(previous, next),
  }
}

export function hasTransitionProgress(
  summary: GameTransitionSummary,
): boolean {
  return (
    summary.eventCount > 0 ||
    summary.completedExpeditions > 0 ||
    RESOURCE_KEYS.some((key) => summary.resourceDeltas[key] !== 0) ||
    Object.values(summary.heroHealthDeltas).some((delta) => delta !== 0)
  )
}
