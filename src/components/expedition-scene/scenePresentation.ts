import type { EventTag, ResourceType } from '../../core'
import {
  VISUAL_EVENT_TAG_PRIORITY,
  getPrimaryVisualEventTag,
} from '../../presentation/visual-events'

export const EVENT_TAG_PRIORITY = VISUAL_EVENT_TAG_PRIORITY

export const EVENT_TAG_LABELS: Readonly<Record<EventTag, string>> = {
  combat: '交战',
  danger: '危险',
  reward: '收获',
  recovery: '恢复',
  discovery: '发现',
  safe: '安全',
}

export const RESOURCE_LABELS: Readonly<Record<ResourceType, string>> = {
  wood: '木材',
  coins: '金币',
  food: '食物',
  medicine: '药品',
}

export type EventPresentationTone = EventTag | 'event'

export function selectPrimaryEventTag(
  tags: readonly EventTag[],
): EventPresentationTone {
  return tags.length === 0 ? 'event' : getPrimaryVisualEventTag(tags)
}

export function formatSignedAmount(amount: number): string {
  return amount > 0 ? `+${amount}` : `${amount}`
}
