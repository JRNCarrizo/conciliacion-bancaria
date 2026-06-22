export const COMPARE_TABLE_COL_COUNT = 12

/** Índice de columna «Ref. / desc.» banco; el handle redimensiona contra la fecha empresa. */
export const COMPARE_COL_BANK_DESC = 4
/** Índice de columna «Ref. / desc.» empresa; el handle redimensiona contra Δ. */
export const COMPARE_COL_COMPANY_DESC = 7

const MIN_BY_COL: Partial<Record<number, number>> = {
  [COMPARE_COL_BANK_DESC]: 72,
  [COMPARE_COL_COMPANY_DESC]: 72,
}

function storageKey(sessionId: number): string {
  return `conciliacion:compare-col-widths:${sessionId}`
}

export function loadCompareColumnWidths(sessionId: number): number[] | null {
  try {
    const raw = sessionStorage.getItem(storageKey(sessionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length !== COMPARE_TABLE_COL_COUNT) return null
    if (!parsed.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) return null
    return parsed as number[]
  } catch {
    return null
  }
}

export function saveCompareColumnWidths(sessionId: number, widths: number[]): void {
  try {
    sessionStorage.setItem(storageKey(sessionId), JSON.stringify(widths))
  } catch {
    /* quota / private mode */
  }
}

/** Mide 12 columnas lógicas a partir de la primera fila del tbody (respeta colSpan). */
export function measureCompareTableColumnWidths(table: HTMLTableElement): number[] | null {
  for (const tr of table.querySelectorAll('tbody tr')) {
    const widths: number[] = []
    for (const td of tr.querySelectorAll(':scope > td')) {
      const cell = td as HTMLTableCellElement
      const span = cell.colSpan > 0 ? cell.colSpan : 1
      const wEach = cell.getBoundingClientRect().width / span
      for (let i = 0; i < span; i += 1) {
        widths.push(Math.round(wEach * 10) / 10)
      }
    }
    if (widths.length === COMPARE_TABLE_COL_COUNT) return widths
  }
  return null
}

/** Solo cambia el ancho de la columna arrastrada; el resto conserva sus medidas (scroll horizontal si hace falta). */
export function resizeCompareColumn(
  widths: readonly number[],
  colIndex: number,
  deltaPx: number,
): number[] | null {
  const minCol = MIN_BY_COL[colIndex] ?? 48
  const start = widths[colIndex]
  const nextCol = Math.max(minCol, start + deltaPx)
  if (Math.abs(nextCol - start) < 0.5) return null
  const next = [...widths]
  next[colIndex] = Math.round(nextCol * 10) / 10
  return next
}

export function compareTableTotalWidth(widths: readonly number[]): number {
  return Math.round(widths.reduce((sum, w) => sum + w, 0))
}

/** Posición del borde derecho de la columna `colIndex` desde el borde izquierdo de la tabla. */
export function compareColumnRightEdgePx(widths: readonly number[], colIndex: number): number {
  return widths.slice(0, colIndex + 1).reduce((sum, w) => sum + w, 0)
}

export function beginCompareColumnResize(
  startWidths: number[],
  leftCol: number,
  startClientX: number,
  onChange: (next: number[]) => void,
  onEnd?: (finalWidths: number[]) => void,
): () => void {
  const body = document.body
  body.classList.add('compare-col-resize-active')
  let latest = startWidths

  function onMove(ev: PointerEvent) {
    const delta = ev.clientX - startClientX
    const next = resizeCompareColumn(startWidths, leftCol, delta)
    if (next) {
      latest = next
      onChange(next)
    }
  }

  function onUp() {
    body.classList.remove('compare-col-resize-active')
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    onEnd?.(latest)
  }

  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)

  return onUp
}
