import type { GameState } from '../model/gameState'
import { processNextExpeditionEvent } from './expeditionEngine'

export const BASE_OFFLINE_CAP_HOURS = 8
export const MAX_OFFLINE_CAP_HOURS = 11
export const HOUR_MS = 60 * 60 * 1_000
export const MAX_ADVANCE_ITERATIONS = 1_000

type OfflineCapSource = GameState | number

function getWatchtowerLevel(source: OfflineCapSource): number {
  return typeof source === 'number'
    ? source
    : source.station.watchtowerLevel
}

export function getOfflineCapHours(source: OfflineCapSource): number {
  const level = getWatchtowerLevel(source)
  const safeLevel = Number.isFinite(level)
    ? Math.max(0, Math.floor(level))
    : 0
  return Math.min(
    MAX_OFFLINE_CAP_HOURS,
    BASE_OFFLINE_CAP_HOURS + safeLevel,
  )
}

export function getOfflineCapMs(source: OfflineCapSource): number {
  return getOfflineCapHours(source) * HOUR_MS
}

// Both live ticks and offline recovery enter here, so event timestamps and RNG
// consumption are independent of how callers split an interval.
export function advanceTo(
  state: GameState,
  targetTimestamp: number,
): GameState {
  if (!Number.isFinite(targetTimestamp)) {
    return state
  }

  const requestedTimestamp = Math.max(0, Math.floor(targetTimestamp))
  if (requestedTimestamp <= state.lastAdvancedAt) {
    return state
  }

  const simulationTarget = Math.min(
    requestedTimestamp,
    state.lastAdvancedAt + getOfflineCapMs(state),
  )
  let advancedState = state
  let iterations = 0

  while (
    advancedState.activeExpedition !== null &&
    advancedState.activeExpedition.status === 'active' &&
    advancedState.activeExpedition.nextEventAt <= simulationTarget &&
    iterations < MAX_ADVANCE_ITERATIONS
  ) {
    const eventTimestamp = advancedState.activeExpedition.nextEventAt
    advancedState = processNextExpeditionEvent(
      advancedState,
      eventTimestamp,
    )
    iterations += 1
  }

  const skippedDuration = requestedTimestamp - simulationTarget
  if (skippedDuration > 0 && advancedState.activeExpedition !== null) {
    advancedState = {
      ...advancedState,
      activeExpedition: {
        ...advancedState.activeExpedition,
        startedAt: advancedState.activeExpedition.startedAt + skippedDuration,
        lastProcessedAt:
          advancedState.activeExpedition.lastProcessedAt + skippedDuration,
        nextEventAt:
          advancedState.activeExpedition.nextEventAt + skippedDuration,
      },
    }
  }

  return {
    ...advancedState,
    updatedAt: Math.max(advancedState.updatedAt, requestedTimestamp),
    lastAdvancedAt: requestedTimestamp,
  }
}
