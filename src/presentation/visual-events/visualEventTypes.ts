import type {
  EventTag,
  ResourceType,
  Resources,
} from '../../core'

export const GAME_TRANSITION_SOURCES = [
  'bootstrap',
  'liveTick',
  'startCommand',
  'retreatCommand',
  'debugAdvance',
  'importSave',
  'resetGame',
  'upgradeCommand',
  'debugCommand',
  'backgroundRecovery',
] as const

export type GameTransitionSource =
  (typeof GAME_TRANSITION_SOURCES)[number]

export type HeroHealthDeltas = Readonly<Record<string, number>>

export type GameTransitionSummary = {
  elapsedMs: number
  eventCount: number
  completedExpeditions: number
  resourceDeltas: Resources
  heroHealthDeltas: HeroHealthDeltas
}

export const VISUAL_EVENT_TAG_PRIORITY = [
  'combat',
  'danger',
  'reward',
  'recovery',
  'discovery',
  'safe',
] as const satisfies readonly EventTag[]

export function getPrimaryVisualEventTag(
  tags: readonly EventTag[],
): EventTag {
  return (
    VISUAL_EVENT_TAG_PRIORITY.find((candidate) => tags.includes(candidate)) ??
    'safe'
  )
}

export type ProgressSummaryKind =
  | 'batch'
  | 'offline'
  | 'import'
  | 'background'
  | 'queueOverflow'

type VisualEventBase = {
  id: string
  transitionId: string
  source: GameTransitionSource
}

export type ExpeditionStartedVisualEvent = VisualEventBase & {
  type: 'expeditionStarted'
  expeditionId: string
  heroIds: readonly string[]
}

export type PartyAdvancedVisualEvent = VisualEventBase & {
  type: 'partyAdvanced'
  expeditionId: string
  fromIndex: number
  toIndex: number
  maxEventCount: number
}

export type EventRevealedVisualEvent = VisualEventBase & {
  type: 'eventRevealed'
  expeditionId: string
  journalEntryId: string
  sourceEventId?: string
  title: string
  text: string
  tags: readonly EventTag[]
}

export type HeroDamagedVisualEvent = VisualEventBase & {
  type: 'heroDamaged'
  heroId: string
  amount: number
}

export type HeroHealedVisualEvent = VisualEventBase & {
  type: 'heroHealed'
  heroId: string
  amount: number
}

export type LootChangedVisualEvent = VisualEventBase & {
  type: 'lootChanged'
  expeditionId: string
  resource: ResourceType
  amount: number
}

export type ExpeditionReturnedVisualEvent = VisualEventBase & {
  type: 'expeditionReturned'
  expeditionId: string
  processedEventCount: number
  completedExpeditionsDelta: number
  resourceDeltas: Resources
  heroHealthDeltas: HeroHealthDeltas
}

export type ProgressSummaryVisualEvent = VisualEventBase &
  GameTransitionSummary & {
    type: 'progressSummary'
    summaryKind: ProgressSummaryKind
  }

export type VisualEvent =
  | ExpeditionStartedVisualEvent
  | PartyAdvancedVisualEvent
  | EventRevealedVisualEvent
  | HeroDamagedVisualEvent
  | HeroHealedVisualEvent
  | LootChangedVisualEvent
  | ExpeditionReturnedVisualEvent
  | ProgressSummaryVisualEvent
