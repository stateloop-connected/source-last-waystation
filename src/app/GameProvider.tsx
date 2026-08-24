import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
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
import { useVisualEffects } from '../presentation/useVisualEffects'
import type {
  GameTransitionSource,
  GameTransitionSummary,
} from '../presentation/visual-events'
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
import { createInitialGameAppState } from './initialGameState'
import { canWriteSave } from './savePersistence'

const repository = createSaveRepository()
const AUTO_SAVE_INTERVAL_MS = 5_000
const TICK_INTERVAL_MS = 1_000
const NOTICE_DURATION_MS = 4_000

type GameBootstrap = {
  appState: GameAppState
  transitionSummary?: GameTransitionSummary
  persistAdvancedState: boolean
}

type GameReplacementOptions = {
  message?: string
  tone?: NoticeTone
  saveImmediately?: boolean
  explicitReplacement?: boolean
  transitionSummary?: GameTransitionSummary
}

function loadInitialState(): GameBootstrap {
  const now = Date.now()
  const fallback = createNewGame(now)
  const loaded = repository.load(now, fallback)
  return {
    appState: createInitialGameAppState(now, loaded),
    ...(loaded.ok && loaded.transitionSummary !== undefined
      ? { transitionSummary: loaded.transitionSummary }
      : {}),
    persistAdvancedState:
      loaded.ok &&
      loaded.source === 'storage' &&
      loaded.migration === undefined &&
      loaded.transitionSummary !== undefined,
  }
}

