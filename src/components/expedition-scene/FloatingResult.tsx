import type { ReactNode } from 'react'

export type FloatingResultTone = 'damage' | 'healing' | 'reward' | 'neutral'

type FloatingResultProps = {
  children: ReactNode
  tone: FloatingResultTone
  className?: string
}

export function FloatingResult({
  children,
  tone,
  className,
}: FloatingResultProps) {
  const classes = ['floating-result', className].filter(Boolean).join(' ')

  return (
    <span aria-hidden="true" className={classes} data-tone={tone}>
      {children}
    </span>
  )
}
