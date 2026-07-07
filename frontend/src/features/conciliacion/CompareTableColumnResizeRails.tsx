import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react'
import {
  COMPARE_COL_BANK_DESC,
  COMPARE_COL_COMPANY_DESC,
  compareColumnRightEdgePx,
  measureCompareSplitColumnEdges,
} from './utils/compareTableColumns'
import { CompareColResizeHandle } from './CompareColResizeHandle'

export function CompareTableColumnResizeRails({
  tableRef,
  innerRef,
  widths,
  onResizeStart,
}: {
  tableRef: RefObject<HTMLTableElement | null>
  innerRef: RefObject<HTMLDivElement | null>
  widths: readonly number[]
  onResizeStart: (colIndex: number, ev: PointerEvent<HTMLSpanElement>) => void
}) {
  const fallbackBank = compareColumnRightEdgePx(widths, COMPARE_COL_BANK_DESC)
  const fallbackCompany = compareColumnRightEdgePx(widths, COMPARE_COL_COMPANY_DESC)
  const [edges, setEdges] = useState({ bank: fallbackBank, company: fallbackCompany })

  const syncEdges = useCallback(() => {
    const table = tableRef.current
    const inner = innerRef.current
    if (table && inner) {
      const measured = measureCompareSplitColumnEdges(table, inner)
      if (measured) {
        setEdges(measured)
        return
      }
    }
    setEdges({
      bank: compareColumnRightEdgePx(widths, COMPARE_COL_BANK_DESC),
      company: compareColumnRightEdgePx(widths, COMPARE_COL_COMPANY_DESC),
    })
  }, [innerRef, tableRef, widths])

  useLayoutEffect(() => {
    syncEdges()
  }, [syncEdges])

  useEffect(() => {
    const table = tableRef.current
    const inner = innerRef.current
    const wrap = table?.closest<HTMLElement>('.compare-table-wrap')
    if (!wrap) return

    const ro = new ResizeObserver(() => syncEdges())
    ro.observe(wrap)
    if (inner) ro.observe(inner)
    if (table) ro.observe(table)

    wrap.addEventListener('scroll', syncEdges, { passive: true })
    window.addEventListener('resize', syncEdges)

    return () => {
      ro.disconnect()
      wrap.removeEventListener('scroll', syncEdges)
      window.removeEventListener('resize', syncEdges)
    }
  }, [innerRef, syncEdges, tableRef])

  return (
    <div className="compare-col-resize-rails">
      <CompareColResizeHandle
        leftPx={edges.bank}
        label="Arrastrá para ensanchar el detalle de banco"
        onPointerDown={(ev) => onResizeStart(COMPARE_COL_BANK_DESC, ev)}
      />
      <CompareColResizeHandle
        leftPx={edges.company}
        label="Arrastrá para ensanchar el detalle de empresa"
        onPointerDown={(ev) => onResizeStart(COMPARE_COL_COMPANY_DESC, ev)}
      />
    </div>
  )
}
