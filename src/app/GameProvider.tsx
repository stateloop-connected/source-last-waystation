import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type PropsWithChildren,
} from 'react'
import {
  advanceTo,
  createNewGame,
  retreatExpedition,
  startExpedition,
  upgradeWatchtower,
  type CommandResult,
  type ExpeditionPolicy,
  type GameState,
} from '../core'
import { createSaveRepository } from '../save/saveRepository'
import { normalizeGameForNow } from '../save/saveNormalization'
import { scheduleGameTimers } from '../save/saveTimers'
import { addDebugWood } from './devCommands'
import {
  GameContext,
  type GameContextValue,
  type GameNotice,
  type NoticeTone,
} from './gameContext'
import { gameReducer, type GameAppState } from './gameReducer'

const repository = createSaveRepository()
const AUTO_SAVE_INTERVAL_MS = 5_000
const TICK_INTERVAL_MS = 1_000
const NOTICE_DURATION_MS = 4_000

function initialState(): GameAppState {
  const now = Date.now()
  const fallback = createNewGame(now)
  const loaded = repository.load(now, fallback)

  if (!loaded.ok) {
    return {
      game: loaded.state,
      now,
      lastSavedAt: null,
      saveMessage: '损坏存档已隔离',
      notice: { id: now, message: loaded.error, tone: 'error' },
    }
  }

  return {
    game: loaded.state,
    now: Math.max(now, loaded.state.lastAdvancedAt),
    lastSavedAt: loaded.source === 'storage' ? now : null,
    saveMessage: loaded.source === 'storage' ? '存档已载入' : '新旅程待保存',
    notice:
      loaded.source === 'storage'
        ? { id: now, message: '存档已载入，离线进度已结算', tone: 'info' }
        : null,
  }
}

