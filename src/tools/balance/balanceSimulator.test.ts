import { describe, expect, it, vi } from 'vitest'
import { createNewGame } from '../../core/commands/createNewGame'
import { startExpedition } from '../../core/commands/startExpedition'
import { GAME_CONTENT } from '../../core/content/contentRegistry'
import { nextFloat } from '../../core/rng/seededRng'
import { advanceTo } from '../../core/simulation/advanceTo'
import {
  BALANCE_COHORTS,
  createBalanceScenarios,
  DEFAULT_BALANCE_SEEDS,
  deriveBalanceSeed,
  getBalanceCheckFailures,
  runBalanceSimulation,
  runVerifiedBalanceSimulation,
  serializeBalanceReport,
  type BalanceSimulationDependencies,
} from './balanceSimulator'
import { renderBalanceMarkdown } from './balanceReport'

const createDependencies = (
  advance: BalanceSimulationDependencies['advanceTo'] = advanceTo,
): BalanceSimulationDependencies => ({
  content: GAME_CONTENT,
  createNewGame,
  startExpedition,
  advanceTo: advance,
})

describe('balance scenario generation', () => {
  it('derives every hero pair, policy, region, and cohort from content', () => {
    const scenarios = createBalanceScenarios()
    const heroPairs = new Set(
      scenarios.map((scenario) => scenario.heroIds.join('+')),
    )
    const policies = new Set(scenarios.map((scenario) => scenario.policy))
    const regions = new Set(scenarios.map((scenario) => scenario.regionId))
    const cohorts = new Set(scenarios.map((scenario) => scenario.cohort))

    expect(heroPairs).toEqual(new Set(['eve+mia', 'eve+ron', 'mia+ron']))
    expect(policies).toEqual(new Set(['cautious', 'explore', 'greedy']))
    expect(regions).toEqual(new Set(['black-fir-forest']))
    expect(cohorts).toEqual(new Set(BALANCE_COHORTS))
    expect(scenarios).toHaveLength(18)
    expect(DEFAULT_BALANCE_SEEDS * scenarios.length).toBe(18_000)
  })
})

describe('balance seed derivation', () => {
  it('mixes low seed indexes into stable, non-zero 32-bit states', () => {
    const derived = Array.from({ length: 1_000 }, (_, index) =>
      deriveBalanceSeed(index + 1),
    )

    expect(derived.slice(0, 8)).toEqual([
      1_364_076_727, 821_347_078, 2_247_144_487, 614_249_093,
      3_423_425_485, 1_558_924_552, 415_870_660, 1_228_498_187,
    ])
    expect(derived.every((seed) => seed > 0 && seed <= 0xffff_ffff)).toBe(
      true,
    )
    expect(new Set(derived).size).toBe(derived.length)
  })

  it('does not collapse the first random draw for low seed indexes', () => {
    const quartiles = new Set(
      Array.from({ length: 32 }, (_, index) =>
        Math.floor(nextFloat(deriveBalanceSeed(index + 1)).value * 4),
      ),
    )

    expect(quartiles).toEqual(new Set([0, 1, 2, 3]))
  })
})

