import { Clock3, X } from 'lucide-react'
import type { HeroState, Resources } from '../../core'
import type { VisualEvent } from '../../presentation/visual-events'
import {
  RESOURCE_LABELS,
  formatSignedAmount,
} from './scenePresentation'

export type ProgressSummaryVisualEvent = Extract<
  VisualEvent,
  { type: 'progressSummary' }
>

type OfflineSummaryProps = {
  summary: ProgressSummaryVisualEvent
  heroes?: readonly Pick<HeroState, 'id' | 'name'>[]
  onDismiss: () => void
}

const SUMMARY_TITLES: Readonly<
  Record<ProgressSummaryVisualEvent['summaryKind'], string>
> = {
  offline: '离线进展',
  import: '导入进展',
  background: '后台进展',
  batch: '远征进展',
  queueOverflow: '远征进展',
}

function summaryResourceEntries(resourceDeltas: Readonly<Resources>) {
  return (Object.keys(RESOURCE_LABELS) as Array<keyof Resources>).filter(
    (resource) => resourceDeltas[resource] !== 0,
  )
}

export function OfflineSummary({
  summary,
  heroes = [],
  onDismiss,
}: OfflineSummaryProps) {
  const resources = summaryResourceEntries(summary.resourceDeltas)
  const healthChanges = Object.entries(summary.heroHealthDeltas).filter(
    ([, amount]) => amount !== 0,
  )

  return (
    <aside
      aria-labelledby={`${summary.id}-title`}
      className="transition-summary transition-summary--offline"
      data-summary-kind={summary.summaryKind}
      data-testid={
        summary.summaryKind === 'batch' ||
        summary.summaryKind === 'queueOverflow'
          ? 'progress-summary'
          : 'offline-summary'
      }
    >
      <div className="transition-summary__icon" aria-hidden="true">
        <Clock3 size={20} strokeWidth={1.8} />
      </div>
      <div className="transition-summary__content">
        <span className="transition-summary__eyebrow">返回驿站</span>
        <h2 id={`${summary.id}-title`}>
          {SUMMARY_TITLES[summary.summaryKind]}
        </h2>
        <div className="transition-summary__facts">
          {summary.eventCount > 0 ? (
            <strong>处理了 {summary.eventCount} 个事件</strong>
          ) : null}
          {summary.completedExpeditions > 0 ? (
            <strong>完成远征 {summary.completedExpeditions} 次</strong>
          ) : null}
        </div>
        {resources.length > 0 || healthChanges.length > 0 ? (
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
          </dl>
        ) : null}
      </div>
      <button
        aria-label="关闭进展摘要"
        className="transition-summary__dismiss"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" size={18} />
      </button>
    </aside>
  )
}
