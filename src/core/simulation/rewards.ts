import type { GameState } from '../model/gameState'
import type { JournalEntry } from '../model/journal'
import { addNonNegativeSafeIntegers } from '../safeInteger'

export const MAX_JOURNAL_ENTRIES = 200

export type ExpeditionReturnReason =
  | 'completed'
  | 'retreated'
  | 'cautious'

export function appendJournal(
  journal: readonly JournalEntry[],
  ...entries: readonly JournalEntry[]
): JournalEntry[] {
  return [...journal, ...entries].slice(-MAX_JOURNAL_ENTRIES)
}

function getReturnCopy(reason: ExpeditionReturnReason): {
  title: string
  text: string
} {
  switch (reason) {
    case 'completed':
      return {
        title: '远征归来',
        text: '队伍完成了本次探索，正在清点带回的物资。',
      }
    case 'retreated':
      return {
        title: '主动撤退',
        text: '队伍响应召回信号，带着现有战利品返回边境站。',
      }
    case 'cautious':
      return {
        title: '谨慎返程',
        text: '队员伤势已越过警戒线，队伍依照谨慎方针提前返程。',
      }
  }
}

export function settleExpedition(
  state: GameState,
  timestamp: number,
  reason: ExpeditionReturnReason,
): GameState {
  const expedition = state.activeExpedition
  if (expedition === null) {
    return state
  }

  const grantsFirstSupply =
    reason !== 'retreated' && !state.hasClaimedFirstExpeditionReward
  const firstSupplyWood = grantsFirstSupply
    ? Math.max(0, 10 - expedition.carriedLoot.wood)
    : 0
  const settledLoot = {
    ...expedition.carriedLoot,
    wood: addNonNegativeSafeIntegers(
      expedition.carriedLoot.wood,
      firstSupplyWood,
    ),
  }
  const returnCopy = getReturnCopy(reason)
  const returnEntry: JournalEntry = {
    id: `${expedition.id}-return`,
    timestamp,
    expeditionId: expedition.id,
    category: 'return',
    title: returnCopy.title,
    text: returnCopy.text,
  }
  const firstSupplyEntries: JournalEntry[] = grantsFirstSupply
    ? [
        {
          id: `${expedition.id}-first-supply`,
          timestamp,
          expeditionId: expedition.id,
          category: 'reward',
          title: '首次远征补给',
          text:
            firstSupplyWood > 0
              ? `边境站补给队补入 ${firstSupplyWood} 份木材，确保首次远征共带回至少 10 份木材。`
              : '本次远征带回的木材已达到 10 份，首次远征补给完成核定。',
        },
      ]
    : []
  const rewardEntry: JournalEntry = {
    id: `${expedition.id}-reward`,
    timestamp,
    expeditionId: expedition.id,
    category: 'reward',
    title: '战利品入库',
    text: `木材 ${settledLoot.wood}，金币 ${settledLoot.coins}，食物 ${settledLoot.food}，药品 ${settledLoot.medicine}。`,
  }

  return {
    ...state,
    updatedAt: Math.max(state.updatedAt, timestamp),
    resources: {
      food: addNonNegativeSafeIntegers(
        state.resources.food,
        settledLoot.food,
      ),
      medicine: addNonNegativeSafeIntegers(
        state.resources.medicine,
        settledLoot.medicine,
      ),
      wood: addNonNegativeSafeIntegers(
        state.resources.wood,
        settledLoot.wood,
      ),
      coins: addNonNegativeSafeIntegers(
        state.resources.coins,
        settledLoot.coins,
      ),
    },
    heroes: state.heroes.map((hero) =>
      expedition.partyHeroIds.includes(hero.id)
        ? { ...hero, status: 'idle' }
        : hero,
    ),
    activeExpedition: null,
    completedExpeditions: addNonNegativeSafeIntegers(
      state.completedExpeditions,
      1,
    ),
    hasClaimedFirstExpeditionReward:
      state.hasClaimedFirstExpeditionReward || grantsFirstSupply,
    journal: appendJournal(
      state.journal,
      returnEntry,
      ...firstSupplyEntries,
      rewardEntry,
    ),
  }
}