describe('balance simulation', () => {
  it('is reproducible and keeps onboarding separate from steady state', () => {
    const first = runBalanceSimulation({ seeds: 3 })
    const second = runBalanceSimulation({ seeds: 3 })

    expect(serializeBalanceReport(first)).toBe(serializeBalanceReport(second))
    expect(first.summary).toMatchObject({
      totalScenarios: 18,
      totalSimulations: 54,
      onboardingSimulations: 27,
      steadyStateSimulations: 27,
      seedStart: 1,
      seedEnd: 3,
    })
    expect(
      first.groups
        .filter((group) => group.cohort === 'onboarding')
        .every((group) => group.firstExpeditionGuaranteeRate === 1),
    ).toBe(true)
    expect(
      first.groups
        .filter((group) => group.cohort === 'steady-state')
        .every((group) => group.firstExpeditionGuaranteeRate === 0),
    ).toBe(true)
  })

  it('uses the production advanceTo path and satisfies check invariants', () => {
    const advance = vi.fn(advanceTo)
    const report = runVerifiedBalanceSimulation(
      { seeds: 2 },
      createDependencies(advance),
    )

    expect(advance).toHaveBeenCalled()
    expect(report.summary.nonDeterministicCount).toBe(0)
    expect(getBalanceCheckFailures(report)).toEqual([])
    expect(report.groups.every((group) => group.events.length === 6)).toBe(
      true,
    )
  })

  it('observes invalid RNG and negative resources between events once per run', () => {
    const corruptingAdvance: BalanceSimulationDependencies['advanceTo'] = (
      state,
      targetTimestamp,
    ) => {
      const nextState = advanceTo(state, targetTimestamp)
      if (nextState.activeExpedition === null) {
        return nextState
      }
      return {
        ...nextState,
        resources: { ...nextState.resources, wood: -1 },
        activeExpedition: {
          ...nextState.activeExpedition,
          rngState: 0,
        },
      }
    }
    const report = runBalanceSimulation(
      { seeds: 1 },
      createDependencies(corruptingAdvance),
    )

    expect(report.summary.invalidRngStateCount).toBe(18)
    expect(report.summary.negativeResourceCount).toBe(18)
    expect(getBalanceCheckFailures(report)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('非法 RNG 状态'),
        expect.stringContaining('负资源'),
      ]),
    )
  })

  it('counts positive Infinity separately from negative resources', () => {
    const infiniteAdvance: BalanceSimulationDependencies['advanceTo'] = (
      state,
      targetTimestamp,
    ) => {
      const nextState = advanceTo(state, targetTimestamp)
      return {
        ...nextState,
        resources: {
          ...nextState.resources,
          wood: Number.POSITIVE_INFINITY,
        },
      }
    }
    const report = runBalanceSimulation(
      { seeds: 1 },
      createDependencies(infiniteAdvance),
    )

    expect(report.summary.infinityCount).toBeGreaterThan(0)
    expect(report.summary.negativeResourceCount).toBe(0)
  })

  it('fails checks for no-candidate safe returns', () => {
    const invalidRegionAdvance: BalanceSimulationDependencies['advanceTo'] = (
      state,
      targetTimestamp,
    ) =>
      advanceTo(
        state.activeExpedition === null
          ? state
          : {
              ...state,
              activeExpedition: {
                ...state.activeExpedition,
                regionId: 'missing-region',
              },
            },
        targetTimestamp,
      )
    const report = runBalanceSimulation(
      { seeds: 1 },
      createDependencies(invalidRegionAdvance),
    )

    expect(report.summary.noCandidateEventCount).toBe(18)
    expect(getBalanceCheckFailures(report)).toContain('无候选事件: 18')
  })

  it('fails checks for unfinished expeditions and loop guards', () => {
    const stuckAdvance: BalanceSimulationDependencies['advanceTo'] = (
      state,
    ) => state
    const report = runBalanceSimulation(
      { seeds: 1 },
      createDependencies(stuckAdvance),
    )

    expect(report.summary.unfinishedExpeditionCount).toBe(18)
    expect(report.summary.maxLoopGuardCount).toBe(18)
    expect(getBalanceCheckFailures(report)).toEqual(
      expect.arrayContaining([
        '未结束远征: 18',
        '最大循环保护触发: 18',
      ]),
    )
  })

  it.each([0, -1])(
    'continues through a due timestamp offset of %i ms',
    (nextEventOffset) => {
      const adjustedDelayAdvance: BalanceSimulationDependencies['advanceTo'] = (
        state,
        targetTimestamp,
      ) => {
        const nextState = advanceTo(state, targetTimestamp)
        if (nextState.activeExpedition === null) {
          return nextState
        }
        return {
          ...nextState,
          activeExpedition: {
            ...nextState.activeExpedition,
            nextEventAt: nextState.lastAdvancedAt + nextEventOffset,
          },
        }
      }
      const report = runBalanceSimulation(
        { seeds: 1 },
        createDependencies(adjustedDelayAdvance),
      )

      expect(report.summary.totalEventCount).toBe(108)
      expect(getBalanceCheckFailures(report)).toEqual([])
    },
  )

  it('emits parseable JSON and non-empty deterministic Markdown', () => {
    const report = runBalanceSimulation({ seeds: 1 })
    const json = serializeBalanceReport(report)
    const markdown = renderBalanceMarkdown(report)

    expect(JSON.parse(json)).toEqual(report)
    expect(markdown).toContain('# Last Waystation Balance Summary')
    expect(markdown).toContain('## Event Distribution')
    expect(markdown).not.toMatch(/generated at|timestamp:/i)
    expect(renderBalanceMarkdown(report)).toBe(markdown)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid seed count %s',
    (seeds) => {
      expect(() => runBalanceSimulation({ seeds })).toThrow(
        'seeds 必须是有限正整数',
      )
    },
  )
})
