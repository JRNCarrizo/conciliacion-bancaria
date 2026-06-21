function headerOffsetPx(wrap: HTMLElement): number {
  const thead = wrap.querySelector('thead')
  return thead instanceof HTMLElement ? thead.getBoundingClientRect().height : 32
}

function wrapScrollInsets(wrap: HTMLElement): { top: number; bottom: number } {
  const style = getComputedStyle(wrap)
  const padTop = Number.parseFloat(style.paddingTop) || 0
  const padBottom = Number.parseFloat(style.paddingBottom) || 0
  const scrollPadTop = Number.parseFloat(style.scrollPaddingTop) || 0
  const scrollPadBottom = Number.parseFloat(style.scrollPaddingBottom) || 0
  return {
    top: Math.max(padTop, scrollPadTop),
    bottom: Math.max(padBottom, scrollPadBottom, 6),
  }
}

/** Desplaza la fila dentro del contenedor sin que quede tapada por el thead sticky. */
export function scrollTableRowIntoView(wrap: HTMLElement, row: HTMLElement): void {
  const edgePad = 4

  const scrollRow = () => {
    const headerOffset = headerOffsetPx(wrap)
    const insets = wrapScrollInsets(wrap)
    const wrapRect = wrap.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()

    const topBound = wrapRect.top + headerOffset + insets.top + edgePad
    const bottomBound = wrapRect.bottom - insets.bottom - edgePad
    const visibleBody = bottomBound - topBound

    if (visibleBody <= 0) return

    if (rowRect.height > visibleBody) {
      wrap.scrollTop += rowRect.top - topBound
      return
    }

    if (rowRect.bottom > bottomBound) {
      wrap.scrollTop += rowRect.bottom - bottomBound
    }

    const rowRectAfter = row.getBoundingClientRect()
    const wrapRectAfter = wrap.getBoundingClientRect()
    const topBoundAfter =
      wrapRectAfter.top + headerOffsetPx(wrap) + wrapScrollInsets(wrap).top + edgePad

    if (rowRectAfter.top < topBoundAfter) {
      wrap.scrollTop += rowRectAfter.top - topBoundAfter
    }
  }

  scrollRow()
  requestAnimationFrame(() => {
    scrollRow()
    requestAnimationFrame(scrollRow)
  })
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable="true"]') != null
  )
}

export function isEnterKey(ev: KeyboardEvent): boolean {
  return ev.key === 'Enter' || ev.code === 'NumpadEnter'
}
