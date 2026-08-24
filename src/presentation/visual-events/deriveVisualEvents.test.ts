import { describe, expect, it, vi } from 'vitest'
import type { GameState, JournalEntry } from '../../core'
import { deriveVisualEvents } from './deriveVisualEvents'
import { getPrimaryVisualEventTag } from './visualEventTypes'
import {
  TEST_NOW,
  addResources,
  createActiveGame,
  createMainEventEntry,
} from './visualEventTestFixtures'

function advanceWithEvents(
  previous: GameState,
  entries: readonly JournalEntry[],
): GameState {
  const expedition = previous.activeExpedition
  if (expedition === null) {
    throw new Error('Expected an active expedition')
  }
  return {
    ...previous,
    updatedAt: TEST_NOW + entries.length * 15_000,
    lastAdvancedAt: TEST_NOW + entries.length * 15_000,
    activeExpedition: {
      ...expedition,
      processedEventCount:
        expedition.processedEventCount + entries.length,
    },
    journal: [...previous.journal, ...entries],
  }
}

describe('deriveVisualEvents', () => {
  it('emits a stable expedition start event', () => {
    const next = createActiveGame()
    const previous = {
      ...next,
      resources: addResources(next.resources, { food: 2 }),
      activeExpedition: null,
      journal: next.journal.slice(0, -1),
    }

    const first = deriveVisualEvents(previous, next, 'startCommand')
    const second = deriveVisualEvents(previous, next, 'startCommand')

    expect(first).toEqual(second)
    expect(first).toMatchObject([
      {
        type: 'expeditionStarted',
        expeditionId: next.activeExpedition?.id,
        heroIds: ['ron', 'mia'],
      },
    ])
  })

  it('emits the full live event sequence with real state deltas and tags', () => {
    const previous = createActiveGame()
    const expedition = previous.activeExpedition
    if (expedition === null) {
      throw new Error('Expected an active expedition')
    }
    const entry = createMainEventEntry(expedition.id, 1, 'mist-wolf')
    const nextBase = advanceWithEvents(previous, [entry])
    const next: GameState = {
      ...nextBase,
      heroes: nextBase.heroes.map((hero) =>
        hero.id === 'mia' ? { ...hero, health: hero.health - 9 } : hero,
      ),
      activeExpedition:
        nextBase.activeExpedition === null
          ? null
          : {
              ...nextBase.activeExpedition,
              carriedLoot: addResources(
                nextBase.activeExpedition.carriedLoot,
                { coins: 4 },
              ),
            },
    }

    const events = deriveVisualEvents(previous, next, 'liveTick')

    expect(events.map((event) => event.type)).toEqual([
      'partyAdvanced',
      'eventRevealed',
      'heroDamaged',
      'lootChanged',
    ])
    expect(events.find((event) => event.type === 'eventRevealed')).toMatchObject(
      {
        sourceEventId: 'mist-wolf',
        tags: ['danger', 'combat'],
      },
    )
    expect(events.find((event) => event.type === 'heroDamaged')).toMatchObject({
      heroId: 'mia',
      amount: 9,
    })
    expect(events.find((event) => event.type === 'lootChanged')).toMatchObject({
      resource: 'coins',
      amount: 4,
    })
  })

  it('emits healing from state differences without parsing journal text', () => {
    const previousBase = createActiveGame()
    const previous = {
      ...previousBase,
      heroes: previousBase.heroes.map((hero) =>
        hero.id === 'ron' ? { ...hero, health: hero.health - 12 } : hero,
      ),
    }
    const next = {
      ...previous,
      heroes: previous.heroes.map((hero) =>
        hero.id === 'ron' ? { ...hero, health: hero.health + 5 } : hero,
      ),
    }

    expect(deriveVisualEvents(previous, next, 'liveTick')).toMatchObject([
      { type: 'heroHealed', heroId: 'ron', amount: 5 },
    ])
  })

  it('uses generic tags when a valid source id is no longer registered', () => {
    const previous = createActiveGame()
    const expedition = previous.activeExpedition
    if (expedition === null) {
      throw new Error('Expected an active expedition')
    }
    const unknown: JournalEntry = {
      ...createMainEventEntry(expedition.id, 1),
      sourceEventId: 'retired-content.event',
      category: 'combat',
      title: '旧日遭遇',
    }
    const next = advanceWithEvents(previous, [unknown])

    expect(
      deriveVisualEvents(previous, next, 'liveTick').find(
        (event) => event.type === 'eventRevealed',
      ),
    ).toMatchObject({
      sourceEventId: 'retired-content.event',
      tags: ['combat', 'danger'],
    })
    expect(getPrimaryVisualEventTag(['reward', 'danger', 'combat'])).toBe(
      'combat',
    )
  })

  it('supports old main event logs by matching their registered title', () => {
    const previous = createActiveGame()
    const expedition = previous.activeExpedition
    if (expedition === null) {
      throw new Error('Expected an active expedition')
    }
    const entry = createMainEventEntry(expedition.id, 1)
    const legacyEntry: JournalEntry = {
      id: entry.id,
      timestamp: entry.timestamp,
      expeditionId: expedition.id,
      category: entry.category,
      title: entry.title,
      text: entry.text,
    }
    const next = advanceWithEvents(previous, [legacyEntry])

    const revealed = deriveVisualEvents(previous, next, 'liveTick').find(
      (event) => event.type === 'eventRevealed',
    )

    expect(revealed).toMatchObject({ tags: ['reward', 'discovery'] })
    expect(revealed).not.toHaveProperty('sourceEventId')
  })

  it('compresses two or three events to the last important event and summary', () => {
    const previous = createActiveGame()
    const expedition = previous.activeExpedition
    if (expedition === null) {
      throw new Error('Expected an active expedition')
    }
    const safeEntry: JournalEntry = {
      ...createMainEventEntry(expedition.id, 1, 'quiet-march'),
      category: 'travel',
      title: '平静行进',
    }
    const dangerEntry = createMainEventEntry(expedition.id, 2, 'mist-wolf')
    const next = advanceWithEvents(previous, [safeEntry, dangerEntry])

    const events = deriveVisualEvents(previous, next, 'liveTick')

    expect(events.map((event) => event.type)).toEqual([
      'eventRevealed',
      'progressSummary',
    ])
    expect(events[0]).toMatchObject({ journalEntryId: dangerEntry.id })
    expect(events[1]).toMatchObject({ eventCount: 2, summaryKind: 'batch' })
  })

  it('compresses more than three events to one summary', () => {
    const previous = createActiveGame()
    const expedition = previous.activeExpedition
    if (expedition === null) {
      throw new Error('Expected an active expedition')
    }
    const entries = Array.from({ length: 4 }, (_, index) =>
      createMainEventEntry(expedition.id, index + 1),
    )
    const next = advanceWithEvents(previous, entries)

    expect(deriveVisualEvents(previous, next, 'debugAdvance')).toMatchObject([
      { type: 'progressSummary', eventCount: 4, summaryKind: 'batch' },
    ])
  })

  it('keeps one return event when a large debug batch also completes the expedition', () => {
    const previous = createActiveGame()
    const expedition = previous.activeExpedition
    if (expedition === null) {
      throw new Error('Expected an active expedition')
    }
    const entries = Array.from({ length: 6 }, (_, index) =>
      createMainEventEntry(
        expedition.id,
        index + 1,
        index === 5 ? 'mist-wolf' : 'fallen-timber',
      ),
    )
    const next: GameState = {
      ...previous,
      updatedAt: TEST_NOW + 90_000,
      lastAdvancedAt: TEST_NOW + 90_000,
      resources: addResources(previous.resources, { wood: 10 }),
      activeExpedition: null,
      completedExpeditions: previous.completedExpeditions + 1,
      journal: [
        ...previous.journal,
        ...entries,
        {
          id: `${expedition.id}-return`,
          timestamp: TEST_NOW + 90_000,
          expeditionId: expedition.id,
          category: 'return',
          title: '远征归来',
          text: '队伍返回。',
        },
      ],
    }

    const events = deriveVisualEvents(previous, next, 'debugAdvance')

    expect(events.map((event) => event.type)).toEqual([
      'progressSummary',
      'expeditionReturned',
    ])
    expect(events[0]).toMatchObject({ eventCount: 6, summaryKind: 'batch' })
    expect(events[1]).toMatchObject({
      expeditionId: expedition.id,
      processedEventCount: 6,
      completedExpeditionsDelta: 1,
    })
  })

  it('keeps one return event after a two-event compressed transition', () => {
    const previous = createActiveGame()
    const expedition = previous.activeExpedition
    if (expedition === null) {
      throw new Error('Expected an active expedition')
    }
    const entries = [
      createMainEventEntry(expedition.id, 1),
      createMainEventEntry(expedition.id, 2, 'mist-wolf'),
    ]
    const next: GameState = {
      ...previous,
      updatedAt: TEST_NOW + 30_000,
      lastAdvancedAt: TEST_NOW + 30_000,
      activeExpedition: null,
      completedExpeditions: previous.completedExpeditions + 1,
      journal: [...previous.journal, ...entries],
    }

    const events = deriveVisualEvents(previous, next, 'liveTick')

    expect(events.map((event) => event.type)).toEqual([
      'eventRevealed',
      'progressSummary',
      'expeditionReturned',
    ])
    expect(events.filter((event) => event.type === 'expeditionReturned')).toHaveLength(1)
  })

  it.each([
    ['bootstrap', 'offline'],
    ['backgroundRecovery', 'background'],
  ] as const)('uses one %s summary instead of replaying events', (source, kind) => {
    const previous = createActiveGame()
    const expedition = previous.activeExpedition
    if (expedition === null) {
      throw new Error('Expected an active expedition')
    }
    const next = advanceWithEvents(previous, [
      createMainEventEntry(expedition.id, 1),
    ])

    expect(deriveVisualEvents(previous, next, source)).toMatchObject([
      { type: 'progressSummary', eventCount: 1, summaryKind: kind },
    ])
  })

  it('uses one import summary and clears reset transitions', () => {
    const state = createActiveGame()

    expect(deriveVisualEvents(state, state, 'importSave')).toMatchObject([
      { type: 'progressSummary', summaryKind: 'import' },
    ])
    expect(deriveVisualEvents(state, state, 'resetGame')).toEqual([])
  })

  it('emits exactly one return event and does not duplicate carried loot', () => {
    const previousBase = createActiveGame()
    const expedition = previousBase.activeExpedition
    if (expedition === null) {
      throw new Error('Expected an active expedition')
    }
    const previous: GameState = {
      ...previousBase,
      activeExpedition: {
        ...expedition,
        carriedLoot: addResources(expedition.carriedLoot, { wood: 4 }),
      },
    }
    const next: GameState = {
      ...previous,
      resources: addResources(previous.resources, { wood: 4 }),
      activeExpedition: null,
      completedExpeditions: previous.completedExpeditions + 1,
      journal: [
        ...previous.journal,
        {
          id: `${expedition.id}-return`,
          timestamp: TEST_NOW + 1,
          expeditionId: expedition.id,
          category: 'return',
          title: '主动撤退',
          text: '队伍返回。',
        },
      ],
    }

    const events = deriveVisualEvents(previous, next, 'retreatCommand')

    expect(events.filter((event) => event.type === 'expeditionReturned')).toHaveLength(1)
    expect(events.some((event) => event.type === 'lootChanged')).toBe(false)
    expect(events.at(-1)).toMatchObject({
      type: 'expeditionReturned',
      resourceDeltas: { food: 0, medicine: 0, wood: 4, coins: 0 },
    })
  })

  it('emits one automatic return after the final live event', () => {
    const previousBase = createActiveGame()
    const expedition = previousBase.activeExpedition
    if (expedition === null) {
      throw new Error('Expected an active expedition')
    }
    const previous: GameState = {
      ...previousBase,
      activeExpedition: {
        ...expedition,
        processedEventCount: 5,
      },
    }
    const finalEntry = createMainEventEntry(expedition.id, 6)
    const next: GameState = {
      ...previous,
      updatedAt: finalEntry.timestamp,
      lastAdvancedAt: finalEntry.timestamp,
      resources: addResources(previous.resources, { wood: 10 }),
      activeExpedition: null,
      completedExpeditions: previous.completedExpeditions + 1,
      journal: [
        ...previous.journal,
        finalEntry,
        {
          id: `${expedition.id}-return`,
          timestamp: finalEntry.timestamp,
          expeditionId: expedition.id,
          category: 'return',
          title: '远征归来',
          text: '队伍返回。',
        },
      ],
    }

    const events = deriveVisualEvents(previous, next, 'liveTick')

    expect(events.filter((event) => event.type === 'expeditionReturned')).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({
      type: 'expeditionReturned',
      processedEventCount: 6,
      completedExpeditionsDelta: 1,
    })
  })

  it('returns no events for no observable live change and never uses clocks or randomness', () => {
    const state = createActiveGame()
    const dateNow = vi.spyOn(Date, 'now')
    const random = vi.spyOn(Math, 'random')
    const before = JSON.stringify(state)

    expect(deriveVisualEvents(state, state, 'liveTick')).toEqual([])
    expect(deriveVisualEvents(state, state, 'liveTick')).toEqual([])
    expect(dateNow).not.toHaveBeenCalled()
    expect(random).not.toHaveBeenCalled()
    expect(JSON.stringify(state)).toBe(before)

    dateNow.mockRestore()
    random.mockRestore()
  })
})
