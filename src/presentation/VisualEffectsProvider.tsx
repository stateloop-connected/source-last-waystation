import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import type { GameState } from '../core'
import {
  accumulateBackgroundTransition as appendBackgroundTransition,
  deriveBackgroundVisualEvents,
  type BackgroundTransition,
} from './backgroundTransition'
import {
  createVisualEffectTimer,
  type VisualEffectTimer,
} from './visualEffectTimer'
import { useMotionPreferences } from './motion'
import {
  clearVisualEventQueue,
  createVisualEventQueue,
  deriveTransitionSummary,
  deriveVisualEvents,
  dismissVisualEvent,
  enqueueVisualEvents,
  hasTransitionProgress,
  type ExpeditionReturnedVisualEvent,
  type GameTransitionSource,
  type GameTransitionSummary,
  type ProgressSummaryKind,
  type ProgressSummaryVisualEvent,
  type VisualEvent,
  type VisualEventQueueState,
} from './visual-events'
import {
  VisualEffectsContext,
  type VisualEffectsContextValue,
} from './visualEffectsContext'

type VisualEffectsState = {
  queue: VisualEventQueueState
  returnSummary: ExpeditionReturnedVisualEvent | null
  progressSummary: ProgressSummaryVisualEvent | null
}

type VisualEffectsAction =
  | {
      type: 'present'
      events: readonly VisualEvent[]
      source: GameTransitionSource
    }
  | { type: 'clear-transient' }
  | { type: 'dismiss-event'; eventId: string }
  | { type: 'dismiss-return-summary' }
  | { type: 'dismiss-progress-summary' }

const REPLACEMENT_SOURCES = new Set<GameTransitionSource>([
  'bootstrap',
  'startCommand',
  'importSave',
  'resetGame',
  'backgroundRecovery',
])

function createInitialState(): VisualEffectsState {
  return {
    queue: createVisualEventQueue(),
    returnSummary: null,
    progressSummary: null,
  }
}

function isPersistentProgressSummary(
  event: VisualEvent,
): boolean {
  return (
    event.type === 'progressSummary' &&
    (event.summaryKind === 'offline' ||
      event.summaryKind === 'import' ||
      event.summaryKind === 'background')
  )
}

function getTransientEvents(
  events: readonly VisualEvent[],
): VisualEvent[] {
  const includesReturn = events.some(
    (event) => event.type === 'expeditionReturned',
  )
  return events.filter(
    (event) =>
      event.type !== 'expeditionReturned' &&
      !isPersistentProgressSummary(event) &&
      !(
        includesReturn &&
        event.type === 'progressSummary' &&
        (event.summaryKind === 'batch' ||
          event.summaryKind === 'queueOverflow')
      ),
  )
}

function visualEffectsReducer(
  state: VisualEffectsState,
  action: VisualEffectsAction,
): VisualEffectsState {
  switch (action.type) {
    case 'present': {
      if (action.source === 'resetGame') {
        return {
          queue: enqueueVisualEvents(state.queue, [], 'resetGame'),
          returnSummary: null,
          progressSummary: null,
        }
      }

      const returned = action.events.findLast(
        (event): event is ExpeditionReturnedVisualEvent =>
          event.type === 'expeditionReturned',
      )
      const progress = action.events.findLast(
        (event): event is ProgressSummaryVisualEvent =>
          event.type === 'progressSummary' &&
          isPersistentProgressSummary(event),
      )
      const clearsPersistentState = REPLACEMENT_SOURCES.has(action.source)

      return {
        queue: enqueueVisualEvents(
          state.queue,
          getTransientEvents(action.events),
          action.source,
        ),
        returnSummary:
          returned ??
          (clearsPersistentState ? null : state.returnSummary),
        progressSummary:
          progress ??
          (clearsPersistentState ? null : state.progressSummary),
      }
    }
    case 'clear-transient':
      return {
        ...state,
        queue: clearVisualEventQueue(state.queue),
      }
    case 'dismiss-event':
      return {
        ...state,
        queue: dismissVisualEvent(state.queue, action.eventId),
      }
    case 'dismiss-return-summary':
      return { ...state, returnSummary: null }
    case 'dismiss-progress-summary':
      return { ...state, progressSummary: null }
  }
}

