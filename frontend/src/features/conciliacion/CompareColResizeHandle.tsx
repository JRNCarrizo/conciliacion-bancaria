import type { CSSProperties, PointerEvent } from 'react'

export function CompareColResizeHandle({
  leftPx,
  label,
  onPointerDown,
}: {
  leftPx: number
  label: string
  onPointerDown: (ev: PointerEvent<HTMLSpanElement>) => void
}) {
  const style: CSSProperties = { left: `${leftPx}px` }

  return (
    <span
      className="compare-col-resize-handle"
      style={style}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      onPointerDown={(ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        onPointerDown(ev)
      }}
    >
      <span className="compare-col-resize-grip" aria-hidden>
        <span className="compare-col-resize-grip-dots" />
      </span>
    </span>
  )
}
