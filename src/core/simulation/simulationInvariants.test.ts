import { describe, expect, it } from 'vitest'
import { createNewGame } from '../commands/createNewGame'
import { retreatExpedition } from '../commands/retreatExpedition'
import { startExpedition } from '../commands/startExpedition'
import type { ExpeditionPolicy } from '../model/expedition'
import type { GameState } from '../model/gameState'
import type { JournalEntry } from '../model/journal'
import {
  normalizeRngState,
  nextUint32,
} from '../rng/seededRng'
import { advanceTo, HOUR_MS } from './advanceTo'
import { appendJournal, MAX_JOURNAL_ENTRIES } from './rewards'

const NOW = 1_900_000_000_000
const EVENT_INTERVAL_MS = 15_000
const FIXED_SEEDS = [
  0,
  1,
  2,
  3,
  7,
  11,
  17,
  31,
  42,
  99,
  127,
  255,
  256,
  1_024,
  65_535,
  1_000_003,
  16_777_219,
  305_419_896,
  20_260_824,
  2_147_483_647,
  3_000_000_001,
  4_294_967_295,
  -1,
  -2_026,
] as const
const POLICIES: readonly ExpeditionPolicy[] = [
  'cautious',
  'explore',
  'greedy',
]

function startWithSeed(seed: number, index = 0): GameState {
  const policy = POLICIES[index % POLICIES.length]
  if (policy === undefined) {
    throw new Error('测试行动方针缺失。')
  }

  const result = startExpedition(
    createNewGame(NOW),
    {
      heroIds: ['ron', 'eve'],
      regionId: 'black-fir-forest',
      policy,
      seed,
    },
    NOW,
  )
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.state
}

function eventEntries(state: GameState): JournalEntry[] {
  return state.journal.filter((entry) => entry.id.includes('-event-'))
}

function makeJournalEntry(id: string): JournalEntry {
  return {
    id,
    timestamp: NOW,
    category: 'system',
    title: id,
    text: id,
  }
}

