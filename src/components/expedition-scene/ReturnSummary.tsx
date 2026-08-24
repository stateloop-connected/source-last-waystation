import { Flag, X } from 'lucide-react'
import type { HeroState, Resources } from '../../core'
import type { VisualEvent } from '../../presentation/visual-events'
import {
  RESOURCE_LABELS,
  formatSignedAmount,
} from './scenePresentation'

export type ExpeditionReturnedVisualEvent = Extract<
  VisualEvent,
  { type: 'expeditionReturned' }
>

type ReturnSummaryProps = {
  summary: ExpeditionReturnedVisualEvent
  heroes: readonly Pick<HeroState, 'id' | 'name'>[]
  onDismiss: () => void
}

function nonZeroResources(resourceDeltas: Readonly<Resources>) {
  return (Object.keys(RESOURCE_LABELS) as Array<keyof Resources>).filter(
    (resource) => resourceDeltas[resource] !== 0,
  )
}

export function ReturnSummary({
  summary,
  heroes,
  onDismiss,
}: ReturnSummaryProps) {
  const resources = nonZeroResources(summary.resourceDeltas)
  const healthChanges = Object.entries(summary.heroHealthDeltas).filter(
    ([, amount]) => amount !== 0,
  )

  return (
    <aside
      aria-labelledby={`${summary.id}-title`}
      className="transition-summary transition-summary--return"
      data-testid="return-summary"
    >
      <div className="transition-summary__icon" aria-hidden="true">
        <Flag size={20} strokeWidth={1.8} />
      </div>
      <div className="transition-summary__content">
        <span className="transition-summary__eyebrow">队伍已返回驿站</span>
        <h2 id={`${summary.id}-title`}>远征完成</h2>
        <p>本次处理 {summary.processedEventCount} 个事件</p>
        <dl className="transition-summary__deltas">
          {resources.map((resource) => (
            <div key={resource}>
              <dt>{RESOURCE_LABELS[resource]}</dt>
              <dd className="tabular">
                {formatSignedAmount(summary.resourceDeltas[resource])}
              </dd>
            </div>
          ))}
          {healthChanges.map(([heroId, amount]) => (
            <div key={heroId}>
              <dt>
                {heroes.find((hero) => hero.id === heroId)?.name ?? '队员'}生命
              </dt>
              <dd className="tabular">{formatSignedAmount(amount)}</dd>
            </div>
          ))}
          {resources.length === 0 && healthChanges.length === 0 ? (
            <div>
              <dt>本次结算</dt>
              <dd>无额外变化</dd>
            </div>
          ) : null}
        </dl>
      </div>
      <button
        aria-label="关闭返程摘要"
        className="transition-summary__dismiss"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" size={18} />
      </button>
    </aside>
  )
}
