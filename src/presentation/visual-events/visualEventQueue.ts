import type { Resources } from '../../core'
import type {
  GameTransitionSource,
  HeroHealthDeltas,
  ProgressSummaryVisualEvent,
  VisualEvent,
} from './visualEventTypes'

export const MAX_VISUAL_EVENT_QUEUE_LENGTH = 8
const MAX_SEEN_VISUAL_EVENT_IDS = 128

export type VisualEventQueueState = {
  items: readonly VisualEvent[]
  seenEventIds: readonly string[]
}

export type DequeuedVisualEvent = {
  event: VisualEvent | null
  queue: VisualEventQueueState
}

const ZERO_RESOURCES: Resources = {
  food: 0,
  medicine: 0,
  wood: 0,
  coins: 0,
}

export function createVisualEventQueue(): VisualEventQueueState {
  return { items: [], seenEventIds: [] }
}

function hashText(value: string): string {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(36)
}

function addResources(target: Resources, values: Readonly<Resources>): void {
  target.food += values.food
  target.medicine += values.medicine
  target.wood += values.wood
  target.coins += values.coins
}

function addHeroHealthDeltas(
  target: Record<string, number>,
  values: HeroHealthDeltas,
): void {
  for (const [heroId, delta] of Object.entries(values)) {
    target[heroId] = (target[heroId] ?? 0) + delta
  }
}

function getGroupSummary(events: readonly VisualEvent[]): {
  elapsedMs: number
  eventCount: number
  completedExpeditions: number
  resourceDeltas: Resources
  heroHealthDeltas: Record<string, number>
} {
  const existingSummary = events.findLast(
    (event): event is ProgressSummaryVisualEvent =>
      event.type === 'progressSummary',
  )
  if (existingSummary !== undefined) {
    return {
      elapsedMs: existingSummary.elapsedMs,
      eventCount: existingSummary.eventCount,
      completedExpeditions: existingSummary.completedExpeditions,
      resourceDeltas: { ...existingSummary.resourceDeltas },
      heroHealthDeltas: { ...existingSummary.heroHealthDeltas },
    }
  }

  const returned = events.findLast(
    (event) => event.type === 'expeditionReturned',
  )
  const advanceCount = events
    .filter((event) => event.type === 'partyAdvanced')
    .reduce(
      (total, event) => total + Math.max(0, event.toIndex - event.fromIndex),
      0,
    )
  const eventCount =
    advanceCount > 0
      ? advanceCount
      : events.filter((event) => event.type === 'eventRevealed').length

  if (returned !== undefined && returned.type === 'expeditionReturned') {
    return {
      elapsedMs: 0,
      eventCount,
      completedExpeditions: returned.completedExpeditionsDelta,
      resourceDeltas: { ...returned.resourceDeltas },
      heroHealthDeltas: { ...returned.heroHealthDeltas },
    }
  }

  const resourceDeltas = { ...ZERO_RESOURCES }
  const heroHealthDeltas: Record<string, number> = {}
  for (const event of events) {
    if (event.type === 'lootChanged') {
      resourceDeltas[event.resource] += event.amount
    } else if (event.type === 'heroDamaged') {
      heroHealthDeltas[event.heroId] =
        (heroHealthDeltas[event.heroId] ?? 0) - event.amount
    } else if (event.type === 'heroHealed') {
      heroHealthDeltas[event.heroId] =
        (heroHealthDeltas[event.heroId] ?? 0) + event.amount
    }
  }
  return {
    elapsedMs: 0,
    eventCount,
    completedExpeditions: 0,
    resourceDeltas,
    heroHealthDeltas,
  }
}

