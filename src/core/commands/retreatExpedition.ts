import type { CommandResult, GameState } from '../model/gameState'
import { advanceTo } from '../simulation/advanceTo'
import { settleExpedition } from '../simulation/rewards'

export function retreatExpedition(
  state: GameState,
  now: number,
): CommandResult {
  const hadActiveExpedition = state.activeExpedition !== null
  const commandTimestamp = Math.max(
    state.lastAdvancedAt,
    Number.isFinite(now) ? Math.max(0, Math.floor(now)) : state.lastAdvancedAt,
  )
  const currentState = advanceTo(state, commandTimestamp)
  if (currentState.activeExpedition === null) {
    if (hadActiveExpedition) {
      return { ok: true, state: currentState }
    }

    return {
      ok: false,
      state: currentState,
      error: '当前没有正在进行的远征。',
    }
  }

  return {
    ok: true,
    state: settleExpedition(currentState, commandTimestamp, 'retreated'),
  }
}
