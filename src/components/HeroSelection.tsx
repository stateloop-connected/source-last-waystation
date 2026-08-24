import { Check, Heart, Shield, Sparkles, Telescope } from 'lucide-react'
import type { HeroState } from '../core'
import { HERO_ROLE_LABELS, HERO_STATUS_LABELS } from '../app/presentation'

type HeroSelectionProps = {
  heroes: readonly HeroState[]
  selectedIds: readonly string[]
  onToggle: (heroId: string) => void
}

export function HeroSelection({
  heroes,
  selectedIds,
  onToggle,
}: HeroSelectionProps) {
  return (
    <fieldset className="hero-selection">
      <legend>
        选择队员 <span>{selectedIds.length}/2</span>
      </legend>
      <div className="hero-grid">
        {heroes.map((hero) => {
          const isSelected = selectedIds.includes(hero.id)
          const isSelectionLocked = selectedIds.length >= 2 && !isSelected
          const isUnavailable = hero.status !== 'idle' || isSelectionLocked
          const healthPercent = Math.round((hero.health / hero.maxHealth) * 100)

          return (
            <label
              className="hero-card"
              data-selected={isSelected}
              data-unavailable={isUnavailable}
              key={hero.id}
            >
              <input
                checked={isSelected}
                disabled={isUnavailable}
                onChange={() => onToggle(hero.id)}
                type="checkbox"
              />
              <span className="hero-card__topline">
                <span>
                  <strong>{hero.name}</strong>
                  <small>{HERO_ROLE_LABELS[hero.role]}</small>
                </span>
                <span className="selection-mark" aria-hidden="true">
                  {isSelected ? <Check size={15} strokeWidth={2.4} /> : null}
                </span>
              </span>
              <span className="hero-card__health">
                <span>
                  <Heart size={14} aria-hidden="true" />
                  生命 {hero.health}/{hero.maxHealth}
                </span>
                <span>{healthPercent}%</span>
              </span>
              <span className="health-track" aria-hidden="true">
                <span style={{ width: `${healthPercent}%` }} />
              </span>
              <span className="hero-card__stats">
                <span aria-label={`力量 ${hero.power}`} title="力量">
                  <Shield size={14} aria-hidden="true" /> {hero.power}
                </span>
                <span aria-label={`洞察 ${hero.insight}`} title="洞察">
                  <Telescope size={14} aria-hidden="true" /> {hero.insight}
                </span>
                <span aria-label={`生存 ${hero.survival}`} title="生存">
                  <Sparkles size={14} aria-hidden="true" /> {hero.survival}
                </span>
              </span>
              <span className="hero-card__status">
                {isSelected
                  ? '已编入队伍'
                  : isSelectionLocked
                    ? '队伍已满'
                    : HERO_STATUS_LABELS[hero.status]}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
