import { useId } from 'react'
import type { MotionPreference } from '../../presentation/motion'
import { useMotionPreferences } from '../../presentation/motion'

const MOTION_OPTIONS: ReadonlyArray<{
  value: MotionPreference
  label: string
}> = [
  { value: 'system', label: '跟随系统' },
  { value: 'full', label: '完整' },
  { value: 'reduced', label: '简化' },
  { value: 'off', label: '关闭' },
]

export function MotionPreferenceControl() {
  const { preference, setPreference } = useMotionPreferences()
  const groupId = useId()

  return (
    <fieldset className="motion-preference-control">
      <legend>动画效果</legend>
      <div className="motion-preference-control__options">
        {MOTION_OPTIONS.map((option) => {
          const optionId = `${groupId}-${option.value}`
          return (
            <label
              className="motion-preference-control__option"
              htmlFor={optionId}
              key={option.value}
            >
              <input
                checked={preference === option.value}
                id={optionId}
                name={groupId}
                onChange={() => {
                  setPreference(option.value)
                }}
                type="radio"
                value={option.value}
              />
              <span>{option.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
