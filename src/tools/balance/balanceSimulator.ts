import { createNewGame } from '../../core/commands/createNewGame'
import {
  startExpedition,
  type StartExpeditionInput,
} from '../../core/commands/startExpedition'
import { GAME_CONTENT } from '../../core/content/contentRegistry'
import { INVALID_EXPEDITION_CONFIGURATION_TITLE } from '../../core/content/contentDiagnostics'
import type { ExpeditionPolicy } from '../../core/model/expedition'
import type { CommandResult, GameState } from '../../core/model/gameState'
import { normalizeRngState } from '../../core/rng/seededRng'
import {
  advanceTo,
  MAX_ADVANCE_ITERATIONS,
} from '../../core/simulation/advanceTo'
import { MAX_JOURNAL_ENTRIES } from '../../core/simulation/rewards'

export const BALANCE_BASE_TIME = 1_700_000_000_000
export const DEFAULT_BALANCE_SEEDS = 1_000
export const BALANCE_SEED_DERIVATION = 'murmur3-finalizer-v1'

export const BALANCE_COHORTS = [
  'onboarding',
  'steady-state',
] as const

export type BalanceCohort = (typeof BALANCE_COHORTS)[number]

export type BalanceScenario = {
  cohort: BalanceCohort
  regionId: string
  heroIds: readonly [string, string]
  policy: ExpeditionPolicy
}

export type BalanceEventStatistic = {
  eventId: string
  count: number
  rate: number
}

export type BalanceGroupStatistic = BalanceScenario & {
  simulationCount: number
  averageProcessedEvents: number
  fullCompletionRate: number
  earlyReturnRate: number
  averageLoot: {
    wood: number
    coins: number
    food: number
    medicine: number
  }
  averageDamage: number
  minimumHealthFloorCount: number
  events: BalanceEventStatistic[]
  firstExpeditionGuaranteeRate: number
  commandFailureCount: number
  simulationExceptionCount: number
}

export type BalanceSummary = {
  totalScenarios: number
  totalSimulations: number
  onboardingSimulations: number
  steadyStateSimulations: number
  seedStart: number
  seedEnd: number
  totalEventCount: number
  commandFailureCount: number
  simulationExceptionCount: number
  noCandidateEventCount: number
  nanCount: number
  infinityCount: number
  negativeResourceCount: number
  invalidHeroHealthCount: number
  unfinishedExpeditionCount: number
  invalidRngStateCount: number
  journalOverflowCount: number
  maxLoopGuardCount: number
  nonDeterministicCount: number
}

export type BalanceReport = {
  schemaVersion: 1
  configuration: {
    baseTime: number
    seedCount: number
    seedDerivation: typeof BALANCE_SEED_DERIVATION
    cohorts: readonly BalanceCohort[]
  }
  summary: BalanceSummary
  groups: BalanceGroupStatistic[]
}

type BalanceContent = Pick<
  typeof GAME_CONTENT,
  'heroes' | 'regions' | 'events' | 'policies'
>

export type BalanceSimulationDependencies = {
  content: BalanceContent
  createNewGame: (now: number) => GameState
  startExpedition: (
    state: GameState,
    input: StartExpeditionInput,
    now: number,
  ) => CommandResult
  advanceTo: (state: GameState, targetTimestamp: number) => GameState
}

export type BalanceSimulationOptions = {
  seeds?: number
  baseTime?: number
}

// CLI seed values are stable scenario indexes. Hashing them before xorshift32
// avoids the strongly correlated first draw produced by consecutive low states.
export function deriveBalanceSeed(seedIndex: number): number {
  if (!Number.isSafeInteger(seedIndex) || seedIndex <= 0) {
    throw new RangeError('seedIndex 必须是有限正整数。')
  }

  let mixed = seedIndex >>> 0
  mixed ^= mixed >>> 16
  mixed = Math.imul(mixed, 0x85ebca6b)
  mixed ^= mixed >>> 13
  mixed = Math.imul(mixed, 0xc2b2ae35)
  mixed ^= mixed >>> 16
  return normalizeRngState(mixed >>> 0)
}

