import { Clock3, Hammer, TowerControl } from 'lucide-react'

type StationPanelProps = {
  level: number
  maxLevel: number
  nextCost: number | null
  offlineHours: number
  disabledReason: string | null
  onUpgrade: () => void
}

export function StationPanel({
  level,
  maxLevel,
  nextCost,
  offlineHours,
  disabledReason,
  onUpgrade,
}: StationPanelProps) {
  return (
    <section className="station-section" aria-labelledby="station-title">
      <div className="station-section__identity">
        <TowerControl size={24} aria-hidden="true" />
        <div>
          <span className="eyebrow">驿站建设</span>
          <h2 id="station-title">瞭望塔</h2>
        </div>
      </div>

      <div className="level-meter" aria-label={`瞭望塔等级 ${level} / ${maxLevel}`}>
        {Array.from({ length: maxLevel + 1 }, (_, index) => (
          <span data-active={index <= level} key={index}>
            {index}
          </span>
        ))}
      </div>

      <div className="station-stat">
        <Clock3 size={17} aria-hidden="true" />
        <span>离线结算上限</span>
        <strong>{offlineHours} 小时</strong>
      </div>

      <div className="station-upgrade">
        <span>
          {nextCost === null ? '已完成全部升级' : `下一级需要 ${nextCost} 木材`}
        </span>
        <button
          className="button button--secondary"
          disabled={disabledReason !== null}
          onClick={onUpgrade}
          type="button"
          title={disabledReason ?? '升级瞭望塔'}
        >
          <Hammer size={17} aria-hidden="true" />
          升级
        </button>
        {disabledReason !== null ? (
          <small className="disabled-reason">{disabledReason}</small>
        ) : null}
      </div>
    </section>
  )
}
