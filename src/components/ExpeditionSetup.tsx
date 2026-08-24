import { ArrowRight, MapPin } from 'lucide-react'
import forestScene from '../assets/black-fir-forest.svg'
import type {
  ExpeditionPolicy,
  ExpeditionPolicyDefinition,
  HeroState,
  RegionDefinition,
} from '../core'
import { HeroSelection } from './HeroSelection'

type ExpeditionSetupProps = {
  heroes: readonly HeroState[]
  policies: readonly ExpeditionPolicyDefinition[]
  region: RegionDefinition
  selectedIds: readonly string[]
  selectedPolicy: ExpeditionPolicy
  disabledReason: string | null
  onPolicyChange: (policy: ExpeditionPolicy) => void
  onStart: () => void
  onToggleHero: (heroId: string) => void
}

export function ExpeditionSetup({
  heroes,
  policies,
  region,
  selectedIds,
  selectedPolicy,
  disabledReason,
  onPolicyChange,
  onStart,
  onToggleHero,
}: ExpeditionSetupProps) {
  return (
    <section className="workspace-section" aria-labelledby="expedition-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">远征准备</span>
          <h2 id="expedition-title">编组探索队</h2>
        </div>
        <span className="section-index">01</span>
      </div>

      <HeroSelection
        heroes={heroes}
        selectedIds={selectedIds}
        onToggle={onToggleHero}
      />

      <fieldset className="policy-fieldset">
        <legend>行动方针</legend>
        <div className="segmented-control">
          {policies.map((policy) => (
            <label key={policy.id}>
              <input
                checked={selectedPolicy === policy.id}
                name="expedition-policy"
                onChange={() => onPolicyChange(policy.id)}
                type="radio"
                value={policy.id}
              />
              <span>
                <strong>{policy.name}</strong>
                <small>{policy.description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="region-panel">
        <img src={forestScene} alt="雾气笼罩的黑杉林与边境瞭望塔" />
        <div className="region-panel__shade" aria-hidden="true" />
        <div className="region-panel__content">
          <span className="region-panel__location">
            <MapPin size={15} aria-hidden="true" /> 边境以北 · 唯一开放区域
          </span>
          <h3>{region.name}</h3>
          <p>{region.description}</p>
          <span className="region-panel__meta">
            {region.maxEventCount} 段行程 · 每 {region.eventIntervalMs / 1000} 秒推进
          </span>
        </div>
      </div>

      <div className="command-row">
        <p className="command-hint" role="status">
          {disabledReason ?? '队伍已就绪，将消耗 2 份食物。'}
        </p>
        <button
          className="button button--primary"
          disabled={disabledReason !== null}
          onClick={onStart}
          type="button"
        >
          派遣远征
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
