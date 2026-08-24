import { getRegionDefinition } from '../core/content/regions'
import type { GameState } from '../core/model/gameState'
import {
  MAX_SAVE_TIMESTAMP,
  type SaveFileV1,
} from './saveTypes'

function normalizeReferenceTime(now: number, save: SaveFileV1): number {
  if (!Number.isFinite(now)) {
    return Math.min(save.savedAt, save.game.lastAdvancedAt)
  }
  return Math.min(MAX_SAVE_TIMESTAMP, Math.max(0, Math.floor(now)))
}

function shiftAndClamp(
  timestamp: number,
  clockSkew: number,
  upperBound: number,
): number {
  return Math.min(upperBound, Math.max(0, timestamp - clockSkew))
}

function normalizeExpeditionTimeline(
  game: GameState,
  clockSkew: number,
): GameState['activeExpedition'] {
  const expedition = game.activeExpedition
  if (expedition === null) {
    return null
  }

  const startedAt = Math.max(
    game.createdAt,
    shiftAndClamp(expedition.startedAt, clockSkew, game.lastAdvancedAt),
  )
  const lastProcessedAt = Math.max(
    startedAt,
    shiftAndClamp(
      expedition.lastProcessedAt,
      clockSkew,
      game.lastAdvancedAt,
    ),
  )
  const region = getRegionDefinition(expedition.regionId)
  const savedInterval = Math.max(
    1,
    expedition.nextEventAt - expedition.lastProcessedAt,
  )
  const eventInterval = region?.eventIntervalMs ?? savedInterval
  const nextEventAt = Math.min(
    MAX_SAVE_TIMESTAMP,
    lastProcessedAt + eventInterval,
  )

  return {
    ...expedition,
    startedAt,
    lastProcessedAt,
    nextEventAt,
  }
}

// A system clock can move backwards between save and load. Shift the complete
// game timeline together so relative expedition timing remains deterministic.
export function normalizeSaveForNow(
  save: SaveFileV1,
  now: number,
): SaveFileV1 {
  const referenceTime = normalizeReferenceTime(now, save)
  const clockSkew = Math.max(0, save.game.lastAdvancedAt - referenceTime)
  const lastAdvancedAt = shiftAndClamp(
    save.game.lastAdvancedAt,
    clockSkew,
    referenceTime,
  )
  const createdAt = shiftAndClamp(
    save.game.createdAt,
    clockSkew,
    lastAdvancedAt,
  )
  const updatedAt = Math.max(
    createdAt,
    shiftAndClamp(save.game.updatedAt, clockSkew, lastAdvancedAt),
  )
  const timelineGame: GameState = {
    ...save.game,
    createdAt,
    updatedAt,
    lastAdvancedAt,
    journal: save.game.journal.map((entry) => ({
      ...entry,
      timestamp: shiftAndClamp(
        entry.timestamp,
        clockSkew,
        lastAdvancedAt,
      ),
    })),
  }
  const game: GameState = {
    ...timelineGame,
    activeExpedition: normalizeExpeditionTimeline(
      timelineGame,
      clockSkew,
    ),
  }

  return {
    ...save,
    savedAt: Math.min(
      referenceTime,
      Math.max(game.lastAdvancedAt, save.savedAt - clockSkew),
    ),
    game,
  }
}

export function normalizeGameForNow(
  game: GameState,
  now: number,
): GameState {
  return normalizeSaveForNow(
    {
      schemaVersion: 1,
      savedAt: game.updatedAt,
      game,
    },
    now,
  ).game
}
