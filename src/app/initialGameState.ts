import type { SaveLoadResult } from '../save/saveRepository'
import type { GameAppState } from './gameReducer'

export function createInitialGameAppState(
  now: number,
  loaded: SaveLoadResult,
): GameAppState {
  if (!loaded.ok) {
    return {
      game: loaded.state,
      now,
      lastSavedAt: null,
      saveMessage: '损坏存档已隔离',
      notice: { id: now, message: loaded.error, tone: 'error' },
      persistenceStatus: 'quarantined',
    }
  }

  if (loaded.migration === 'v1-write-failed') {
    return {
      game: loaded.state,
      now: Math.max(now, loaded.state.lastAdvancedAt),
      lastSavedAt: null,
      saveMessage: 'V1 存档升级未保存',
      notice: {
        id: now,
        message: 'V1 存档已载入，但 V2 升级写入失败；原 V1 存档已保留。',
        tone: 'error',
      },
      persistenceStatus: 'active',
    }
  }

  const migrated = loaded.migration === 'v1-persisted'
  return {
    game: loaded.state,
    now: Math.max(now, loaded.state.lastAdvancedAt),
    lastSavedAt: loaded.source === 'storage' ? now : null,
    saveMessage: migrated
      ? 'V1 存档已升级'
      : loaded.source === 'storage'
        ? '存档已载入'
        : '新旅程待保存',
    notice:
      loaded.source === 'storage'
        ? {
            id: now,
            message: migrated
              ? 'V1 存档已升级为 V2，离线进度已结算'
              : '存档已载入，离线进度已结算',
            tone: 'info',
          }
        : null,
    persistenceStatus: 'active',
  }
}