type GroupAccumulator = {
  scenario: BalanceScenario
  simulationCount: number
  processedEventCount: number
  fullCompletionCount: number
  earlyReturnCount: number
  loot: {
    wood: number
    coins: number
    food: number
    medicine: number
  }
  totalDamage: number
  minimumHealthFloorCount: number
  eventCounts: Map<string, number>
  firstExpeditionGuaranteeCount: number
  commandFailureCount: number
  simulationExceptionCount: number
}

type InvariantAccumulator = Omit<
  BalanceSummary,
  | 'totalScenarios'
  | 'totalSimulations'
  | 'onboardingSimulations'
  | 'steadyStateSimulations'
  | 'seedStart'
  | 'seedEnd'
  | 'totalEventCount'
  | 'commandFailureCount'
  | 'simulationExceptionCount'
  | 'nonDeterministicCount'
>

type SimulationInvariantObservation = {
  hasNoCandidateEvent: boolean
  hasNaN: boolean
  hasInfinity: boolean
  hasNegativeResource: boolean
  hasInvalidHeroHealth: boolean
  hasUnfinishedExpedition: boolean
  hasInvalidRngState: boolean
  hasJournalOverflow: boolean
  hasLoopGuard: boolean
}

const DEFAULT_DEPENDENCIES: BalanceSimulationDependencies = {
  content: GAME_CONTENT,
  createNewGame,
  startExpedition,
  advanceTo,
}

const createHeroPairs = (
  heroIds: readonly string[],
): Array<readonly [string, string]> => {
  const pairs: Array<readonly [string, string]> = []

  for (let first = 0; first < heroIds.length; first += 1) {
    for (let second = first + 1; second < heroIds.length; second += 1) {
      const firstId = heroIds[first]
      const secondId = heroIds[second]
      if (firstId !== undefined && secondId !== undefined) {
        pairs.push([firstId, secondId])
      }
    }
  }

  return pairs
}

export function createBalanceScenarios(
  content: BalanceContent = GAME_CONTENT,
): BalanceScenario[] {
  const heroPairs = createHeroPairs(
    content.heroes.map((hero) => hero.id).toSorted(),
  )
  const regionIds = content.regions.map((region) => region.id).toSorted()
  const policies = content.policies.map((policy) => policy.id).toSorted()

  return BALANCE_COHORTS.flatMap((cohort) =>
    regionIds.flatMap((regionId) =>
      heroPairs.flatMap((heroIds) =>
        policies.map((policy) => ({
          cohort,
          regionId,
          heroIds,
          policy,
        })),
      ),
    ),
  )
}

function createAccumulator(
  scenario: BalanceScenario,
  eventIds: readonly string[],
): GroupAccumulator {
  return {
    scenario,
    simulationCount: 0,
    processedEventCount: 0,
    fullCompletionCount: 0,
    earlyReturnCount: 0,
    loot: { wood: 0, coins: 0, food: 0, medicine: 0 },
    totalDamage: 0,
    minimumHealthFloorCount: 0,
    eventCounts: new Map(eventIds.map((eventId) => [eventId, 0])),
    firstExpeditionGuaranteeCount: 0,
    commandFailureCount: 0,
    simulationExceptionCount: 0,
  }
}

function createInvariantAccumulator(): InvariantAccumulator {
  return {
    noCandidateEventCount: 0,
    nanCount: 0,
    infinityCount: 0,
    negativeResourceCount: 0,
    invalidHeroHealthCount: 0,
    unfinishedExpeditionCount: 0,
    invalidRngStateCount: 0,
    journalOverflowCount: 0,
    maxLoopGuardCount: 0,
  }
}

