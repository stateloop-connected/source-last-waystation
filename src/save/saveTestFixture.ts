import { startExpedition } from '../core/commands/startExpedition'
import type { GameState } from '../core/model/gameState'

export function createSaveTestGame(now = 1_700_000_000_000): GameState {
  return {
    gameVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
    lastAdvancedAt: now,
    resources: {
      food: 12,
      medicine: 4,
      wood: 0,
      coins: 20,
    },
    heroes: [
      {
        id: 'ron',
        name: '罗敦',
        role: 'vanguard',
        level: 1,
        maxHealth: 12,
        health: 12,
        power: 7,
        insight: 3,
        survival: 4,
        status: 'idle',
      },
      {
        id: 'eve',
        name: '艾琳',
        role: 'scout',
        level: 1,
        maxHealth: 9,
        health: 9,
        power: 4,
        insight: 7,
        survival: 5,
        status: 'idle',
      },
      {
        id: 'mia',
        name: '米娅',
        role: 'medic',
        level: 1,
        maxHealth: 10,
        health: 10,
        power: 3,
        insight: 5,
        survival: 7,
        status: 'idle',
      },
    ],
    station: {
      watchtowerLevel: 0,
    },
    activeExpedition: null,
    completedExpeditions: 0,
    hasClaimedFirstExpeditionReward: false,
    journal: [
      {
        id: 'journal-start',
        timestamp: now,
        category: 'system',
        title: '抵达边境',
        text: '最后驿站重新点亮了灯火。',
      },
    ],
  }
}

export function createActiveSaveTestGame(
  now = 1_700_000_000_000,
): GameState {
  const result = startExpedition(
    createSaveTestGame(now),
    {
      heroIds: ['ron', 'eve'],
      regionId: 'black-fir-forest',
      policy: 'explore',
      seed: 42,
    },
    now,
  )

  if (!result.ok) {
    throw new Error(`无法创建远征测试存档：${result.error}`)
  }
  return result.state
}
