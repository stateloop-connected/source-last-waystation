import { FastForward, PackagePlus, Wrench } from 'lucide-react'

type DeveloperToolsProps = {
  onAdvance: (milliseconds: number) => void
  onAddWood: () => void
}

export function DeveloperTools({ onAdvance, onAddWood }: DeveloperToolsProps) {
  return (
    <section className="developer-tools" aria-label="开发调试工具">
      <span>
        <Wrench size={15} aria-hidden="true" /> 调试
      </span>
      <button onClick={() => onAdvance(15_000)} type="button">
        <FastForward size={15} aria-hidden="true" /> 推进 15 秒
      </button>
      <button onClick={() => onAdvance(90_000)} type="button">
        <FastForward size={15} aria-hidden="true" /> 推进 90 秒
      </button>
      <button onClick={onAddWood} type="button">
        <PackagePlus size={15} aria-hidden="true" /> 补充 20 木材
      </button>
    </section>
  )
}
