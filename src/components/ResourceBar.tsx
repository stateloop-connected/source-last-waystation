import {
  Coins,
  HeartPulse,
  Trees,
  Wheat,
  type LucideIcon,
} from 'lucide-react'
import type { Resources } from '../core'

type ResourceBarProps = {
  resources: Resources
}

const RESOURCE_ITEMS: readonly {
  key: keyof Resources
  label: string
  icon: LucideIcon
}[] = [
  { key: 'food', label: '食物', icon: Wheat },
  { key: 'medicine', label: '药品', icon: HeartPulse },
  { key: 'wood', label: '木材', icon: Trees },
  { key: 'coins', label: '金币', icon: Coins },
]

export function ResourceBar({ resources }: ResourceBarProps) {
  return (
    <section className="resource-bar" aria-label="驿站资源">
      <div className="resource-bar__inner">
        {RESOURCE_ITEMS.map(({ key, label, icon: Icon }) => (
          <div className="resource" key={key}>
            <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
            <span className="resource__label">{label}</span>
            <strong className="resource__value">{resources[key]}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
