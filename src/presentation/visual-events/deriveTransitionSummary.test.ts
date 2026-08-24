import { describe, expect, it } from 'vitest'
import type { GameState } from '../../core'
import {
  deriveTransitionSummary,
  hasTransitionProgress,
} from './deriveTransitionSummary'
import {
  TEST_NOW,
  addResources,
  createActiveGame,
  createMainEventEntry,
} from './visualEventTestFixtures'

describe('deriveTransitionSummary', () => {
  it('aggregates multiple event, carried loot, and health changes', () => {
    const previous = createActiveGame()
    const expedition = previous.activeExpedition
    if (expedition === null) {
      throw new Error('Expected an active expedition')
    }
    const next: GameState = {
      ...previous,
      updatedAt: TEST_NOW + 45_000,
      lastAdvancedAt: TEST_NOW + 45_000,
      heroes: previous.heroes.map((hero) =>
        hero.id === 'ron' ? { ...hero, health: hero.health - 16 } : hero,
      ),
      activeExpedition: {
        ...expedition,
        processedEventCount: 3,
        carriedLoot: addResources(expedition.carriedLoot, {
          wood: 7,
          medicine: 1,
        }),
      },
      journal: [
        ...previous.journal,
        createMainEventEntry(expedition.id, 1),
        createMainEventEntry(expedition.id, 2, 'mist-wolf'),
        createMainEventEntry(expedition.id, 3),
      ],
    }

    expect(deriveTransitionSummary(previous, next)).toEqual({
      elapsedMs: 45_000,
      eventCount: 3,
      completedExpeditions: 0,
      resourceDeltas: { food: 0, medicine: 1, wood: 7, coins: 0 },
      heroHealthDeltas: { ron: -16 },
    })
  })

  it('counts returned resources once, including the first supply guarantee', () => {
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
        carriedLoot: addResources(expedition.carriedLoot, { wood: 4 }),
      },
    }
    const finalEvent = createMainEventEntry(expedition.id, 6)
    const next: GameState = {
      ...previous,
      updatedAt: TEST_NOW + 90_000,
      lastAdvancedAt: TEST_NOW + 90_000,
      resources: addResources(previous.resources, { wood: 10 }),
      activeExpedition: null,
      completedExpeditions: previous.completedExpeditions + 1,
      journal: [...previous.journal, finalEvent],
    }

    const summary = deriveTransitionSummary(previous, next)

    expect(summary.eventCount).toBe(1)
    expect(summary.completedExpeditions).toBe(1)
    expect(summary.resourceDeltas.wood).toBe(10)
  })

  it('does not treat elapsed time alone as observable progress', () => {
    const previous = createActiveGame()
    const next = {
      ...previous,
      updatedAt: TEST_NOW + 5_000,
      lastAdvancedAt: TEST_NOW + 5_000,
    }

    const summary = deriveTransitionSummary(previous, next)

    expect(summary.elapsedMs).toBe(5_000)
    expect(hasTransitionProgress(summary)).toBe(false)
  })

  it('does not mutate either input state', () => {
    const previous = createActiveGame()
    const next = {
      ...previous,
      heroes: previous.heroes.map((hero) => ({ ...hero })),
    }
    const beforePrevious = JSON.stringify(previous)
    const beforeNext = JSON.stringify(next)

    deriveTransitionSummary(previous, next)

    expect(JSON.stringify(previous)).toBe(beforePrevious)
    expect(JSON.stringify(next)).toBe(beforeNext)
  })
})