function createInvariantObservation(): SimulationInvariantObservation {
  return {
    hasNoCandidateEvent: false,
    hasNaN: false,
    hasInfinity: false,
    hasNegativeResource: false,
    hasInvalidHeroHealth: false,
    hasUnfinishedExpedition: false,
    hasInvalidRngState: false,
    hasJournalOverflow: false,
    hasLoopGuard: false,
  }
}

function createCohortState(
  cohort: BalanceCohort,
  baseTime: number,
  dependencies: BalanceSimulationDependencies,
): GameState {
  const state = dependencies.createNewGame(baseTime)
  if (cohort === 'onboarding') {
    return state
  }

  return {
    ...state,
    completedExpeditions: Math.max(1, state.completedExpeditions),
    hasClaimedFirstExpeditionReward: true,
  }
}

function countInvalidNumbers(value: unknown): {
  nanCount: number
  infinityCount: number
} {
  if (typeof value === 'number') {
    return {
      nanCount: Number.isNaN(value) ? 1 : 0,
      infinityCount:
        !Number.isNaN(value) && !Number.isFinite(value) ? 1 : 0,
    }
  }
  if (Array.isArray(value)) {
    const counts = { nanCount: 0, infinityCount: 0 }
    for (const item of value) {
      const itemCounts = countInvalidNumbers(item)
      counts.nanCount += itemCounts.nanCount
      counts.infinityCount += itemCounts.infinityCount
    }
    return counts
  }
  if (typeof value === 'object' && value !== null) {
    const counts = { nanCount: 0, infinityCount: 0 }
    const entries = Object.values(value as Readonly<Record<string, unknown>>)
    for (const item of entries) {
      const itemCounts = countInvalidNumbers(item)
      counts.nanCount += itemCounts.nanCount
      counts.infinityCount += itemCounts.infinityCount
    }
    return counts
  }
  return { nanCount: 0, infinityCount: 0 }
}

function observeStateInvariants(
  state: GameState,
  observation: SimulationInvariantObservation,
): void {
  const invalidNumbers = countInvalidNumbers(state)
  observation.hasNaN ||= invalidNumbers.nanCount > 0
  observation.hasInfinity ||= invalidNumbers.infinityCount > 0

  if (
    Object.values(state.resources).some(
      (amount) => Number.isFinite(amount) && amount < 0,
    ) ||
    (state.activeExpedition !== null &&
      Object.values(state.activeExpedition.carriedLoot).some(
        (amount) => Number.isFinite(amount) && amount < 0,
      ))
  ) {
    observation.hasNegativeResource = true
  }

  if (
    state.heroes.some(
      (hero) =>
        !Number.isFinite(hero.health) ||
        hero.health < 1 ||
        hero.health > hero.maxHealth,
    )
  ) {
    observation.hasInvalidHeroHealth = true
  }

  if (
    state.activeExpedition !== null &&
    state.activeExpedition.rngState !==
      normalizeRngState(state.activeExpedition.rngState)
  ) {
    observation.hasInvalidRngState = true
  }
  if (state.journal.length > MAX_JOURNAL_ENTRIES) {
    observation.hasJournalOverflow = true
  }
}

function commitInvariantObservation(
  observation: SimulationInvariantObservation,
  invariants: InvariantAccumulator,
): void {
  invariants.noCandidateEventCount += observation.hasNoCandidateEvent ? 1 : 0
  invariants.nanCount += observation.hasNaN ? 1 : 0
  invariants.infinityCount += observation.hasInfinity ? 1 : 0
  invariants.negativeResourceCount += observation.hasNegativeResource ? 1 : 0
  invariants.invalidHeroHealthCount += observation.hasInvalidHeroHealth ? 1 : 0
  invariants.unfinishedExpeditionCount +=
    observation.hasUnfinishedExpedition ? 1 : 0
  invariants.invalidRngStateCount += observation.hasInvalidRngState ? 1 : 0
  invariants.journalOverflowCount += observation.hasJournalOverflow ? 1 : 0
  invariants.maxLoopGuardCount += observation.hasLoopGuard ? 1 : 0
}

