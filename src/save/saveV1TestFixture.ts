import type { GameState } from '../core/model/gameState'
import {
  LEGACY_SAVE_SCHEMA_VERSION,
  type GameStateV1,
  type SaveFileV1,
} from './saveTypes'
import {
  createActiveSaveTestGame,
  createSaveTestGame,
} from './saveTestFixture'

export const SYNTHETIC_V1_NOW = 1_700_000_000_000

export function toSyntheticGameStateV1(game: GameState): GameStateV1 {
  return {
    gameVersion: game.gameVersion,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    lastAdvancedAt: game.lastAdvancedAt,
    resources: { ...game.resources },
    heroes: game.heroes.map((hero) => ({
      id: hero.id,
      name: hero.name,
      role: hero.role,
      level: hero.level,
      maxHealth: hero.maxHealth,
      health: hero.health,
      power: hero.power,
      insight: hero.insight,
      survival: hero.survival,
      status: hero.status,
    })),
    station: {
      watchtowerLevel: game.station.watchtowerLevel,
    },
    activeExpedition:
      game.activeExpedition === null
        ? null
        : {
            id: game.activeExpedition.id,
            regionId: game.activeExpedition.regionId,
            partyHeroIds: [...game.activeExpedition.partyHeroIds],
            policy: game.activeExpedition.policy,
            seed: game.activeExpedition.seed,
            rngState: game.activeExpedition.rngState,
            startedAt: game.activeExpedition.startedAt,
            lastProcessedAt: game.activeExpedition.lastProcessedAt,
            nextEventAt: game.activeExpedition.nextEventAt,
            processedEventCount: game.activeExpedition.processedEventCount,
            maxEventCount: game.activeExpedition.maxEventCount,
            carriedLoot: { ...game.activeExpedition.carriedLoot },
            status: game.activeExpedition.status,
          },
    completedExpeditions: game.completedExpeditions,
    hasClaimedFirstExpeditionReward:
      game.hasClaimedFirstExpeditionReward,
    journal: game.journal.map((entry) => ({ ...entry })),
  }
}

export function createSyntheticV1Save(
  game: GameState,
  savedAt = game.updatedAt,
): SaveFileV1 {
  return {
    schemaVersion: LEGACY_SAVE_SCHEMA_VERSION,
    savedAt,
    game: toSyntheticGameStateV1(game),
  }
}

export function createIdleV1Save(
  now = SYNTHETIC_V1_NOW,
): SaveFileV1 {
  return createSyntheticV1Save(createSaveTestGame(now), now)
}

export function createActiveV1Save(
  now = SYNTHETIC_V1_NOW,
): SaveFileV1 {
  return createSyntheticV1Save(createActiveSaveTestGame(now), now)
}

export function createInjuredV1Save(
  now = SYNTHETIC_V1_NOW,
): SaveFileV1 {
  const game = createSaveTestGame(now)
  const firstHero = game.heroes[0]
  if (firstHero === undefined) {
    throw new Error('V1 测试夹具缺少英雄。')
  }

  return createSyntheticV1Save({
    ...game,
    heroes: [
      { ...firstHero, health: 1, status: 'injured' },
      ...game.heroes.slice(1),
    ],
  })
}

export function createFutureV1Save(
  now = SYNTHETIC_V1_NOW,
): SaveFileV1 {
  const future = now + 60 * 60 * 1_000
  return createSyntheticV1Save(createActiveSaveTestGame(future), future)
}
