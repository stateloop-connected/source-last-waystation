import type { CSSProperties } from 'react'
import type { HeroState } from '../../core'
import type { VisualEvent } from '../../presentation/visual-events'
import { HeroToken, type HeroFeedbackVisualEvent } from './HeroToken'

type ExpeditionRouteProps = {
  processedEventCount: number
  maxEventCount: number
  heroes: readonly HeroState[]
  visualEvents?: readonly VisualEvent[]
}

type RouteStyle = CSSProperties & {
  '--route-position': string
  '--route-point-count': number
  '--route-progress': number
}

function latestHeroFeedback(
  events: readonly VisualEvent[],
): ReadonlyMap<string, HeroFeedbackVisualEvent> {
  const feedback = new Map<string, HeroFeedbackVisualEvent>()

  for (const event of events) {
    if (event.type === 'heroDamaged' || event.type === 'heroHealed') {
      feedback.set(event.heroId, event)
    }
  }

  return feedback
}

export function ExpeditionRoute({
  processedEventCount,
  maxEventCount,
  heroes,
  visualEvents = [],
}: ExpeditionRouteProps) {
  const total = Math.max(1, maxEventCount)
  const completed = Math.min(Math.max(0, processedEventCount), total)
  const progress = completed / total
  const nodes = Array.from({ length: total }, (_, index) => index + 1)
  const feedbackByHeroId = latestHeroFeedback(visualEvents)
  const routeStyle: RouteStyle = {
    '--route-position': `${progress * 100}%`,
    '--route-point-count': total + 1,
    '--route-progress': progress,
  }
  const routeEdge =
    completed === 0 ? 'start' : completed === total ? 'end' : 'middle'

  return (
    <div
      className="expedition-route"
      data-testid="expedition-route"
      style={routeStyle}
    >
      <div
        aria-label={`行程进度：已完成 ${completed} / ${total} 个事件`}
        aria-valuemax={total}
        aria-valuemin={0}
        aria-valuenow={completed}
        className="expedition-route__heading"
        role="progressbar"
      >
        <span>深林路线</span>
        <strong className="tabular">
          {completed}/{total}
        </strong>
      </div>

      <div className="expedition-route__track">
        <span className="expedition-route__line" aria-hidden="true">
          <span />
        </span>
        <ol className="expedition-route__nodes" aria-hidden="true">
          <li
            className="expedition-route__start"
            data-current={completed === 0}
            data-testid="expedition-route-start"
          >
            <span>{completed === 0 ? '当前' : '起点'}</span>
          </li>
          {nodes.map((sequence) => {
            const isComplete = sequence <= completed
            const isCurrent = sequence === completed

            return (
              <li
                className="expedition-route__node"
                data-complete={isComplete}
                data-current={isCurrent}
                data-testid="expedition-route-node"
                key={sequence}
              >
                <span className="expedition-route__node-mark">
                  <span>{isComplete ? '✓' : sequence}</span>
                </span>
                {isCurrent && completed > 0 ? (
                  <span className="expedition-route__current-label">当前</span>
                ) : null}
              </li>
            )
          })}
        </ol>

        <div
          aria-label="远征小队"
          className="expedition-route__party"
          data-route-edge={routeEdge}
        >
          {heroes.slice(0, 2).map((hero, index) => (
            <HeroToken
              feedback={feedbackByHeroId.get(hero.id)}
              hero={hero}
              key={hero.id}
              partyIndex={index}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
