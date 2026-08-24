import { CornerDownLeft, MapPin, Timer, Users } from 'lucide-react'
import type { ExpeditionState, HeroState } from '../core'
import { POLICY_LABELS, formatCountdown } from '../app/presentation'

type ActiveExpeditionProps = {
  expedition: ExpeditionState
  heroes: readonly HeroState[]
  now: number
  regionName: string
  onRetreat: () => void
}

const LOOT_LABELS = {
  wood: '木材',
  coins: '金币',
  food: '食物',
  medicine: '药品',
} as const

export function ActiveExpedition({
  expedition,
  heroes,
  now,
  regionName,
  onRetreat,
}: ActiveExpeditionProps) {
  const party = expedition.partyHeroIds
    .map((id) => heroes.find((hero) => hero.id === id))
    .filter((hero): hero is HeroState => hero !== undefined)
  const progress =
    (expedition.processedEventCount / expedition.maxEventCount) * 100

  return (
    <section className="workspace-section active-expedition" aria-labelledby="active-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow live-label">远征进行中</span>
          <h2 id="active-title">黑杉林小队</h2>
        </div>
        <span className="section-index">01</span>
      </div>

      <div className="expedition-status-grid">
        <div>
          <MapPin size={18} aria-hidden="true" />
          <span>区域</span>
          <strong>{regionName}</strong>
        </div>
        <div>
          <Users size={18} aria-hidden="true" />
          <span>队伍</span>
          <strong>{party.map((hero) => hero.name).join(' · ')}</strong>
        </div>
        <div>
          <Timer size={18} aria-hidden="true" />
          <span>下一事件</span>
          <strong className="tabular">
            {formatCountdown(expedition.nextEventAt - now)}
          </strong>
        </div>
      </div>

      <div className="progress-block">
        <div>
          <span>行程进度</span>
          <strong className="tabular">
            {expedition.processedEventCount}/{expedition.maxEventCount}
          </strong>
        </div>
        <div
          className="progress-track"
          aria-label={`已完成 ${expedition.processedEventCount} / ${expedition.maxEventCount}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={expedition.maxEventCount}
          aria-valuenow={expedition.processedEventCount}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <p>行动方针：{POLICY_LABELS[expedition.policy]}</p>
      </div>

      <div className="loot-manifest">
        <span className="loot-manifest__title">携带战利品</span>
        <div>
          {Object.entries(expedition.carriedLoot).map(([key, value]) => (
            <span key={key}>
              {LOOT_LABELS[key as keyof typeof LOOT_LABELS]}
              <strong>{value}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="command-row">
        <p className="command-hint">撤退会立即结算当前携带的战利品。</p>
        <button className="button button--danger" onClick={onRetreat} type="button">
          <CornerDownLeft size={17} aria-hidden="true" />
          手动撤退
        </button>
      </div>
    </section>
  )
}
