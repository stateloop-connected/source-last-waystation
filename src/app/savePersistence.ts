import type { GameAppState } from './gameReducer'

export function canWriteSave(
  status: GameAppState['persistenceStatus'],
  explicitReplacement = false,
): boolean {
  return status === 'active' || explicitReplacement
}