describe('advanceTo simulation invariants', () => {
  it('至少 20 个固定种子在不规则分段推进后与一次推进完全等价', () => {
    for (const [index, seed] of FIXED_SEEDS.entries()) {
      const initial = startWithSeed(seed, index)
      const direct = advanceTo(initial, NOW + 90_000)
      const targets = [
        1,
        14_999,
        15_000,
        15_001,
        29_999,
        30_000,
        44_999,
        60_000,
        89_999,
        90_000,
      ]
      const segmented = targets.reduce(
        (state, offset) => advanceTo(state, NOW + offset),
        initial,
      )

      expect(segmented, `seed=${seed}`).toEqual(direct)
    }
  })

  it('只在 nextEventAt 的精确边界处理下一事件', () => {
    const initial = startWithSeed(73)
    const firstBoundary = advanceTo(initial, NOW + EVENT_INTERVAL_MS)
    const beforeSecond = advanceTo(
      firstBoundary,
      NOW + 2 * EVENT_INTERVAL_MS - 1,
    )
    const secondBoundary = advanceTo(
      beforeSecond,
      NOW + 2 * EVENT_INTERVAL_MS,
    )

    expect(eventEntries(initial)).toHaveLength(0)
    expect(eventEntries(firstBoundary)).toHaveLength(1)
    expect(eventEntries(beforeSecond)).toHaveLength(1)
    expect(eventEntries(secondBoundary)).toHaveLength(2)
    expect(firstBoundary.activeExpedition?.lastProcessedAt).toBe(
      NOW + EVENT_INTERVAL_MS,
    )
    expect(firstBoundary.activeExpedition?.nextEventAt).toBe(
      NOW + 2 * EVENT_INTERVAL_MS,
    )
  })

  it('第六事件的前一毫秒仍在远征，边界时只结算一次', () => {
    const initial = startWithSeed(20260824)
    const beforeSixth = advanceTo(initial, NOW + 90_000 - 1)
    const atSixth = advanceTo(beforeSixth, NOW + 90_000)
    const repeated = advanceTo(atSixth, NOW + 90_000)

    expect(eventEntries(beforeSixth)).toHaveLength(5)
    expect(beforeSixth.activeExpedition?.processedEventCount).toBe(5)
    expect(eventEntries(atSixth)).toHaveLength(6)
    expect(atSixth.activeExpedition).toBeNull()
    expect(atSixth.completedExpeditions).toBe(1)
    expect(repeated).toBe(atSixth)
  })

  it('手动撤退会先处理恰好到期的事件，重复命令不再结算', () => {
    const initial = startWithSeed(913)
    const beforeDue = advanceTo(initial, NOW + EVENT_INTERVAL_MS - 1)
    const retreated = retreatExpedition(
      beforeDue,
      NOW + EVENT_INTERVAL_MS,
    )
    if (!retreated.ok) {
      throw new Error(retreated.error)
    }

    expect(eventEntries(retreated.state)).toHaveLength(1)
    expect(retreated.state.activeExpedition).toBeNull()
    expect(retreated.state.completedExpeditions).toBe(1)

    const repeated = retreatExpedition(
      retreated.state,
      NOW + EVENT_INTERVAL_MS,
    )
    expect(repeated.ok).toBe(false)
    expect(repeated.state).toBe(retreated.state)
    expect(eventEntries(repeated.state)).toHaveLength(1)
    expect(repeated.state.completedExpeditions).toBe(1)
  })

  it('第六事件在撤退命令内自然完成时返回成功状态', () => {
    const initial = startWithSeed(4_294_967_295)
    const beforeSixth = advanceTo(initial, NOW + 90_000 - 1)
    const natural = advanceTo(beforeSixth, NOW + 90_000)
    const command = retreatExpedition(beforeSixth, NOW + 90_000)

    expect(command.ok).toBe(true)
    expect(command.state).toEqual(natural)
    expect(command.state.completedExpeditions).toBe(1)
    expect(eventEntries(command.state)).toHaveLength(6)
  })

  it('离线上限平移未模拟事件，重复恢复不会补算或重复日志', () => {
    const initial = startWithSeed(8080)
    const expedition = initial.activeExpedition
    if (expedition === null) {
      throw new Error('测试远征创建失败。')
    }
    const delayed: GameState = {
      ...initial,
      activeExpedition: {
        ...expedition,
        nextEventAt: NOW + 9 * HOUR_MS,
      },
    }
    const capped = advanceTo(delayed, NOW + 12 * HOUR_MS)
    const repeated = advanceTo(capped, NOW + 12 * HOUR_MS)

    expect(capped.activeExpedition?.processedEventCount).toBe(0)
    expect(capped.activeExpedition?.nextEventAt).toBe(NOW + 13 * HOUR_MS)
    expect(eventEntries(capped)).toHaveLength(0)
    expect(repeated).toBe(capped)

    const justBefore = advanceTo(repeated, NOW + 13 * HOUR_MS - 1)
    const atShiftedBoundary = advanceTo(justBefore, NOW + 13 * HOUR_MS)
    const boundaryRepeated = advanceTo(
      atShiftedBoundary,
      NOW + 13 * HOUR_MS,
    )
    expect(eventEntries(justBefore)).toHaveLength(0)
    expect(eventEntries(atShiftedBoundary)).toHaveLength(1)
    expect(boundaryRepeated).toBe(atShiftedBoundary)
  })

  it('活动远征遇到时钟回拨时保持同一对象及 RNG 状态', () => {
    const initial = startWithSeed(0)
    const rolledBack = advanceTo(initial, NOW - 1)

    expect(rolledBack).toBe(initial)
    expect(rolledBack.activeExpedition?.rngState).toBe(
      initial.activeExpedition?.rngState,
    )
    expect(rolledBack.journal).toBe(initial.journal)
  })
})

describe('RNG and journal edge invariants', () => {
  it('零状态映射到稳定非零状态并继续产生可恢复序列', () => {
    const normalized = normalizeRngState(0)
    const first = nextUint32(0)
    const equivalent = nextUint32(normalized)
    const continued = nextUint32(first.nextState)
    const restored = nextUint32(Number(String(first.nextState)))

    expect(normalized).not.toBe(0)
    expect(first).toEqual(equivalent)
    expect(first.nextState).not.toBe(0)
    expect(restored).toEqual(continued)
  })

  it('一次追加多条日志时保留最新 200 条且不修改输入', () => {
    const existing = Array.from({ length: 199 }, (_, index) =>
      makeJournalEntry(`old-${index}`),
    )
    const snapshot = [...existing]
    const appended = appendJournal(
      existing,
      makeJournalEntry('new-0'),
      makeJournalEntry('new-1'),
      makeJournalEntry('new-2'),
    )

    expect(appended).toHaveLength(MAX_JOURNAL_ENTRIES)
    expect(appended[0]?.id).toBe('old-2')
    expect(appended.slice(-3).map((entry) => entry.id)).toEqual([
      'new-0',
      'new-1',
      'new-2',
    ])
    expect(existing).toEqual(snapshot)
    expect(existing).toHaveLength(199)
  })
})
