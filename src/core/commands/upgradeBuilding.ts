import { getWatchtowerUpgradeCost } from '../content/buildings'
import type { CommandResult, GameState } from '../model/gameState'
import type { JournalEntry } from '../model/journal'
import { advanceTo } from '../simulation/advanceTo'
import { appendJournal } from '../simulation/rewards'

export function upgradeWatchtower(
  state: GameState,
  now: number,
): CommandResult {
  const commandTimestamp = Math.max(
    state.lastAdvancedAt,
    Number.isFinite(now) ? Math.max(0, Math.floor(now)) : state.lastAdvancedAt,
  )
  const currentState = advanceTo(state, commandTimestamp)
  const currentLevel = currentState.station.watchtowerLevel
  const cost = getWatchtowerUpgradeCost(currentLevel)

  if (cost === null) {
    return {
      ok: false,
      state: currentState,
      error: '瞭望塔已经达到最高等级。',
    }
  }
  if (currentState.resources.wood < cost) {
    return { ok: false, state: currentState, error: '木材不足。' }
  }

  const nextLevel = currentLevel + 1
  const upgradeEntry: JournalEntry = {
    id: `watchtower-upgrade-${nextLevel}-${commandTimestamp}`,
    timestamp: commandTimestamp,
    category: 'system',
    title: '瞭望塔升级',
    text: `瞭望塔升至 ${nextLevel} 级，离线结算上限增加 1 小时。`,
  }

  return {
    ok: true,
    state: {
      ...currentState,
      updatedAt: commandTimestamp,
      resources: {
        ...currentState.resources,
        wood: currentState.resources.wood - cost,
      },
      station: {
        ...currentState.station,
        watchtowerLevel: nextLevel,
      },
      journal: appendJournal(currentState.journal, upgradeEntry),
    },
  }
}