function eventEntriesForExpedition(
  state: GameState,
  expeditionId: string,
) {
  const prefix = `${expeditionId}-event-`
  return state.journal.filter((entry) => {
    if (entry.expeditionId !== expeditionId || !entry.id.startsWith(prefix)) {
      return false
    }
    const eventIndex = entry.id.slice(prefix.length)
    return /^\d+$/.test(eventIndex)
  })
}

function simulateScenarioSeed(
  accumulator: GroupAccumulator,
  seedIndex: number,
  baseTime: number,
  dependencies: BalanceSimulationDependencies,
  invariants: InvariantAccumulator,
): void {
  accumulator.simulationCount += 1
  const observation = createInvariantObservation()

  try {
    const initialState = createCohortState(
      accumulator.scenario.cohort,
      baseTime,
      dependencies,
    )
    const startResult = dependencies.startExpedition(
      initialState,
      {
        heroIds: [...accumulator.scenario.heroIds],
        regionId: accumulator.scenario.regionId,
        policy: accumulator.scenario.policy,
        seed: deriveBalanceSeed(seedIndex),
      },
      baseTime,
    )
    if (!startResult.ok) {
      accumulator.commandFailureCount += 1
      return
    }

    const expeditionId = startResult.state.activeExpedition?.id
    if (expeditionId === undefined) {
      accumulator.simulationExceptionCount += 1
      observation.hasUnfinishedExpedition = true
      return
    }

    observeStateInvariants(startResult.state, observation)

    const resourcesAfterDeparture = startResult.state.resources
    const startingPartyHealth = new Map(
      startResult.state.heroes
        .filter((hero) => accumulator.scenario.heroIds.includes(hero.id))
        .map((hero) => [hero.id, hero.health]),
    )
    let previousPartyHealth = new Map(startingPartyHealth)
    let state = startResult.state
    let loopCount = 0

    while (
      state.activeExpedition !== null &&
      loopCount < MAX_ADVANCE_ITERATIONS
    ) {
      const targetTimestamp = Math.max(
        state.activeExpedition.nextEventAt,
        state.lastAdvancedAt + 1,
      )
      const nextState = dependencies.advanceTo(state, targetTimestamp)
      observeStateInvariants(nextState, observation)

      for (const heroId of accumulator.scenario.heroIds) {
        const previousHealth = previousPartyHealth.get(heroId)
        const nextHealth = nextState.heroes.find(
          (hero) => hero.id === heroId,
        )?.health
        if (
          previousHealth !== undefined &&
          nextHealth !== undefined &&
          previousHealth > 1 &&
          nextHealth === 1
        ) {
          accumulator.minimumHealthFloorCount += 1
        }
      }
      previousPartyHealth = new Map(
        nextState.heroes
          .filter((hero) => accumulator.scenario.heroIds.includes(hero.id))
          .map((hero) => [hero.id, hero.health]),
      )
      loopCount += 1

      if (nextState === state) {
        observation.hasLoopGuard = true
        break
      }
      state = nextState
    }

    if (state.activeExpedition !== null) {
      observation.hasUnfinishedExpedition = true
      if (loopCount >= MAX_ADVANCE_ITERATIONS) {
        observation.hasLoopGuard = true
      }
    }

    const eventEntries = eventEntriesForExpedition(state, expeditionId)
    const noCandidate = eventEntries.some(
      (entry) => entry.title === INVALID_EXPEDITION_CONFIGURATION_TITLE,
    )
    if (noCandidate) {
      observation.hasNoCandidateEvent = true
    }

    const eventIdByTitle = new Map<string, string>(
      dependencies.content.events.map((event) => [event.title, event.id]),
    )
    let recognizedEventCount = 0
    for (const entry of eventEntries) {
      const eventId = eventIdByTitle.get(entry.title)
      if (eventId !== undefined) {
        accumulator.eventCounts.set(
          eventId,
          (accumulator.eventCounts.get(eventId) ?? 0) + 1,
        )
        recognizedEventCount += 1
      }
    }
    accumulator.processedEventCount += recognizedEventCount

    const region = dependencies.content.regions.find(
      (candidate) => candidate.id === accumulator.scenario.regionId,
    )
    if (
      state.activeExpedition === null &&
      !noCandidate &&
      region !== undefined
    ) {
      if (recognizedEventCount >= region.maxEventCount) {
        accumulator.fullCompletionCount += 1
      } else {
        accumulator.earlyReturnCount += 1
      }
    }

    accumulator.loot.wood +=
      state.resources.wood - resourcesAfterDeparture.wood
    accumulator.loot.coins +=
      state.resources.coins - resourcesAfterDeparture.coins
    accumulator.loot.food +=
      state.resources.food - resourcesAfterDeparture.food
    accumulator.loot.medicine +=
      state.resources.medicine - resourcesAfterDeparture.medicine

    accumulator.totalDamage += accumulator.scenario.heroIds.reduce(
      (total, heroId) => {
        const startHealth = startingPartyHealth.get(heroId) ?? 0
        const finalHealth =
          state.heroes.find((hero) => hero.id === heroId)?.health ?? 0
        return total + Math.max(0, startHealth - finalHealth)
      },
      0,
    )
    if (
      state.journal.some(
        (entry) => entry.id === `${expeditionId}-first-supply`,
      )
    ) {
      accumulator.firstExpeditionGuaranteeCount += 1
    }

  } catch {
    accumulator.simulationExceptionCount += 1
  } finally {
    commitInvariantObservation(observation, invariants)
  }
}