export function collapseVisualEventsToSummary(
  events: readonly VisualEvent[],
): ProgressSummaryVisualEvent | null {
  if (events.length === 0) {
    return null
  }

  const groups = new Map<string, VisualEvent[]>()
  for (const event of events) {
    const group = groups.get(event.transitionId)
    if (group === undefined) {
      groups.set(event.transitionId, [event])
    } else {
      group.push(event)
    }
  }

  let elapsedMs = 0
  let eventCount = 0
  let completedExpeditions = 0
  const resourceDeltas = { ...ZERO_RESOURCES }
  const heroHealthDeltas: Record<string, number> = {}
  for (const group of groups.values()) {
    const summary = getGroupSummary(group)
    elapsedMs += summary.elapsedMs
    eventCount += summary.eventCount
    completedExpeditions += summary.completedExpeditions
    addResources(resourceDeltas, summary.resourceDeltas)
    addHeroHealthDeltas(heroHealthDeltas, summary.heroHealthDeltas)
  }

  const first = events[0]
  const last = events.at(-1)
  if (first === undefined || last === undefined) {
    return null
  }
  const collapsedIds = events.map((event) => event.id).join('|')
  const transitionId = `queue-overflow:${first.transitionId}:${last.transitionId}`
  return {
    id: `${transitionId}:${hashText(collapsedIds)}`,
    transitionId,
    source: last.source,
    type: 'progressSummary',
    summaryKind: 'queueOverflow',
    elapsedMs,
    eventCount,
    completedExpeditions,
    resourceDeltas,
    heroHealthDeltas,
  }
}

function uniqueById(events: readonly VisualEvent[]): VisualEvent[] {
  const ids = new Set<string>()
  const unique: VisualEvent[] = []
  for (const event of events) {
    if (!ids.has(event.id)) {
      ids.add(event.id)
      unique.push(event)
    }
  }
  return unique
}

function isReplacementSource(source: GameTransitionSource): boolean {
  return (
    source === 'bootstrap' ||
    source === 'startCommand' ||
    source === 'importSave' ||
    source === 'backgroundRecovery'
  )
}

export function enqueueVisualEvents(
  queue: VisualEventQueueState,
  incoming: readonly VisualEvent[],
  source: GameTransitionSource,
): VisualEventQueueState {
  if (source === 'resetGame') {
    return createVisualEventQueue()
  }

  const currentQueue =
    source === 'importSave' ? createVisualEventQueue() : queue
  const seenIds = new Set(currentQueue.seenEventIds)
  const queuedIds = new Set(currentQueue.items.map((event) => event.id))
  const uniqueIncoming = uniqueById(incoming)
  const accepted = uniqueIncoming.filter(
    (event) => !seenIds.has(event.id) || queuedIds.has(event.id),
  )
  const items = isReplacementSource(source)
    ? accepted
    : [
        ...currentQueue.items,
        ...accepted.filter((event) => !queuedIds.has(event.id)),
      ]
  const boundedItems =
    items.length <= MAX_VISUAL_EVENT_QUEUE_LENGTH
      ? items
      : [collapseVisualEventsToSummary(items)].filter(
          (event): event is ProgressSummaryVisualEvent => event !== null,
        )
  const nextSeenIds = [
    ...currentQueue.seenEventIds,
    ...uniqueIncoming.map((event) => event.id),
    ...boundedItems.map((event) => event.id),
  ]
  return {
    items: boundedItems,
    seenEventIds: [...new Set(nextSeenIds)].slice(
      -MAX_SEEN_VISUAL_EVENT_IDS,
    ),
  }
}

export function dequeueVisualEvent(
  queue: VisualEventQueueState,
): DequeuedVisualEvent {
  const event = queue.items[0] ?? null
  return {
    event,
    queue: {
      items: event === null ? [...queue.items] : queue.items.slice(1),
      seenEventIds: [...queue.seenEventIds],
    },
  }
}

export function dismissVisualEvent(
  queue: VisualEventQueueState,
  eventId: string,
): VisualEventQueueState {
  return {
    items: queue.items.filter((event) => event.id !== eventId),
    seenEventIds: [...queue.seenEventIds],
  }
}

export function clearVisualEventQueue(
  queue: VisualEventQueueState,
): VisualEventQueueState {
  return { items: [], seenEventIds: [...queue.seenEventIds] }
}