export function GameProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(gameReducer, undefined, initialState)
  const gameRef = useRef(state.game)
  const noticeSequence = useRef(0)

  const createNotice = useCallback(
    (message: string, tone: NoticeTone): GameNotice => ({
      id: Date.now() + noticeSequence.current++,
      message,
      tone,
    }),
    [],
  )

  const prepareCurrentGame = useCallback(() => {
    const now = Date.now()
    const current = gameRef.current
    if (current.lastAdvancedAt <= now) {
      return { game: current, now }
    }

    const game = normalizeGameForNow(current, now)
    gameRef.current = game
    dispatch({ type: 'set-game', game, now })
    return { game, now }
  }, [])

  const reportSave = useCallback((game: GameState, savedAt: number): boolean => {
    const result = repository.save(game, savedAt)
    if (result.ok) {
      dispatch({ type: 'save-status', savedAt, message: '存档已保存' })
      return true
    }

    dispatch({ type: 'save-status', savedAt: null, message: '本地保存失败' })
    dispatch({ type: 'notify', notice: createNotice(result.error, 'error') })
    return false
  }, [createNotice])

  const replaceGame = useCallback(
    (
      game: GameState,
      now: number,
      message?: string,
      tone: NoticeTone = 'success',
      saveImmediately = false,
    ) => {
      gameRef.current = game
      dispatch({
        type: 'set-game',
        game,
        now: Math.max(now, game.lastAdvancedAt),
        ...(message === undefined
          ? {}
          : { notice: createNotice(message, tone) }),
      })
      if (saveImmediately) {
        reportSave(game, now)
      }
    },
    [createNotice, reportSave],
  )

  const handleCommand = useCallback(
    (result: CommandResult, successMessage: string) => {
      if (!result.ok) {
        dispatch({
          type: 'notify',
          notice: createNotice(result.error, 'error'),
        })
        return
      }

      replaceGame(
        result.state,
        result.state.lastAdvancedAt,
        successMessage,
        'success',
        true,
      )
    },
    [createNotice, replaceGame],
  )

  const start = useCallback(
    (heroIds: readonly string[], policy: ExpeditionPolicy) => {
      const { game, now } = prepareCurrentGame()
      const seed =
        (now ^ Math.imul(game.completedExpeditions + 1, 0x9e3779b9)) >>> 0
      handleCommand(
        startExpedition(
          game,
          {
            heroIds: [...heroIds],
            regionId: 'black-fir-forest',
            policy,
            seed,
          },
          now,
        ),
        '远征队已出发',
      )
    },
    [handleCommand, prepareCurrentGame],
  )

  const retreat = useCallback(() => {
    const { game, now } = prepareCurrentGame()
    handleCommand(
      retreatExpedition(game, now),
      '远征队已撤回，战利品已经入库',
    )
  }, [handleCommand, prepareCurrentGame])

  const upgrade = useCallback(() => {
    const { game, now } = prepareCurrentGame()
    handleCommand(
      upgradeWatchtower(game, now),
      '瞭望塔已升级',
    )
  }, [handleCommand, prepareCurrentGame])

  const exportSave = useCallback(() => {
    const { game, now } = prepareCurrentGame()
    reportSave(game, now)
    const result = repository.export(game, now)
    if (!result.ok) {
      dispatch({ type: 'notify', notice: createNotice(result.error, 'error') })
      return
    }

    const blob = new Blob([result.json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = result.filename
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    dispatch({
      type: 'notify',
      notice: createNotice('存档已导出', 'success'),
    })
  }, [createNotice, prepareCurrentGame, reportSave])

  const importSave = useCallback(
    (json: string) => {
      const { game: current, now } = prepareCurrentGame()
      const result = repository.import(json, current, now)
      if (!result.ok) {
        dispatch({
          type: 'notify',
          notice: createNotice(result.error, 'error'),
        })
        return
      }

      gameRef.current = result.state
      dispatch({
        type: 'set-game',
        game: result.state,
        now: Math.max(now, result.state.lastAdvancedAt),
        notice: createNotice('存档导入成功', 'success'),
      })
      dispatch({ type: 'save-status', savedAt: now, message: '导入存档已保存' })
    },
    [createNotice, prepareCurrentGame],
  )

  const resetGame = useCallback(() => {
    const reset = repository.reset()
    if (!reset.ok) {
      dispatch({ type: 'notify', notice: createNotice(reset.error, 'error') })
      return
    }

    const now = Date.now()
    replaceGame(createNewGame(now), now, '新游戏已创建', 'success', true)
  }, [createNotice, replaceGame])

  const debugAdvance = useCallback(
    (milliseconds: number) => {
      const { game: current, now } = prepareCurrentGame()
      const target = now + milliseconds
      const advanced = advanceTo(current, target)
      const completed =
        current.activeExpedition !== null && advanced.activeExpedition === null
      replaceGame(
        advanced,
        target,
        completed ? '远征模拟已完成' : `已推进 ${milliseconds / 1000} 秒`,
        'info',
        true,
      )
    },
    [prepareCurrentGame, replaceGame],
  )

  const debugAddWood = useCallback(() => {
    const { game: current, now } = prepareCurrentGame()
    replaceGame(
      addDebugWood(current, now),
      now,
      '已补充 20 木材（开发调试）',
      'info',
      true,
    )
  }, [prepareCurrentGame, replaceGame])

  const clearNotice = useCallback(() => {
    const notice = state.notice
    if (notice !== null) {
      dispatch({ type: 'clear-notice', id: notice.id })
    }
  }, [state.notice])

  const runSimulationTick = useCallback(() => {
    const { game: current, now } = prepareCurrentGame()
    try {
      const advanced = advanceTo(current, now)
      const completed =
        current.activeExpedition !== null && advanced.activeExpedition === null
      gameRef.current = advanced
      dispatch({
        type: 'set-game',
        game: advanced,
        now,
        ...(completed
          ? {
              notice: createNotice(
                '远征队已自动返程，战利品已经入库',
                'success',
              ),
            }
          : {}),
      })
      if (completed) {
        reportSave(advanced, now)
      }
    } catch {
      dispatch({
        type: 'notify',
        notice: createNotice('远征推进失败，当前存档已保留', 'error'),
      })
    }
  }, [createNotice, prepareCurrentGame, reportSave])

  const runAutoSave = useCallback(() => {
    const { game, now } = prepareCurrentGame()
    reportSave(game, now)
  }, [prepareCurrentGame, reportSave])

  useEffect(
    () =>
      scheduleGameTimers(window, {
        tickIntervalMs: TICK_INTERVAL_MS,
        autoSaveIntervalMs: AUTO_SAVE_INTERVAL_MS,
        onTick: runSimulationTick,
        onAutoSave: runAutoSave,
      }),
    [runAutoSave, runSimulationTick],
  )

  useEffect(() => {
    if (state.notice === null) {
      return undefined
    }

    const noticeId = state.notice.id
    const timer = window.setTimeout(() => {
      dispatch({ type: 'clear-notice', id: noticeId })
    }, NOTICE_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [state.notice])

  const value = useMemo<GameContextValue>(
    () => ({
      game: state.game,
      now: state.now,
      lastSavedAt: state.lastSavedAt,
      saveMessage: state.saveMessage,
      notice: state.notice,
      start,
      retreat,
      upgradeWatchtower: upgrade,
      exportSave,
      importSave,
      resetGame,
      debugAdvance,
      debugAddWood,
      clearNotice,
    }),
    [
      state,
      start,
      retreat,
      upgrade,
      exportSave,
      importSave,
      resetGame,
      debugAdvance,
      debugAddWood,
      clearNotice,
    ],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}
