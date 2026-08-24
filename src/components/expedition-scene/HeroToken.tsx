import { useId } from 'react'
import type { HeroState } from '../../core'
import type { VisualEvent } from '../../presentation/visual-events'
import { FloatingResult } from './FloatingResult'
import { formatSignedAmount } from './scenePresentation'

export type HeroFeedbackVisualEvent = Extract<
  VisualEvent,
  { type: 'heroDamaged' | 'heroHealed' }
>

type HeroTokenProps = {
  hero: HeroState
  partyIndex: number
  feedback?: HeroFeedbackVisualEvent | undefined
}

const HERO_ROLE_LABELS = {
  vanguard: '先锋',
  scout: '斥候',
  medic: '药师',
} as const

export function HeroToken({ hero, partyIndex, feedback }: HeroTokenProps) {
  const tooltipId = useId()
  const healthRatio = Math.max(
    0,
    Math.min(100, (hero.health / hero.maxHealth) * 100),
  )
  const feedbackTone =
    feedback?.type === 'heroDamaged'
      ? 'damage'
      : feedback?.type === 'heroHealed'
        ? 'healing'
        : 'none'
  const partyMark = partyIndex === 0 ? 'I' : 'II'

  return (
    <div
      aria-describedby={tooltipId}
      aria-label={`${hero.name}，${HERO_ROLE_LABELS[hero.role]}，生命 ${hero.health} / ${hero.maxHealth}`}
      className="hero-token"
      data-feedback={feedbackTone}
      data-hero-id={hero.id}
      data-party-index={partyIndex}
      data-testid={`expedition-hero-${hero.id}`}
      tabIndex={0}
    >
      <div className="hero-token__animated" key={feedback?.id ?? 'steady'}>
        <span className="hero-token__party-mark" aria-hidden="true">
          {partyMark}
        </span>
        <span className="hero-token__badge" aria-hidden="true">
          {hero.name.slice(0, 1)}
        </span>
        <span className="hero-token__health" aria-hidden="true">
          <span style={{ transform: `scaleX(${healthRatio / 100})` }} />
        </span>
        {feedback ? (
          <FloatingResult
            tone={feedback.type === 'heroDamaged' ? 'damage' : 'healing'}
          >
            {feedback.type === 'heroDamaged'
              ? `-${feedback.amount}`
              : formatSignedAmount(feedback.amount)}
          </FloatingResult>
        ) : null}
      </div>
      <span className="hero-token__tooltip" id={tooltipId} role="tooltip">
        <strong>{hero.name}</strong>
        <span>{HERO_ROLE_LABELS[hero.role]}</span>
        <span className="tabular">
          生命 {hero.health}/{hero.maxHealth}
        </span>
      </span>
    </div>
  )
}
