import { HERO_DEFINITIONS } from '../content/heroes'
import { GAME_VERSION, type GameState } from '../model/gameState'

export function createNewGame(now: number): GameState {
  const createdAt = Number.isFinite(now) ? Math.max(0, Math.floor(now)) : 0

  return {
    gameVersion: GAME_VERSION,
    createdAt,
    updatedAt: createdAt,
    lastAdvancedAt: createdAt,
    resources: {
      food: 12,
      medicine: 4,
      wood: 0,
      coins: 20,
    },
    heroes: HERO_DEFINITIONS.map((hero) => ({
      ...hero,
      health: hero.maxHealth,
      status: 'idle',
    })),
    station: {
      watchtowerLevel: 0,
    },
    activeExpedition: null,
    completedExpeditions: 0,
    hasClaimedFirstExpeditionReward: false,
    journal: [
      {
        id: `system-new-game-${createdAt}`,
        timestamp: createdAt,
        category: 'system',
        title: '接管边境站',
        text: '炉火重新燃起。先组织一支两人远征队，前往黑杉林寻找补给。',
      },
    ],
  }
}
