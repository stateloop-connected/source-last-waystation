import type { ExpeditionState, HeroState } from '../../core'
import type { VisualEvent } from '../../presentation/visual-events'
import { BlackFirForestBackdrop } from './BlackFirForestBackdrop'
import {
  EventOverlay,
  type EventRevealedVisualEvent,
  type LootChangedVisualEvent,
} from './EventOverlay'
import { ExpeditionRoute } from './ExpeditionRoute'
import { RESOURCE_LABELS, selectPrimaryEventTag } from './scenePresentation'
import './expeditionScene.css'

type ExpeditionSceneProps = {
  expedition: ExpeditionState
  heroes: readonly HeroState[]
  regionName: string
  visualEvents?: readonly VisualEvent[]
  paused?: boolean
  className?: string
}

function lastEventOfType<T extends VisualEvent['type']>(
  visualEvents: readonly VisualEvent[],
  type: T,
): Extract<VisualEvent, { type: T }> | undefined {
  return visualEvents.findLast(
    (event): event is Extract<VisualEvent, { type: T }> => event.type === type,
  )
}

function liveAnnouncement(
  event: EventRevealedVisualEvent | undefined,
  visualEvents: readonly VisualEvent[],
  heroes: readonly HeroState[],
): string {
  if (event === undefined) {
    return ''
  }

  const results: string[] = []

  for (const visualEvent of visualEvents) {
    if (visualEvent.transitionId !== event.transitionId) {
      continue
    }

    if (visualEvent.type === 'heroDamaged') {
      const name =
        heroes.find((hero) => hero.id === visualEvent.heroId)?.name ?? '队员'
      results.push(`${name}损失 ${visualEvent.amount} 点生命`)
    } else if (visualEvent.type === 'heroHealed') {
      const name =
        heroes.find((hero) => hero.id === visualEvent.heroId)?.name ?? '队员'
      results.push(`${name}恢复 ${visualEvent.amount} 点生命`)
    } else if (visualEvent.type === 'lootChanged') {
      const direction = visualEvent.amount >= 0 ? '获得' : '失去'
      results.push(
        `${direction}${RESOURCE_LABELS[visualEvent.resource]} ${Math.abs(visualEvent.amount)}`,
      )
    }
  }

  return [event.title, ...results].join('，')
}

export function ExpeditionScene({
  expedition,
  heroes,
  regionName,
  visualEvents = [],
  paused = false,
  className,
}: ExpeditionSceneProps) {
  const party = expedition.partyHeroIds
    .map((heroId) => heroes.find((hero) => hero.id === heroId))
    .filter((hero): hero is HeroState => hero !== undefined)
  const event = lastEventOfType(visualEvents, 'eventRevealed')
  const eventLootChanges: LootChangedVisualEvent[] = event
    ? visualEvents.filter(
        (visualEvent): visualEvent is LootChangedVisualEvent =>
          visualEvent.type === 'lootChanged' &&
          visualEvent.expeditionId === expedition.id &&
          visualEvent.transitionId === event.transitionId,
      )
    : []
  const classes = ['expedition-scene', className].filter(Boolean).join(' ')
  const tone = event ? selectPrimaryEventTag(event.tags) : 'ambient'

  return (
    <section
      aria-label={`${regionName}远征场景`}
      className={classes}
      data-event-tone={tone}
      data-paused={paused}
      data-testid="expedition-scene"
    >
      <BlackFirForestBackdrop />

      <div className="expedition-scene__location" aria-hidden="true">
        <span>当前区域</span>
        <strong>{regionName}</strong>
      </div>

      {event ? (
        <EventOverlay
          event={event}
          key={event.id}
          lootChanges={eventLootChanges}
        />
      ) : null}

      <ExpeditionRoute
        heroes={party}
        maxEventCount={expedition.maxEventCount}
        processedEventCount={expedition.processedEventCount}
        visualEvents={visualEvents}
      />

      <p className="visually-hidden" aria-atomic="true" aria-live="polite">
        {liveAnnouncement(event, visualEvents, party)}
      </p>
    </section>
  )
}
