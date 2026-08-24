import { useContext } from 'react'
import { GameContext, type GameContextValue } from './gameContext'

export function useGame(): GameContextValue {
  const context = useContext(GameContext)
  if (context === null) {
    throw new Error('useGame 必须在 GameProvider 内使用。')
  }
  return context
}
