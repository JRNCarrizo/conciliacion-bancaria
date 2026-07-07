function headerOffsetPx(container: HTMLElement): number {
  const thead = container.querySelector('thead')
  return thead instanceof HTMLElement ? thead.getBoundingClientRect().height : 0
}

function wrapPaddingBottom(container: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(container).paddingBottom) || 0
}

function rowScrollMargins(row: HTMLElement): { top: number; bottom: number } {
  const style = getComputedStyle(row)
  return {
    top: Number.parseFloat(style.scrollMarginTop) || 0,
    bottom: Number.parseFloat(style.scrollMarginBottom) || 0,
  }
}

function viewportVerticalInsets(): { top: number; bottom: number } {
  const bottomPad = 20
  let topPad = 12
  const navbar = document.querySelector('.app-navbar')
  if (navbar instanceof HTMLElement) {
    const navRect = navbar.getBoundingClientRect()
    if (navRect.bottom > 0) {
      topPad = Math.max(topPad, navRect.bottom + 8)
    }
  }
  return { top: topPad, bottom: window.innerHeight - bottomPad }
}

function visibleBandInViewport(
  containerRect: DOMRect,
  stickyHeaderPx: number,
  padBottom: number,
  edgePad: number,
): { top: number; bottom: number } | null {
  const { top: viewTop, bottom: viewBottom } = viewportVerticalInsets()
  const containerTop = containerRect.top + stickyHeaderPx + edgePad
  const containerBottom = containerRect.bottom - padBottom - edgePad

  const top = Math.max(containerTop, viewTop)
  const bottom = Math.min(containerBottom, viewBottom)
  if (bottom <= top) return null
  return { top, bottom }
}

function isScrollableY(el: HTMLElement): boolean {
  const style = getComputedStyle(el)
  const overflowY = style.overflowY
  if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') return false
  return el.scrollHeight > el.clientHeight + 1
}

function scrollableAncestors(from: HTMLElement): HTMLElement[] {
  const list: HTMLElement[] = []
  let el: HTMLElement | null = from.parentElement
  while (el && el !== document.documentElement) {
    if (isScrollableY(el)) list.push(el)
    el = el.parentElement
  }
  return list
}

function alignRowInScrollContainer(
  container: HTMLElement,
  row: HTMLElement,
  stickyHeaderPx: number,
): void {
  const edgePad = 2
  const padBottom = wrapPaddingBottom(container)
  const margins = rowScrollMargins(row)
  const containerRect = container.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  const band = visibleBandInViewport(containerRect, stickyHeaderPx, padBottom, edgePad)
  if (!band) return

  const rowTop = rowRect.top - margins.top
  const rowBottom = rowRect.bottom + margins.bottom
  const rowHeight = rowBottom - rowTop
  const viewport = band.bottom - band.top

  if (rowHeight > viewport) {
    container.scrollTop += rowTop - band.top
  } else if (rowTop < band.top) {
    container.scrollTop += rowTop - band.top
  } else if (rowBottom > band.bottom) {
    container.scrollTop += rowBottom - band.bottom
  }
}

function syncRowWithWindow(row: HTMLElement): void {
  const margins = rowScrollMargins(row)
  const rowRect = row.getBoundingClientRect()
  const rowTop = rowRect.top - margins.top
  const rowBottom = rowRect.bottom + margins.bottom
  const { top: viewTop, bottom: viewBottom } = viewportVerticalInsets()

  if (rowBottom > viewBottom) {
    window.scrollBy({ top: rowBottom - viewBottom, behavior: 'auto' })
  } else if (rowTop < viewTop) {
    window.scrollBy({ top: rowTop - viewTop, behavior: 'auto' })
  }
}

/**
 * Mantiene la fila visible dentro del contenedor scroll, contenedores padre y ventana.
 * Usa la intersección contenedor ∩ viewport para que, si el bloque no está del todo en pantalla,
 * empiece a “pasar” filas al llegar al borde visible.
 */
export function scrollTableRowIntoView(wrap: HTMLElement, row: HTMLElement): void {
  const alignAll = () => {
    alignRowInScrollContainer(wrap, row, headerOffsetPx(wrap))
    for (const ancestor of scrollableAncestors(wrap)) {
      const stickyHeader = headerOffsetPx(ancestor)
      alignRowInScrollContainer(ancestor, row, stickyHeader)
    }
    syncRowWithWindow(row)
  }

  const prevScrollBehavior = wrap.style.scrollBehavior
  wrap.style.scrollBehavior = 'auto'
  alignAll()
  requestAnimationFrame(() => {
    alignAll()
    wrap.style.scrollBehavior = prevScrollBehavior
  })
}

/**
 * Al expandir un grupo: alinea las estadísticas (chips) bajo el thead de la lista
 * y ajusta la ventana para mostrar desde ahí hasta el final del detalle.
 */
export function scrollRubroExpandedDetailIntoView(wrap: HTMLElement, detailRow: HTMLElement): void {
  const resolveAnchor = (): HTMLElement =>
    detailRow.querySelector<HTMLElement>('.rubro-group-detail-metrics') ??
    detailRow.querySelector<HTMLElement>('.rubro-group-detail-head') ??
    detailRow.querySelector<HTMLElement>('.rubro-detail-panel-head') ??
    detailRow

  const align = (smoothWindow: boolean) => {
    const anchor = resolveAnchor()
    const headerOffset = headerOffsetPx(wrap)
    const edgePad = 8
    const wrapRect = wrap.getBoundingClientRect()
    let anchorRect = anchor.getBoundingClientRect()

    const innerTop = wrapRect.top + headerOffset + edgePad
    wrap.scrollTop += anchorRect.top - innerTop

    anchorRect = anchor.getBoundingClientRect()
    const rowRect = detailRow.getBoundingClientRect()
    const { top: windowTopPad, bottom: viewBottom } = viewportVerticalInsets()
    const maxBlockInView = viewBottom - windowTopPad

    const blockTop = anchorRect.top
    const blockBottom = rowRect.bottom
    const blockHeight = blockBottom - blockTop

    let deltaY = 0
    if (blockTop < windowTopPad) {
      deltaY = blockTop - windowTopPad
    } else if (blockHeight <= maxBlockInView) {
      if (blockBottom > viewBottom) {
        deltaY = blockBottom - viewBottom
      } else if (blockTop > windowTopPad + 48) {
        deltaY = blockTop - windowTopPad
      }
    } else if (blockTop > windowTopPad + 8) {
      deltaY = blockTop - windowTopPad
    }

    if (deltaY !== 0) {
      window.scrollBy({ top: deltaY, behavior: smoothWindow ? 'smooth' : 'auto' })
    }
  }

  align(false)
  requestAnimationFrame(() => {
    align(false)
    requestAnimationFrame(() => align(true))
  })
}

export function scrollConciliacionWorkspaceToTop(): void {
  const workspace = document.querySelector('.conc-workspace')
  if (!(workspace instanceof HTMLElement)) {
    window.scrollTo({ top: 0, behavior: 'auto' })
    return
  }
  const { top: insetTop } = viewportVerticalInsets()
  const targetTop = workspace.getBoundingClientRect().top + window.scrollY - insetTop
  window.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' })
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
