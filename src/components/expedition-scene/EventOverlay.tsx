import {
  HeartPulse,
  MapPinned,
  ShieldCheck,
  Sparkles,
  Swords,
  TriangleAlert,
} from 'lucide-react'
import type { ResourceType } from '../../core'
import type { VisualEvent } from '../../presentation/visual-events'
import { FloatingResult } from './FloatingResult'
import {
  EVENT_TAG_LABELS,
  RESOURCE_LABELS,
  formatSignedAmount,
  selectPrimaryEventTag,
  type EventPresentationTone,
} from './scenePresentation'

export type EventRevealedVisualEvent = Extract<
  VisualEvent,
  { type: 'eventRevealed' }
>

export type LootChangedVisualEvent = Extract<
  VisualEvent,
  { type: 'lootChanged' }
>

type EventOverlayProps = {
  event: EventRevealedVisualEvent
  lootChanges?: readonly LootChangedVisualEvent[]
}

const EVENT_ICONS = {
  combat: Swords,
  danger: TriangleAlert,
  reward: Sparkles,
  recovery: HeartPulse,
  discovery: MapPinned,
  safe: ShieldCheck,
  event: MapPinned,
} as const satisfies Record<EventPresentationTone, typeof MapPinned>

function resourceResultLabel(resource: ResourceType, amount: number): string {
  return `${formatSignedAmount(amount)} ${RESOURCE_LABELS[resource]}`
}

export function EventOverlay({ event, lootChanges = [] }: EventOverlayProps) {
  const tone = selectPrimaryEventTag(event.tags)
  const Icon = EVENT_ICONS[tone]

  return (
    <div
      className="event-overlay"
      data-event-id={event.sourceEventId ?? 'unknown'}
      data-event-tone={tone}
      data-testid="expedition-event-overlay"
    >
      <div className="event-overlay__beam" aria-hidden="true" />
      <div className="event-card">
        <div className="event-card__meta">
          <span className="event-card__kind">
            <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
            {tone === 'event' ? '远征事件' : EVENT_TAG_LABELS[tone]}
          </span>
          {event.tags.length > 1 ? (
            <span className="event-card__tags" aria-label="事件标签">
              {event.tags.map((tag) => (
                <span key={tag}>{EVENT_TAG_LABELS[tag]}</span>
              ))}
            </span>
          ) : null}
        </div>
        <h3>{event.title}</h3>
        <p>{event.text}</p>
        {lootChanges.length > 0 ? (
          <div className="event-card__results" aria-label="事件收获">
            {lootChanges.map((change) => (
              <FloatingResult
                key={change.id}
                tone={change.amount >= 0 ? 'reward' : 'damage'}
              >
                {resourceResultLabel(change.resource, change.amount)}
              </FloatingResult>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
