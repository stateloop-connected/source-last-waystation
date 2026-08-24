import { describe, expect, it } from 'vitest'
import type {
  EventRevealedVisualEvent,
  ProgressSummaryVisualEvent,
  VisualEvent,
} from './visualEventTypes'
import {
  MAX_VISUAL_EVENT_QUEUE_LENGTH,
  clearVisualEventQueue,
  collapseVisualEventsToSummary,
  createVisualEventQueue,
  dequeueVisualEvent,
  dismissVisualEvent,
  enqueueVisualEvents,
} from './visualEventQueue'

function revealed(index: number): EventRevealedVisualEvent {
  return {
    id: `visual-${index}`,
    transitionId: `transition-${index}`,
    source: 'liveTick',
    type: 'eventRevealed',
    expeditionId: 'expedition-1',
    journalEntryId: `journal-${index}`,
    title: `事件 ${index}`,
    text: '测试。',
    tags: ['discovery'],
  }
}

function summary(
  id: string,
  source: ProgressSummaryVisualEvent['source'],
): ProgressSummaryVisualEvent {
  return {
    id,
    transitionId: `transition-${id}`,
    source,
    type: 'progressSummary',
    summaryKind:
      source === 'importSave'
        ? 'import'
        : source === 'backgroundRecovery'
          ? 'background'
          : 'batch',
    elapsedMs: 15_000,
    eventCount: 1,
    completedExpeditions: 0,
    resourceDeltas: { food: 0, medicine: 0, wood: 2, coins: 0 },
    heroHealthDeltas: {},
  }
}

describe('visual event queue', () => {
  it('keeps stable order and deduplicates queued and consumed events', () => {
    const first = revealed(1)
    const second = revealed(2)
    let queue = enqueueVisualEvents(
      createVisualEventQueue(),
      [first, second, first],
      'liveTick',
    )

    expect(queue.items.map((event) => event.id)).toEqual([
      first.id,
      second.id,
    ])

    const dequeued = dequeueVisualEvent(queue)
    expect(dequeued.event?.id).toBe(first.id)
    queue = enqueueVisualEvents(dequeued.queue, [first, second], 'liveTick')
    expect(queue.items.map((event) => event.id)).toEqual([second.id])
  })

  it('collapses queue overflow into one bounded aggregate summary', () => {
    const incoming = Array.from(
      { length: MAX_VISUAL_EVENT_QUEUE_LENGTH + 1 },
      (_, index) => revealed(index),
    )

    const queue = enqueueVisualEvents(
      createVisualEventQueue(),
      incoming,
      'liveTick',
    )

    expect(queue.items).toHaveLength(1)
    expect(queue.items[0]).toMatchObject({
      type: 'progressSummary',
      summaryKind: 'queueOverflow',
      eventCount: MAX_VISUAL_EVENT_QUEUE_LENGTH + 1,
    })
  })

  it('clears immediately for reset and replaces old events for import', () => {
    const initial = enqueueVisualEvents(
      createVisualEventQueue(),
      [revealed(1), revealed(2)],
      'liveTick',
    )
    const reset = enqueueVisualEvents(initial, [], 'resetGame')
    expect(reset).toEqual(createVisualEventQueue())

    const replayedAfterReset = enqueueVisualEvents(
      reset,
      [revealed(1)],
      'liveTick',
    )
    expect(replayedAfterReset.items).toEqual([revealed(1)])

    const imported = summary('import-summary', 'importSave')
    const replaced = enqueueVisualEvents(initial, [imported], 'importSave')
    expect(replaced.items).toEqual([imported])
    expect(replaced.seenEventIds).not.toContain(revealed(1).id)
    expect(
      enqueueVisualEvents(replaced, [imported], 'importSave').items,
    ).toEqual([imported])

    const replayedImportedTransition = enqueueVisualEvents(
      replaced,
      [revealed(1)],
      'liveTick',
    )
    expect(replayedImportedTransition.items).toContainEqual(revealed(1))
  })

  it('replaces pending animation with one background recovery summary', () => {
    const initial = enqueueVisualEvents(
      createVisualEventQueue(),
      [revealed(1), revealed(2)],
      'liveTick',
    )
    const recovered = summary('background-summary', 'backgroundRecovery')

    const queue = enqueueVisualEvents(
      initial,
      [recovered],
      'backgroundRecovery',
    )

    expect(queue.items).toEqual([recovered])
  })

  it('starts a new expedition without retaining the previous expedition queue', () => {
    const previous = enqueueVisualEvents(
      createVisualEventQueue(),
      [revealed(1), revealed(2)],
      'liveTick',
    )
    const started: VisualEvent = {
      id: 'new-expedition-started',
      transitionId: 'new-expedition-transition',
      source: 'startCommand',
      type: 'expeditionStarted',
      expeditionId: 'expedition-2',
      heroIds: ['ron', 'eve'],
    }

    const queue = enqueueVisualEvents(
      previous,
      [started],
      'startCommand',
    )

    expect(queue.items).toEqual([started])
  })

  it('supports dismissal and explicit clearing without forgetting seen ids', () => {
    const event = revealed(1)
    const queue = enqueueVisualEvents(
      createVisualEventQueue(),
      [event],
      'liveTick',
    )

    expect(dismissVisualEvent(queue, event.id).items).toEqual([])
    const cleared = clearVisualEventQueue(queue)
    expect(cleared.items).toEqual([])
    expect(cleared.seenEventIds).toContain(event.id)
  })

  it('collapses mixed transitions without double-counting a transition summary', () => {
    const transitionSummary = summary('batch-summary', 'liveTick')
    const duplicateDetail: VisualEvent = {
      ...revealed(1),
      transitionId: transitionSummary.transitionId,
    }

    expect(
      collapseVisualEventsToSummary([duplicateDetail, transitionSummary]),
    ).toMatchObject({
      eventCount: 1,
      resourceDeltas: { food: 0, medicine: 0, wood: 2, coins: 0 },
    })
  })

  it('does not mutate queue or incoming arrays', () => {
    const queue = createVisualEventQueue()
    const incoming = [revealed(1)]

    enqueueVisualEvents(queue, incoming, 'liveTick')

    expect(queue).toEqual({ items: [], seenEventIds: [] })
    expect(incoming).toEqual([revealed(1)])
  })
})