function roundedRatio(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0
  }
  return Math.round((numerator / denominator) * 1_000_000) / 1_000_000
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function finishAccumulator(
  accumulator: GroupAccumulator,
): BalanceGroupStatistic {
  const simulationCount = accumulator.simulationCount
  const totalEvents = [...accumulator.eventCounts.values()].reduce(
    (total, count) => total + count,
    0,
  )

  return {
    ...accumulator.scenario,
    simulationCount,
    averageProcessedEvents: roundedRatio(
      accumulator.processedEventCount,
      simulationCount,
    ),
    fullCompletionRate: roundedRatio(
      accumulator.fullCompletionCount,
      simulationCount,
    ),
    earlyReturnRate: roundedRatio(
      accumulator.earlyReturnCount,
      simulationCount,
    ),
    averageLoot: {
      wood: roundedRatio(accumulator.loot.wood, simulationCount),
      coins: roundedRatio(accumulator.loot.coins, simulationCount),
      food: roundedRatio(accumulator.loot.food, simulationCount),
      medicine: roundedRatio(accumulator.loot.medicine, simulationCount),
    },
    averageDamage: roundedRatio(
      accumulator.totalDamage,
      simulationCount,
    ),
    minimumHealthFloorCount: accumulator.minimumHealthFloorCount,
    events: [...accumulator.eventCounts.entries()]
      .toSorted(([left], [right]) => compareText(left, right))
      .map(([eventId, count]) => ({
        eventId,
        count,
        rate: roundedRatio(count, totalEvents),
      })),
    firstExpeditionGuaranteeRate: roundedRatio(
      accumulator.firstExpeditionGuaranteeCount,
      simulationCount,
    ),
    commandFailureCount: accumulator.commandFailureCount,
    simulationExceptionCount: accumulator.simulationExceptionCount,
  }
}

function assertSimulationOptions(
  options: BalanceSimulationOptions,
): Required<BalanceSimulationOptions> {
  const seeds = options.seeds ?? DEFAULT_BALANCE_SEEDS
  const baseTime = options.baseTime ?? BALANCE_BASE_TIME
  if (!Number.isSafeInteger(seeds) || seeds <= 0) {
    throw new RangeError('seeds 必须是有限正整数。')
  }
  if (!Number.isSafeInteger(baseTime) || baseTime < 0) {
    throw new RangeError('baseTime 必须是非负安全整数。')
  }
  return { seeds, baseTime }
}

