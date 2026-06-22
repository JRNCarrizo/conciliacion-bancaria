import type { PointerEvent } from 'react'
import {
  COMPARE_COL_BANK_DESC,
  COMPARE_COL_COMPANY_DESC,
  compareColumnRightEdgePx,
} from './utils/compareTableColumns'
import { CompareColResizeHandle } from './CompareColResizeHandle'

export function CompareTableColumnResizeRails({
  widths,
  onResizeStart,
}: {
  widths: readonly number[]
  onResizeStart: (colIndex: number, ev: PointerEvent<HTMLSpanElement>) => void
}) {
  const bankEdge = compareColumnRightEdgePx(widths, COMPARE_COL_BANK_DESC)
  const companyEdge = compareColumnRightEdgePx(widths, COMPARE_COL_COMPANY_DESC)

  return (
    <div className="compare-col-resize-rails">
      <CompareColResizeHandle
        leftPx={bankEdge}
        label="Arrastrá para ensanchar el detalle de banco"
        onPointerDown={(ev) => onResizeStart(COMPARE_COL_BANK_DESC, ev)}
      />
      <CompareColResizeHandle
        leftPx={companyEdge}
        label="Arrastrá para ensanchar el detalle de empresa"
        onPointerDown={(ev) => onResizeStart(COMPARE_COL_COMPANY_DESC, ev)}
      />
    </div>
  )
}
