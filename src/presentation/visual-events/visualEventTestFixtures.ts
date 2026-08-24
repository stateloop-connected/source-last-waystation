import {
  createNewGame,
  startExpedition,
  type GameState,
  type JournalEntry,
  type Resources,
} from '../../core'

export const TEST_NOW = 1_700_000_000_000

export function createActiveGame(now = TEST_NOW): GameState {
  const state = createNewGame(now)
  const result = startExpedition(
    state,
    {
      heroIds: ['ron', 'mia'],
      regionId: 'black-fir-forest',
      policy: 'explore',
      seed: 123,
    },
    now,
  )
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.state
}

export function createMainEventEntry(
  expeditionId: string,
  index: number,
  sourceEventId = 'fallen-timber',
): JournalEntry {
  return {
    id: `${expeditionId}-event-${index}`,
    timestamp: TEST_NOW + index * 15_000,
    expeditionId,
    category: sourceEventId === 'mist-wolf' ? 'combat' : 'event',
    sourceEventId,
    title:
      sourceEventId === 'mist-wolf' ? '遭遇迷雾狼' : '发现木材',
    text: '测试事件结果。',
  }
}

export function addResources(
  resources: Readonly<Resources>,
  deltas: Partial<Resources>,
): Resources {
  return {
    food: resources.food + (deltas.food ?? 0),
    medicine: resources.medicine + (deltas.medicine ?? 0),
    wood: resources.wood + (deltas.wood ?? 0),
    coins: resources.coins + (deltas.coins ?? 0),
  }
}