export function runBalanceSimulation(
  options: BalanceSimulationOptions = {},
  dependencies: BalanceSimulationDependencies = DEFAULT_DEPENDENCIES,
): BalanceReport {
  const { seeds, baseTime } = assertSimulationOptions(options)
  const scenarios = createBalanceScenarios(dependencies.content)
  const eventIds = dependencies.content.events
    .map((event) => event.id)
    .toSorted()
  const invariants = createInvariantAccumulator()
  const accumulators = scenarios.map((scenario) =>
    createAccumulator(scenario, eventIds),
  )

  for (const accumulator of accumulators) {
    for (let seed = 1; seed <= seeds; seed += 1) {
      simulateScenarioSeed(
        accumulator,
        seed,
        baseTime,
        dependencies,
        invariants,
      )
    }
  }

  const groups = accumulators.map(finishAccumulator)
  const totalEventCount = groups.reduce(
    (total, group) =>
      total + group.events.reduce((sum, event) => sum + event.count, 0),
    0,
  )
  const report: BalanceReport = {
    schemaVersion: 1,
    configuration: {
      baseTime,
      seedCount: seeds,
      seedDerivation: BALANCE_SEED_DERIVATION,
      cohorts: BALANCE_COHORTS,
    },
    summary: {
      totalScenarios: scenarios.length,
      totalSimulations: scenarios.length * seeds,
      onboardingSimulations:
        scenarios.filter((scenario) => scenario.cohort === 'onboarding')
          .length * seeds,
      steadyStateSimulations:
        scenarios.filter((scenario) => scenario.cohort === 'steady-state')
          .length * seeds,
      seedStart: 1,
      seedEnd: seeds,
      totalEventCount,
      commandFailureCount: groups.reduce(
        (total, group) => total + group.commandFailureCount,
        0,
      ),
      simulationExceptionCount: groups.reduce(
        (total, group) => total + group.simulationExceptionCount,
        0,
      ),
      ...invariants,
      nonDeterministicCount: 0,
    },
    groups,
  }

  const reportNumbers = countInvalidNumbers(groups)
  report.summary.nanCount += reportNumbers.nanCount
  report.summary.infinityCount += reportNumbers.infinityCount
  return report
}

export function serializeBalanceReport(report: BalanceReport): string {
  return `${JSON.stringify(report, null, 2)}\n`
}

export function runVerifiedBalanceSimulation(
  options: BalanceSimulationOptions = {},
  dependencies: BalanceSimulationDependencies = DEFAULT_DEPENDENCIES,
): BalanceReport {
  const first = runBalanceSimulation(options, dependencies)
  const second = runBalanceSimulation(options, dependencies)
  if (serializeBalanceReport(first) !== serializeBalanceReport(second)) {
    first.summary.nonDeterministicCount = 1
  }
  return first
}

export function getBalanceCheckFailures(report: BalanceReport): string[] {
  const checks: ReadonlyArray<readonly [number, string]> = [
    [report.summary.commandFailureCount, '远征命令失败'],
    [report.summary.simulationExceptionCount, '模拟运行异常'],
    [report.summary.noCandidateEventCount, '无候选事件'],
    [report.summary.nanCount, 'NaN'],
    [report.summary.infinityCount, 'Infinity'],
    [report.summary.negativeResourceCount, '负资源'],
    [report.summary.invalidHeroHealthCount, '非法英雄生命'],
    [report.summary.unfinishedExpeditionCount, '未结束远征'],
    [report.summary.invalidRngStateCount, '非法 RNG 状态'],
    [report.summary.journalOverflowCount, '日志超过上限'],
    [report.summary.maxLoopGuardCount, '最大循环保护触发'],
    [report.summary.nonDeterministicCount, '结果不确定'],
  ]

  return checks
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${label}: ${count}`)
}
