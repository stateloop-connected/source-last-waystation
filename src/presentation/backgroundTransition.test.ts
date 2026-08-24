import { describe, expect, it } from 'vitest'
import { advanceTo } from '../core'
import { createActiveSaveTestGame } from '../save/saveTestFixture'
import {
  accumulateBackgroundTransition,
  deriveBackgroundVisualEvents,
  type BackgroundTransition,
} from './backgroundTransition'
import { deriveTransitionSummary } from './visual-events'

const NOW = 1_700_000_000_000

describe('background transition aggregation', () => {
  it('跨多次事件并返程时按首尾状态统计资源一次', () => {
    const initial = createActiveSaveTestGame(NOW)
    let current = initial
    let background: BackgroundTransition | null = null

    for (let eventIndex = 1; eventIndex <= 6; eventIndex += 1) {
      const next = advanceTo(initial, NOW + eventIndex * 15_000)
      background = accumulateBackgroundTransition(
        background,
        current,
        next,
      )
      current = next
    }

    const expected = deriveTransitionSummary(initial, current)
    const events = deriveBackgroundVisualEvents(background)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'progressSummary',
      summaryKind: 'background',
      eventCount: expected.eventCount,
      completedExpeditions: expected.completedExpeditions,
      resourceDeltas: expected.resourceDeltas,
      heroHealthDeltas: expected.heroHealthDeltas,
    })
  })

  it('恢复后的首次 catch-up 可并入已有后台首尾快照', () => {
    const initial = createActiveSaveTestGame(NOW)
    const hiddenProgress = advanceTo(initial, NOW + 30_000)
    const catchUp = advanceTo(hiddenProgress, NOW + 90_000)

    let background = accumulateBackgroundTransition(
      null,
      initial,
      hiddenProgress,
    )
    background = accumulateBackgroundTransition(
      background,
      hiddenProgress,
      catchUp,
    )

    const summary = deriveBackgroundVisualEvents(background)[0]
    const expected = deriveTransitionSummary(initial, catchUp)
    expect(summary).toMatchObject({
      type: 'progressSummary',
      eventCount: expected.eventCount,
      completedExpeditions: expected.completedExpeditions,
      resourceDeltas: expected.resourceDeltas,
    })
  })

  it('只有墙钟流逝时保留聚合基线但不创建后台摘要', () => {
    const previous = createActiveSaveTestGame(NOW)
    const next = {
      ...previous,
      updatedAt: NOW + 1_000,
      lastAdvancedAt: NOW + 1_000,
    }

    const background = accumulateBackgroundTransition(null, previous, next)

    expect(background).toEqual({ previous, next })
    expect(deriveBackgroundVisualEvents(background)).toEqual([])
  })

  it('静默时间后发生事件时从最初的后台状态计算经过时间', () => {
    const initial = createActiveSaveTestGame(NOW)
    const silent = advanceTo(initial, NOW + 1_000)
    const progressed = advanceTo(silent, NOW + 15_000)

    let background = accumulateBackgroundTransition(null, initial, silent)
    background = accumulateBackgroundTransition(
      background,
      silent,
      progressed,
    )

    expect(deriveBackgroundVisualEvents(background)[0]).toMatchObject({
      type: 'progressSummary',
      summaryKind: 'background',
      elapsedMs: 15_000,
      eventCount: 1,
    })
  })
})