function summaryKindForSource(
  source: 'bootstrap' | 'importSave' | 'backgroundRecovery',
): ProgressSummaryKind {
  switch (source) {
    case 'bootstrap':
      return 'offline'
    case 'importSave':
      return 'import'
    case 'backgroundRecovery':
      return 'background'
  }
}

function createSummaryEvent(
  summary: GameTransitionSummary,
  source: 'bootstrap' | 'importSave' | 'backgroundRecovery',
  transitionKey: string,
): ProgressSummaryVisualEvent {
  const transitionId = `${source}:${transitionKey}`
  return {
    id: `${transitionId}:summary`,
    transitionId,
    source,
    type: 'progressSummary',
    summaryKind: summaryKindForSource(source),
    elapsedMs: summary.elapsedMs,
    eventCount: summary.eventCount,
    completedExpeditions: summary.completedExpeditions,
    resourceDeltas: { ...summary.resourceDeltas },
    heroHealthDeltas: { ...summary.heroHealthDeltas },
  }
}

function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

function getPlaybackDuration(
  motion: 'full' | 'reduced' | 'off',
): number {
  switch (motion) {
    case 'full':
      return 1_800
    case 'reduced':
      return 1_000
    case 'off':
      return 5_000
  }
}

export function VisualEffectsProvider({ children }: PropsWithChildren) {
  const { effectiveMotion } = useMotionPreferences()
  const [state, dispatch] = useReducer(
    visualEffectsReducer,
    undefined,
    createInitialState,
  )
  const [isPageVisible, setIsPageVisible] = useState(isDocumentVisible)
  const pageVisibleRef = useRef(isPageVisible)
  const backgroundTransitionRef = useRef<BackgroundTransition | null>(null)
  const recoveringFromBackgroundRef = useRef(false)
  const playbackTimerRef = useRef<VisualEffectTimer | null>(null)

  const clearPlaybackTimer = useCallback(() => {
    playbackTimerRef.current?.clear()
  }, [])

  const scheduleTransientClear = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }
    playbackTimerRef.current ??= createVisualEffectTimer(window)
    playbackTimerRef.current.schedule(
      () => dispatch({ type: 'clear-transient' }),
      getPlaybackDuration(effectiveMotion),
    )
  }, [effectiveMotion])

  const presentNow = useCallback(
    (events: readonly VisualEvent[], source: GameTransitionSource) => {
      if (REPLACEMENT_SOURCES.has(source)) {
        clearPlaybackTimer()
      }
      dispatch({ type: 'present', events, source })
      if (getTransientEvents(events).length > 0) {
        scheduleTransientClear()
      }
    },
    [clearPlaybackTimer, scheduleTransientClear],
  )

  const recordBackgroundTransition = useCallback(
    (previous: GameState, next: GameState) => {
      backgroundTransitionRef.current = appendBackgroundTransition(
        backgroundTransitionRef.current,
        previous,
        next,
      )
    },
    [],
  )

  const flushBackgroundTransition = useCallback(() => {
    const pending = backgroundTransitionRef.current
    backgroundTransitionRef.current = null
    if (pending !== null) {
      presentNow(
        deriveBackgroundVisualEvents(pending),
        'backgroundRecovery',
      )
    }
  }, [presentNow])

  const presentTransition = useCallback<
    VisualEffectsContextValue['presentTransition']
  >(
    (previous, next, source, transitionSummary) => {
      if (source === 'resetGame') {
        backgroundTransitionRef.current = null
        recoveringFromBackgroundRef.current = false
        presentNow([], source)
        return
      }

      if (source === 'importSave') {
        backgroundTransitionRef.current = null
        recoveringFromBackgroundRef.current = false
        const events =
          transitionSummary !== undefined &&
          hasTransitionProgress(transitionSummary)
            ? [
                createSummaryEvent(
                  transitionSummary,
                  'importSave',
                  `${next.lastAdvancedAt}:${next.updatedAt}`,
                ),
              ]
            : []
        presentNow(events, source)
        return
      }

      if (!pageVisibleRef.current || !isDocumentVisible()) {
        recordBackgroundTransition(previous, next)
        return
      }

      if (recoveringFromBackgroundRef.current) {
        recoveringFromBackgroundRef.current = false
        const pending = backgroundTransitionRef.current
        const hasPendingBackgroundProgress =
          pending !== null &&
          hasTransitionProgress(
            deriveTransitionSummary(pending.previous, pending.next),
          )
        const commandSettledBackgroundEvents =
          (source === 'retreatCommand' || source === 'upgradeCommand') &&
          deriveTransitionSummary(previous, next).eventCount > 0
        const commandFollowsBackgroundProgress =
          (source === 'retreatCommand' || source === 'upgradeCommand') &&
          hasPendingBackgroundProgress &&
          pending?.next.activeExpedition !== null
        if (
          source === 'liveTick' ||
          commandSettledBackgroundEvents ||
          commandFollowsBackgroundProgress
        ) {
          recordBackgroundTransition(previous, next)
          const combined = backgroundTransitionRef.current
          const returned =
            combined === null
              ? undefined
              : deriveVisualEvents(
                  combined.previous,
                  combined.next,
                  source,
                ).find(
                  (event): event is ExpeditionReturnedVisualEvent =>
                    event.type === 'expeditionReturned',
                )
          if (returned !== undefined) {
            backgroundTransitionRef.current = null
            presentNow([returned], 'backgroundRecovery')
            return
          }
          flushBackgroundTransition()
          return
        }
        flushBackgroundTransition()
      }

      presentNow(deriveVisualEvents(previous, next, source), source)
    },
    [flushBackgroundTransition, presentNow, recordBackgroundTransition],
  )

  const presentBootstrapSummary = useCallback<
    VisualEffectsContextValue['presentBootstrapSummary']
  >(
    (summary, transitionKey) => {
      if (!hasTransitionProgress(summary)) {
        return
      }
      presentNow(
        [createSummaryEvent(summary, 'bootstrap', transitionKey)],
        'bootstrap',
      )
    },
    [presentNow],
  )

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined
    }

    const handleVisibilityChange = () => {
      const visible = isDocumentVisible()
      pageVisibleRef.current = visible
      setIsPageVisible(visible)
      if (!visible) {
        recoveringFromBackgroundRef.current = false
        clearPlaybackTimer()
        dispatch({ type: 'clear-transient' })
        return
      }

      recoveringFromBackgroundRef.current = true
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [clearPlaybackTimer])

  useEffect(
    () => () => {
      clearPlaybackTimer()
      backgroundTransitionRef.current = null
      recoveringFromBackgroundRef.current = false
    },
    [clearPlaybackTimer],
  )

  const dismissEvent = useCallback((eventId: string) => {
    dispatch({ type: 'dismiss-event', eventId })
  }, [])
  const dismissReturnSummary = useCallback(() => {
    dispatch({ type: 'dismiss-return-summary' })
  }, [])
  const dismissProgressSummary = useCallback(() => {
    dispatch({ type: 'dismiss-progress-summary' })
  }, [])

  const value = useMemo<VisualEffectsContextValue>(
    () => ({
      events: state.queue.items,
      returnSummary: state.returnSummary,
      progressSummary: state.progressSummary,
      isPageVisible,
      presentTransition,
      presentBootstrapSummary,
      dismissEvent,
      dismissReturnSummary,
      dismissProgressSummary,
    }),
    [
      dismissEvent,
      dismissProgressSummary,
      dismissReturnSummary,
      isPageVisible,
      presentBootstrapSummary,
      presentTransition,
      state,
    ],
  )

  return (
    <VisualEffectsContext.Provider value={value}>
      <div
        className="visual-effects-root"
        data-page-visible={isPageVisible ? 'true' : 'false'}
      >
        {children}
      </div>
    </VisualEffectsContext.Provider>
  )
}
