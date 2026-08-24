import { getPolicyDefinition } from '../content/policies'
import { getRegionDefinition } from '../content/regions'
import type { ExpeditionPolicy } from '../model/expedition'
import type { CommandResult, GameState } from '../model/gameState'
import type { JournalEntry } from '../model/journal'
import { normalizeRngState } from '../rng/seededRng'
import { advanceTo } from '../simulation/advanceTo'
import { appendJournal } from '../simulation/rewards'

export type StartExpeditionInput = {
  heroIds: string[]
  regionId: string
  policy: ExpeditionPolicy
  seed: number
}

function commandFailure(state: GameState, error: string): CommandResult {
  return { ok: false, state, error }
}

export function startExpedition(
  state: GameState,
  input: StartExpeditionInput,
  now: number,
): CommandResult {
  const commandTimestamp = Math.max(
    state.lastAdvancedAt,
    Number.isFinite(now) ? Math.max(0, Math.floor(now)) : state.lastAdvancedAt,
  )
  const currentState = advanceTo(state, commandTimestamp)

  if (currentState.activeExpedition !== null) {
    return commandFailure(currentState, '当前已有远征队。')
  }
  if (input.heroIds.length !== 2 || new Set(input.heroIds).size !== 2) {
    return commandFailure(currentState, '请选择两名不同的冒险者。')
  }

  const region = getRegionDefinition(input.regionId)
  if (region === undefined) {
    return commandFailure(currentState, '所选区域不存在。')
  }
  if (getPolicyDefinition(input.policy) === undefined) {
    return commandFailure(currentState, '行动方针无效。')
  }
  if (!Number.isSafeInteger(input.seed)) {
    return commandFailure(currentState, '随机种子无效。')
  }

  const selectedHeroes = input.heroIds.map((id) =>
    currentState.heroes.find((hero) => hero.id === id),
  )
  if (selectedHeroes.some((hero) => hero === undefined)) {
    return commandFailure(currentState, '所选冒险者不存在。')
  }
  if (selectedHeroes.some((hero) => hero?.status !== 'idle')) {
    return commandFailure(currentState, '所选冒险者当前无法出发。')
  }
  if (currentState.resources.food < 2) {
    return commandFailure(currentState, '食物不足。')
  }

  const expeditionNumber = currentState.completedExpeditions + 1
  const expeditionId = `expedition-${commandTimestamp}-${expeditionNumber}`
  const rngState = normalizeRngState(input.seed)
  const departureEntry: JournalEntry = {
    id: `${expeditionId}-departure`,
    timestamp: commandTimestamp,
    expeditionId,
    category: 'travel',
    title: '远征出发',
    text: `两名冒险者前往${region.name}，行动方针为${getPolicyDefinition(input.policy)?.name ?? input.policy}。`,
  }

  return {
    ok: true,
    state: {
      ...currentState,
      updatedAt: commandTimestamp,
      lastAdvancedAt: commandTimestamp,
      resources: {
        ...currentState.resources,
        food: currentState.resources.food - 2,
      },
      heroes: currentState.heroes.map((hero) =>
        input.heroIds.includes(hero.id)
          ? { ...hero, status: 'expedition' }
          : hero,
      ),
      activeExpedition: {
        id: expeditionId,
        regionId: region.id,
        partyHeroIds: [...input.heroIds],
        policy: input.policy,
        seed: rngState,
        rngState,
        startedAt: commandTimestamp,
        lastProcessedAt: commandTimestamp,
        nextEventAt: commandTimestamp + region.eventIntervalMs,
        processedEventCount: 0,
        maxEventCount: region.maxEventCount,
        carriedLoot: {
          wood: 0,
          coins: 0,
          food: 0,
          medicine: 0,
        },
        status: 'active',
      },
      journal: appendJournal(currentState.journal, departureEntry),
    },
  }
}