export function GameProvider({ children }: PropsWithChildren) {
  const [bootstrap] = useState(loadInitialState)
  const [state, dispatch] = useReducer(gameReducer, bootstrap.appState)
  const gameRef = useRef(state.game)
  const bootstrapSummaryRef = useRef(bootstrap.transitionSummary ?? null)
  const persistBootstrapRef = useRef(bootstrap.persistAdvancedState)
  const noticeSequence = useRef(0)
  const { presentBootstrapSummary, presentTransition } = useVisualEffects()

  const createNotice = useCallback(
    (message: string, tone: NoticeTone): GameNotice => ({
      id: Date.now() + noticeSequence.current++,
      message,
      tone,
    }),
    [],
  )

  const reportSave = useCallback(
    (
      game: GameState,
      savedAt: number,
      explicitReplacement = false,
    ): boolean => {
      if (!canWriteSave(state.persistenceStatus, explicitReplacement)) {
        return false
      }

      const result = repository.save(game, savedAt)
      if (result.ok) {
        dispatch({ type: 'save-status', savedAt, message: '存档已保存' })
        return true
      }

      dispatch({ type: 'save-status', savedAt: null, message: '本地保存失败' })
      dispatch({ type: 'notify', notice: createNotice(result.error, 'error') })
      return false
    },
    [createNotice, state.persistenceStatus],
  )

  const replaceGame = useCallback(
    (
      game: GameState,
      now: number,
      source: GameTransitionSource,
      options: GameReplacementOptions = {},
    ) => {
      const previous = gameRef.current
      gameRef.current = game
      presentTransition(
        previous,
        game,
        source,
        options.transitionSummary,
      )
      dispatch({
        type: 'set-game',
        game,
        now: Math.max(now, game.lastAdvancedAt),
        ...(options.message === undefined
          ? {}
          : {
              notice: createNotice(
                options.message,
                options.tone ?? 'success',
              ),
            }),
        ...(options.explicitReplacement
          ? { persistenceStatus: 'active' as const }
          : {}),
      })
      if (options.saveImmediately) {
        reportSave(game, now, options.explicitReplacement)
      }
    },
    [createNotice, presentTransition, reportSave],
  )

  const prepareCurrentGame = useCallback(
    (source: GameTransitionSource = 'liveTick') => {
      const now = Date.now()
      const current = gameRef.current
      if (current.lastAdvancedAt <= now) {
        return { game: current, now }
      }

      const game = normalizeGameForNow(current, now)
      replaceGame(game, now, source)
      return { game, now }
    },
    [replaceGame],
  )

  const handleCommand = useCallback(
    (
      result: CommandResult,
      successMessage: string,
      source: GameTransitionSource,
    ) => {
      if (!result.ok) {
        dispatch({
          type: 'notify',
          notice: createNotice(result.error, 'error'),
        })
        return
      }

      replaceGame(result.state, result.state.lastAdvancedAt, source, {
        message: successMessage,
        saveImmediately: true,
      })
    },
    [createNotice, replaceGame],
  )

  const start = useCallback(
    (heroIds: readonly string[], policy: ExpeditionPolicy) => {
      const { game, now } = prepareCurrentGame('startCommand')
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
        'startCommand',
      )
    },
    [handleCommand, prepareCurrentGame],
  )

  const retreat = useCallback(() => {
    const { game, now } = prepareCurrentGame('retreatCommand')
    handleCommand(
      retreatExpedition(game, now),
      '远征队已撤回，战利品已经入库',
      'retreatCommand',
    )
  }, [handleCommand, prepareCurrentGame])

  const upgrade = useCallback(() => {
    const { game, now } = prepareCurrentGame('upgradeCommand')
    handleCommand(
      upgradeWatchtower(game, now),
      '瞭望塔已升级',
      'upgradeCommand',
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

      replaceGame(result.state, now, 'importSave', {
        message: '存档导入成功',
        explicitReplacement: true,
        ...(result.transitionSummary === undefined
          ? {}
          : { transitionSummary: result.transitionSummary }),
      })
      dispatch({ type: 'save-status', savedAt: now, message: '导入存档已保存' })
    },
    [createNotice, prepareCurrentGame, replaceGame],
  )

  const resetGame = useCallback(() => {
    const reset = repository.reset()
    if (!reset.ok) {
      dispatch({ type: 'notify', notice: createNotice(reset.error, 'error') })
      return
    }

    const now = Date.now()
    replaceGame(createNewGame(now), now, 'resetGame', {
      message: '新游戏已创建',
      saveImmediately: true,
      explicitReplacement: true,
    })
  }, [createNotice, replaceGame])

  const debugAdvance = useCallback(
    (milliseconds: number) => {
      const { game: current, now } = prepareCurrentGame('debugAdvance')
      const target = now + milliseconds
      const advanced = advanceTo(current, target)
      const completed =
        current.activeExpedition !== null && advanced.activeExpedition === null
      replaceGame(advanced, target, 'debugAdvance', {
        message: completed
          ? '远征模拟已完成'
          : `已推进 ${milliseconds / 1000} 秒`,
        tone: 'info',
        saveImmediately: true,
      })
    },
    [prepareCurrentGame, replaceGame],
  )

  const debugAddWood = useCallback(() => {
    const { game: current, now } = prepareCurrentGame('debugCommand')
    replaceGame(addDebugWood(current, now), now, 'debugCommand', {
      message: '已补充 20 木材（开发调试）',
      tone: 'info',
      saveImmediately: true,
    })
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
      replaceGame(advanced, now, 'liveTick', {
        ...(completed
          ? {
              message: '远征队已自动返程，战利品已经入库',
              tone: 'success' as const,
              saveImmediately: true,
            }
          : {}),
      })
    } catch {
      dispatch({
        type: 'notify',
        notice: createNotice('远征推进失败，当前存档已保留', 'error'),
      })
    }
  }, [createNotice, prepareCurrentGame, replaceGame])

  const runAutoSave = useCallback(() => {
    const { game, now } = prepareCurrentGame()
    reportSave(game, now)
  }, [prepareCurrentGame, reportSave])

  useEffect(() => {
    const summary = bootstrapSummaryRef.current
    if (summary === null) {
      return
    }

    bootstrapSummaryRef.current = null
    presentBootstrapSummary(
      summary,
      `${state.game.lastAdvancedAt}:${state.game.updatedAt}`,
    )
    if (persistBootstrapRef.current) {
      persistBootstrapRef.current = false
      reportSave(state.game, state.game.lastAdvancedAt)
    }
  }, [presentBootstrapSummary, reportSave, state.game])

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
