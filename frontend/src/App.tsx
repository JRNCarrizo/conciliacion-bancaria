import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

type ImportResult = {
  sessionId: number
  bankRows: number
  companyRows: number
  sourceBankFileName: string
  sourceCompanyFileName: string
}

type SessionSummary = {
  id: number
  createdAt: string
  sourceBankFileName: string | null
  sourceCompanyFileName: string | null
  status: string
  bankRowCount: number
  companyRowCount: number
  matchedPairs: number
}

type PageSessions = {
  content: SessionSummary[]
  totalElements: number
}

type MovimientoDto = {
  id: number
  txDate: string
  amount: number
  description: string | null
  reference: string | null
  pendingClassification?: string | null
  /** Solo empresa: haber − debe (libro). Banco: null. */
  accountingAmount?: number | null
}

type ParDto = {
  pairId: number
  matchSource: string
  bankTxId: number
  companyTxId: number
  bankAmount: number
  companyAmount: number
  bankDate: string
  companyDate: string
}

type ConciliacionStatsDto = {
  bankRowCount: number
  companyRowCount: number
  matchedPairs: number
  unmatchedBankCount: number
  unmatchedCompanyCount: number
  sumBank: number
  sumCompany: number
  differenceTotal: number
  sumReconciledBank: number
  sumReconciledCompany: number
  sumPendingBank: number
  sumPendingCompany: number
  pctRowsReconciledBank: number
  pctRowsReconciledCompany: number
  reconciledPairDelta: number
  pendingNetDifference: number
  pairAmountMismatch: boolean
  differenceDecompositionOk: boolean
  reconciliationStatus: string
  reconciliationStatusDetail: string
  differenceExplanation: string[]
  adjustedBalanceFromBank: number | null
  adjustedVsCompanyClosing: number | null
  closingBalancesForCrossCheck: boolean
  sumCompanyAccounting: number
  pairsExactAmountCount: number
  pairsWithAmountGapCount: number
  pairsOppositeSignCount: number
  auditCierreCuadrado: boolean
}

/** Solo los dos saldos finales para el panel de auditoría */
type SessionClosingInfo = {
  closingBankBalance: number | null
  closingCompanyBalance: number | null
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatPct(n: number): string {
  return `${n.toFixed(2)} %`
}

/** Fechas del API (YYYY-MM-DD) → día/mes/año para pantalla */
function formatDisplayDate(isoDate: string | null | undefined): string {
  if (isoDate == null || String(isoDate).trim() === '') return '—'
  const s = String(isoDate).trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) {
    const [, y, mo, d] = m
    return `${d}/${mo}/${y}`
  }
  return s
}

const STATUS_LABEL: Record<string, string> = {
  OK: 'Conciliación coherente',
  PENDING_DIFFERENCES: 'Diferencias pendientes',
  PAIR_AMOUNT_MISMATCH: 'Importes distintos en algún par',
  PAIR_SIGN_MISMATCH: 'Par con signos opuestos (no válido)',
  STRUCTURAL_ERROR: 'Inconsistencia en el desglose',
  BALANCE_CROSS_CHECK_FAIL: 'Saldos declarados no cierran',
}

function statusPanelClass(code: string): string {
  if (code === 'OK') return 'exec-status exec-status--ok'
  if (code === 'PENDING_DIFFERENCES') return 'exec-status exec-status--pending'
  return 'exec-status exec-status--err'
}

function AuditClosingPanel({
  stats,
  closing,
}: {
  stats: ConciliacionStatsDto
  closing: SessionClosingInfo
}) {
  const bank = closing.closingBankBalance
  const comp = closing.closingCompanyBalance
  const both = bank != null && comp != null

  if (!both) {
    return (
      <div className="audit-closing audit-closing--need-data">
        <h4 className="audit-closing-title">Auditoría de cierre</h4>
        <p className="audit-closing-text">
          Cargá <strong>saldo final banco</strong> y <strong>saldo final empresa</strong> en el formulario
          de abajo para validar el puente extracto ↔ libro y dejar el circuito listo para revisión
          externa.
        </p>
      </div>
    )
  }

  if (stats.auditCierreCuadrado) {
    return (
      <div className="audit-closing audit-closing--ok">
        <h4 className="audit-closing-title">Auditoría de cierre — conforme</h4>
        <p className="audit-closing-text">
          El saldo ajustado (final extracto + Σ pend. empresa − Σ pend. banco) coincide con el saldo
          final libro declarado, dentro de la tolerancia. Cierre trazable entre ambos saldos.
        </p>
      </div>
    )
  }

  return (
    <div className="audit-closing audit-closing--warn">
      <h4 className="audit-closing-title">Auditoría de cierre — revisar</h4>
      <p className="audit-closing-text">
        Diferencia entre saldo ajustado desde extracto y saldo final empresa:{' '}
        <strong className="audit-closing-diff">
          {formatAmount(stats.adjustedVsCompanyClosing ?? 0)}
        </strong>
      </p>
    </div>
  )
}

function ExecutiveSummaryPanel({
  stats,
  closing,
}: {
  stats: ConciliacionStatsDto
  closing: SessionClosingInfo
}) {
  const diff = stats.differenceTotal
  const diffNonZero = Math.abs(diff) >= 0.005
  const label = STATUS_LABEL[stats.reconciliationStatus] ?? stats.reconciliationStatus
  return (
    <div className="executive-summary">
      <h3 className="subsection-title executive-summary-title">Resumen ejecutivo</h3>
      <div className={statusPanelClass(stats.reconciliationStatus)} role="status">
        <strong>{label}</strong>
        <span className="exec-status-detail">{stats.reconciliationStatusDetail}</span>
      </div>
      <p className="hint executive-summary-lead">
        <strong>Conciliación</strong> usa importes alineados al extracto (debe−haber en plataforma). El{' '}
        <strong>neto contable</strong> (haber−debe) es solo referencia de libro y no entra en el
        matching. La diferencia total se descompone en Δ pares + efecto pendientes.
      </p>
      <dl className="exec-grid">
        <dt>Σ importes extracto (banco, control)</dt>
        <dd className="exec-num">{formatAmount(stats.sumBank)}</dd>
        <dt>Σ plataforma — conciliación (debe−haber, mismo criterio que extracto)</dt>
        <dd className="exec-num">{formatAmount(stats.sumCompany)}</dd>
        <dt>Σ plataforma — neto contable (haber−debe por línea, libro)</dt>
        <dd className="exec-num">{formatAmount(stats.sumCompanyAccounting)}</dd>
        <dt>Diferencia total (banco − empresa)</dt>
        <dd className={diffNonZero ? 'exec-num exec-num--warn' : 'exec-num'}>
          {formatAmount(diff)}
        </dd>
        <dt>Δ pares (Σ banco en pares − Σ empresa en pares)</dt>
        <dd className={stats.pairAmountMismatch ? 'exec-num exec-num--warn' : 'exec-num'}>
          {formatAmount(stats.reconciledPairDelta)}
        </dd>
        <dt>Efecto neto pendientes (Σ pend. banco − Σ pend. empresa)</dt>
        <dd className="exec-num">{formatAmount(stats.pendingNetDifference)}</dd>
        <dt>Pares: idénticos ±tol / con brecha / signo opuesto</dt>
        <dd>
          {stats.pairsExactAmountCount} / {stats.pairsWithAmountGapCount} /{' '}
          <span
            className={
              stats.pairsOppositeSignCount > 0 ? 'exec-num exec-num--warn' : undefined
            }
          >
            {stats.pairsOppositeSignCount}
          </span>
        </dd>
        <dt>Validación algebraica (Δ pares + efecto pend. = dif. total)</dt>
        <dd className={stats.differenceDecompositionOk ? 'exec-num' : 'exec-num exec-num--warn'}>
          {stats.differenceDecompositionOk ? 'Sí' : 'No — revisar datos'}
        </dd>
        <dt>Ajuste de saldo (si hay saldo final extracto)</dt>
        <dd className="exec-num">
          {stats.adjustedBalanceFromBank != null ? (
            <>
              {formatAmount(stats.adjustedBalanceFromBank)}
              <span className="exec-formula-hint">
                {' '}
                (= saldo final extracto + Σ pend. empresa − Σ pend. banco)
              </span>
            </>
          ) : (
            '— (indicá saldo final extracto abajo)'
          )}
        </dd>
        <dt>Dif. saldo ajustado vs saldo final empresa</dt>
        <dd className="exec-num">
          {stats.adjustedVsCompanyClosing != null
            ? formatAmount(stats.adjustedVsCompanyClosing)
            : '—'}
        </dd>
        <dt>Movimientos conciliados</dt>
        <dd>
          <strong>{stats.matchedPairs}</strong> pares · banco{' '}
          <span className="exec-num-inline">{formatAmount(stats.sumReconciledBank)}</span> · empresa{' '}
          <span className="exec-num-inline">{formatAmount(stats.sumReconciledCompany)}</span>
        </dd>
        <dt>Suma pendientes banco</dt>
        <dd className="exec-num">{formatAmount(stats.sumPendingBank)}</dd>
        <dt>Suma pendientes empresa</dt>
        <dd className="exec-num">{formatAmount(stats.sumPendingCompany)}</dd>
        <dt>% movimientos conciliados (por cantidad)</dt>
        <dd>
          Banco {formatPct(stats.pctRowsReconciledBank)} · Empresa{' '}
          {formatPct(stats.pctRowsReconciledCompany)}
        </dd>
        <dt>Filas en extracto / libro</dt>
        <dd>
          {stats.bankRowCount} banco · {stats.companyRowCount} empresa · pendientes{' '}
          {stats.unmatchedBankCount} / {stats.unmatchedCompanyCount}
        </dd>
      </dl>
      <AuditClosingPanel stats={stats} closing={closing} />
      <div className="exec-explanation">
        <h4 className="exec-explanation-title">Explicación de la diferencia</h4>
        <ul className="exec-explanation-list">
          {stats.differenceExplanation.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function PendingGuide() {
  return (
    <details className="pending-guide">
      <summary className="pending-guide-summary">Guía: qué implican los pendientes</summary>
      <div className="pending-guide-body">
        <p>
          <strong>Pendiente banco</strong> — figura en el extracto pero no en el libro: suele ser
          débitos automáticos, comisiones o impuestos bancarios. Indica que el banco registró algo
          que la empresa aún no cargó: en general hay que <strong>dar de alta</strong> esos
          movimientos en el sistema.
        </p>
        <p>
          <strong>Pendiente empresa</strong> — está en el libro pero no en el banco: por ejemplo
          cheques emitidos no cobrados, transferencias en tránsito o depósitos recientes. Suele
          requerir <strong>esperar la compensación</strong> en cuenta o verificar con el banco.
        </p>
      </div>
    </details>
  )
}

/**
 * Importe desde campo de texto: acepta "1234.56", "1.234,56" (miles con punto, decimal con coma),
 * "27000000", "27.000.000", etc. Si no se puede interpretar, devuelve null (el backend guardará null).
 */
function parseBalanceInput(raw: string): number | null {
  let t = raw.trim().replace(/\s/g, '').replace(/\u00a0/g, '')
  if (t === '') return null

  const hasComma = t.includes(',')
  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')

  if (hasComma && (!t.includes('.') || lastComma > lastDot)) {
    const intPart = t.slice(0, lastComma).replace(/\./g, '')
    const frac = t.slice(lastComma + 1).replace(/\D/g, '')
    t = frac === '' ? intPart : `${intPart}.${frac}`
  } else if (hasComma && lastDot > lastComma) {
    t = t.replace(/,/g, '')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '')
  } else if (/^\d{1,3}\.\d{3}$/.test(t)) {
    t = t.replace('.', '')
  }

  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const CLASSIFICATION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sin clasificar' },
  { value: 'COMISION', label: 'Comisión bancaria' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'DEPOSITO_TRANSITO', label: 'Depósito en tránsito' },
  { value: 'ERROR', label: 'Error' },
  { value: 'OTRO', label: 'Otro' },
]

function SessionBalancesForm({
  session,
  onSaved,
}: {
  session: SessionDetail['session']
  onSaved: () => Promise<void>
}) {
  const [openingBankBalance, setOpeningBankBalance] = useState('')
  const [closingBankBalance, setClosingBankBalance] = useState('')
  const [openingCompanyBalance, setOpeningCompanyBalance] = useState('')
  const [closingCompanyBalance, setClosingCompanyBalance] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setOpeningBankBalance(
      session.openingBankBalance != null ? String(session.openingBankBalance) : '',
    )
    setClosingBankBalance(
      session.closingBankBalance != null ? String(session.closingBankBalance) : '',
    )
    setOpeningCompanyBalance(
      session.openingCompanyBalance != null ? String(session.openingCompanyBalance) : '',
    )
    setClosingCompanyBalance(
      session.closingCompanyBalance != null ? String(session.closingCompanyBalance) : '',
    )
    setErr(null)
  }, [
    session.id,
    session.openingBankBalance,
    session.closingBankBalance,
    session.openingCompanyBalance,
    session.closingCompanyBalance,
  ])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const r = await fetch(`/api/v1/conciliacion/sessions/${session.id}/balances`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openingBankBalance: parseBalanceInput(openingBankBalance),
          closingBankBalance: parseBalanceInput(closingBankBalance),
          openingCompanyBalance: parseBalanceInput(openingCompanyBalance),
          closingCompanyBalance: parseBalanceInput(closingCompanyBalance),
        }),
      })
      if (!r.ok) throw new Error(await parseError(r))
      await onSaved()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="balances-form" onSubmit={(e) => void handleSubmit(e)}>
      <h3 className="subsection-title">Saldos del período (opcional)</h3>
      <p className="hint">
        Ingresá saldos según extracto y libro. Podés usar miles con punto (p. ej. 27.000.000) o coma
        decimal (1.234,56). Con <strong>saldo final banco</strong> y <strong>saldo final empresa</strong>{' '}
        el sistema cierra el circuito de auditoría: comprueba que el saldo ajustado (extracto + efecto
        de pendientes) coincida con el libro.
      </p>
      <div className="balances-grid">
        <label>
          <span>Saldo inicial banco</span>
          <input
            type="text"
            inputMode="decimal"
            value={openingBankBalance}
            onChange={(ev) => setOpeningBankBalance(ev.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          <span>Saldo final banco</span>
          <input
            type="text"
            inputMode="decimal"
            value={closingBankBalance}
            onChange={(ev) => setClosingBankBalance(ev.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          <span>Saldo inicial empresa</span>
          <input
            type="text"
            inputMode="decimal"
            value={openingCompanyBalance}
            onChange={(ev) => setOpeningCompanyBalance(ev.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          <span>Saldo final empresa</span>
          <input
            type="text"
            inputMode="decimal"
            value={closingCompanyBalance}
            onChange={(ev) => setClosingCompanyBalance(ev.target.value)}
            autoComplete="off"
          />
        </label>
      </div>
      <button type="submit" className="btn-secondary" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar saldos'}
      </button>
      {err && <p className="msg err">{err}</p>}
    </form>
  )
}

type SessionDetail = {
  session: {
    id: number
    createdAt: string
    sourceBankFileName: string | null
    sourceCompanyFileName: string | null
    status: string
    openingBankBalance: number | null
    closingBankBalance: number | null
    openingCompanyBalance: number | null
    closingCompanyBalance: number | null
  }
  bankTransactions: MovimientoDto[]
  companyTransactions: MovimientoDto[]
  unmatchedBankTransactions: MovimientoDto[]
  unmatchedCompanyTransactions: MovimientoDto[]
  pairs: ParDto[]
  stats: ConciliacionStatsDto
}

type ConciliacionRunResult = {
  sessionId: number
  pairsCreated: number
  unmatchedBank: number
  unmatchedCompany: number
  dateToleranceDays: number
  amountTolerance: number
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const j = JSON.parse(text) as { error?: string; message?: string }
    if (j.error) return j.error
    if (j.message) return j.message
  } catch {
    /* ignore */
  }
  return text || `HTTP ${res.status}`
}

/** ID de fila en BD: solo dígitos, sin espacios. */
function parseTransactionId(raw: string): number | null {
  const s = raw.trim()
  if (s === '') {
    return null
  }
  if (!/^\d+$/.test(s)) {
    return null
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

type ComparisonRow =
  | {
      key: string
      kind: 'pair'
      pair: ParDto
      bank: MovimientoDto
      company: MovimientoDto
    }
  | { key: string; kind: 'unmatchedBank'; m: MovimientoDto }
  | { key: string; kind: 'unmatchedCompany'; m: MovimientoDto }

function buildComparisonRows(detail: SessionDetail): ComparisonRow[] {
  const bankMap = new Map(detail.bankTransactions.map((m) => [m.id, m]))
  const companyMap = new Map(detail.companyTransactions.map((m) => [m.id, m]))
  const pairRows: ComparisonRow[] = [...detail.pairs]
    .sort((a, b) => a.bankDate.localeCompare(b.bankDate))
    .map((p) => {
      const bank =
        bankMap.get(p.bankTxId) ??
        ({
          id: p.bankTxId,
          txDate: p.bankDate,
          amount: p.bankAmount,
          description: null,
          reference: null,
          pendingClassification: null,
          accountingAmount: null,
        } satisfies MovimientoDto)
      const company =
        companyMap.get(p.companyTxId) ??
        ({
          id: p.companyTxId,
          txDate: p.companyDate,
          amount: p.companyAmount,
          description: null,
          reference: null,
          pendingClassification: null,
          accountingAmount: null,
        } satisfies MovimientoDto)
      return {
        key: `pair-${p.pairId}`,
        kind: 'pair' as const,
        pair: p,
        bank,
        company,
      }
    })
  const ub = [...detail.unmatchedBankTransactions]
    .sort((a, b) => a.txDate.localeCompare(b.txDate))
    .map(
      (m): ComparisonRow => ({
        key: `ub-${m.id}`,
        kind: 'unmatchedBank',
        m,
      }),
    )
  const uc = [...detail.unmatchedCompanyTransactions]
    .sort((a, b) => a.txDate.localeCompare(b.txDate))
    .map(
      (m): ComparisonRow => ({
        key: `uc-${m.id}`,
        kind: 'unmatchedCompany',
        m,
      }),
    )
  return [...pairRows, ...ub, ...uc]
}

/** Fecha usada para ordenar la fila en la vista completa (cronológica). */
function rowTimelineSortDate(row: ComparisonRow): string {
  if (row.kind === 'pair') {
    return row.bank.txDate <= row.company.txDate ? row.bank.txDate : row.company.txDate
  }
  return row.m.txDate
}

function timelineKindOrder(row: ComparisonRow): number {
  if (row.kind === 'pair') return 0
  if (row.kind === 'unmatchedBank') return 1
  return 2
}

/** Pares + pendientes en una sola lista ordenada por fecha (empate: par, luego banco, luego empresa). */
function sortRowsChronologically(rows: ComparisonRow[]): ComparisonRow[] {
  return [...rows].sort((a, b) => {
    const da = rowTimelineSortDate(a)
    const db = rowTimelineSortDate(b)
    const byDate = da.localeCompare(db)
    if (byDate !== 0) return byDate
    const ko = timelineKindOrder(a) - timelineKindOrder(b)
    if (ko !== 0) return ko
    return a.key.localeCompare(b.key)
  })
}

function rowClassForComparison(row: ComparisonRow): string {
  if (row.kind === 'pair') {
    return row.pair.matchSource === 'MANUAL' ? 'row--manual' : 'row--auto'
  }
  if (row.kind === 'unmatchedBank') return 'row--pend-bank'
  return 'row--pend-company'
}

type CompareFilterKind = 'all' | 'auto' | 'manual' | 'pend-bank' | 'pend-company'

function rowMatchesFilter(row: ComparisonRow, f: CompareFilterKind): boolean {
  if (f === 'all') return true
  if (row.kind === 'pair') {
    if (f === 'auto') return row.pair.matchSource !== 'MANUAL'
    if (f === 'manual') return row.pair.matchSource === 'MANUAL'
    return false
  }
  if (row.kind === 'unmatchedBank') return f === 'pend-bank'
  return f === 'pend-company'
}

function compareFilterCounts(rows: ComparisonRow[]) {
  let auto = 0
  let manual = 0
  let pendBank = 0
  let pendCompany = 0
  for (const r of rows) {
    if (r.kind === 'pair') {
      if (r.pair.matchSource === 'MANUAL') manual += 1
      else auto += 1
    } else if (r.kind === 'unmatchedBank') pendBank += 1
    else pendCompany += 1
  }
  return { all: rows.length, auto, manual, pendBank, pendCompany }
}

function ComparisonLegend({
  filter,
  onFilter,
  counts,
}: {
  filter: CompareFilterKind
  onFilter: (f: CompareFilterKind) => void
  counts: ReturnType<typeof compareFilterCounts>
}) {
  const items: {
    id: CompareFilterKind
    label: string
    swatch: string
    count: number
    title: string
  }[] = [
    { id: 'all', label: 'Todos', swatch: '', count: counts.all, title: 'Mostrar todas las filas' },
    {
      id: 'auto',
      label: 'Conciliado',
      swatch: 'compare-swatch--auto',
      count: counts.auto,
      title: 'Solo conciliación automática',
    },
    {
      id: 'manual',
      label: 'Conciliado manual',
      swatch: 'compare-swatch--manual',
      count: counts.manual,
      title: 'Solo conciliación manual',
    },
    {
      id: 'pend-bank',
      label: 'Pendiente banco',
      swatch: 'compare-swatch--pend-bank',
      count: counts.pendBank,
      title: 'Solo pendientes de banco',
    },
    {
      id: 'pend-company',
      label: 'Pendiente empresa',
      swatch: 'compare-swatch--pend-company',
      count: counts.pendCompany,
      title: 'Solo pendientes de empresa',
    },
  ]

  return (
    <div className="compare-legend-scroll">
      <div
        className="compare-legend compare-legend--strip"
        role="tablist"
        aria-label="Filtrar por estado"
      >
        {items.map(({ id, label, swatch, count, title }) => (
          <button
            key={id}
            type="button"
            role="tab"
            title={title}
            aria-selected={filter === id}
            className={
              filter === id ? 'compare-legend-btn compare-legend-btn--active' : 'compare-legend-btn'
            }
            onClick={() => onFilter(id)}
          >
            {swatch ? (
              <span className={`compare-swatch ${swatch}`} aria-hidden />
            ) : (
              <span className="compare-swatch compare-swatch--all" aria-hidden />
            )}
            <span className="compare-legend-label">{label}</span>
            <span className="compare-legend-count">{count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ClassificationSelect({
  value,
  onChange,
}: {
  value: string | null | undefined
  onChange: (v: string) => void
}) {
  return (
    <select
      className="clasif-select"
      value={value ?? ''}
      onChange={(ev) => onChange(ev.target.value)}
      aria-label="Clasificación del pendiente"
    >
      {CLASSIFICATION_OPTIONS.map((o) => (
        <option key={o.value || 'none'} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function ComparisonTable({
  rows,
  allRowsCount,
  selectedId,
  onDeleteManual,
  onSetClassification,
}: {
  rows: ComparisonRow[]
  /** Total sin filtrar; si es 0 la sesión está vacía. */
  allRowsCount: number
  selectedId: number | null
  onDeleteManual: (pairId: number) => void
  onSetClassification: (side: 'bank' | 'company', txId: number, classification: string) => void
}) {
  return (
    <div className="table-wrap compare-table-wrap">
      <table className="data-table compare-table">
        <thead>
          <tr>
            <th rowSpan={2} className="compare-th-tipo">
              Estado
            </th>
            <th colSpan={4} className="compare-th-group">
              Banco
            </th>
            <th colSpan={4} className="compare-th-group">
              Empresa
            </th>
            <th rowSpan={2} className="compare-th-clasif">
              Clasif.
            </th>
            <th rowSpan={2} className="compare-th-delta">
              Δ
            </th>
            <th rowSpan={2}></th>
          </tr>
          <tr>
            <th>ID</th>
            <th>Fecha</th>
            <th>Importe</th>
            <th>Ref. / desc.</th>
            <th>ID</th>
            <th>Fecha</th>
            <th>Importe</th>
            <th>Ref. / desc.</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={12} className="compare-empty">
                {allRowsCount === 0
                  ? 'No hay movimientos en esta sesión.'
                  : 'No hay filas para este filtro. Elegí otro estado arriba o «Todos».'}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const cls = rowClassForComparison(row)
              if (row.kind === 'pair') {
                const { pair, bank, company } = row
                const delta = company.amount - bank.amount
                const deltaStr =
                  Math.abs(delta) < 1e-9 ? '0' : delta.toFixed(2)
                const estadoLabel =
                  pair.matchSource === 'MANUAL' ? 'Conciliado manual' : 'Conciliado'
                const estadoBadgeClass =
                  pair.matchSource === 'MANUAL'
                    ? 'compare-badge compare-badge--estado compare-badge--manual'
                    : 'compare-badge compare-badge--estado compare-badge--auto'
                return (
                  <tr key={row.key} className={cls}>
                    <td className="compare-td-tipo">
                      <span className={estadoBadgeClass}>{estadoLabel}</span>
                    </td>
                    <td>{bank.id}</td>
                    <td className="cell-date-nowrap">{formatDisplayDate(bank.txDate)}</td>
                    <td>{bank.amount}</td>
                    <td className="cell-desc">
                      {[bank.reference, bank.description].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td>{company.id}</td>
                    <td className="cell-date-nowrap">{formatDisplayDate(company.txDate)}</td>
                    <td>{company.amount}</td>
                    <td className="cell-desc">
                      {[company.reference, company.description].filter(Boolean).join(' · ') ||
                        '—'}
                    </td>
                    <td className="compare-muted">—</td>
                    <td className="compare-delta">{deltaStr}</td>
                    <td>
                      {pair.matchSource === 'MANUAL' && selectedId != null && (
                        <button
                          type="button"
                          className="btn-link danger"
                          onClick={() => onDeleteManual(pair.pairId)}
                        >
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              }
              if (row.kind === 'unmatchedBank') {
                const { m } = row
                return (
                  <tr key={row.key} className={cls}>
                    <td className="compare-td-tipo">
                      <span className="compare-badge compare-badge--estado compare-badge--warn">
                        Pendiente banco
                      </span>
                    </td>
                    <td>{m.id}</td>
                    <td className="cell-date-nowrap">{formatDisplayDate(m.txDate)}</td>
                    <td>{m.amount}</td>
                    <td className="cell-desc">
                      {[m.reference, m.description].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td colSpan={4} className="compare-muted">
                      —
                    </td>
                    <td>
                      <ClassificationSelect
                        value={m.pendingClassification}
                        onChange={(v) => onSetClassification('bank', m.id, v)}
                      />
                    </td>
                    <td className="compare-muted">—</td>
                    <td />
                  </tr>
                )
              }
              const { m } = row
              return (
                <tr key={row.key} className={cls}>
                  <td className="compare-td-tipo">
                    <span className="compare-badge compare-badge--estado compare-badge--company">
                      Pendiente empresa
                    </span>
                  </td>
                  <td colSpan={4} className="compare-muted">
                    —
                  </td>
                  <td>{m.id}</td>
                  <td className="cell-date-nowrap">{formatDisplayDate(m.txDate)}</td>
                  <td>{m.amount}</td>
                  <td className="cell-desc">
                    {[m.reference, m.description].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td>
                    <ClassificationSelect
                      value={m.pendingClassification}
                      onChange={(v) => onSetClassification('company', m.id, v)}
                    />
                  </td>
                  <td className="compare-muted">—</td>
                  <td />
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function CompleteViewLegendStatic() {
  return (
    <div className="complete-legend-readonly" aria-label="Referencia de colores">
      <span className="complete-legend-item">
        <span className="compare-swatch compare-swatch--auto" aria-hidden /> Conciliado
      </span>
      <span className="complete-legend-item">
        <span className="compare-swatch compare-swatch--manual" aria-hidden /> Conciliado manual
      </span>
      <span className="complete-legend-item">
        <span className="compare-swatch compare-swatch--pend-bank" aria-hidden /> Pendiente banco
      </span>
      <span className="complete-legend-item">
        <span className="compare-swatch compare-swatch--pend-company" aria-hidden /> Pendiente empresa
      </span>
    </div>
  )
}

function MovimientosTable({
  title,
  rows,
}: {
  title: string
  rows: MovimientoDto[]
}) {
  if (rows.length === 0) {
    return (
      <p className="msg subtle">
        {title}: ninguno.
      </p>
    )
  }
  return (
    <>
      <h3 className="subsection-title">
        {title} ({rows.length})
      </h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Importe</th>
              <th>Referencia</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.id}</td>
                <td className="cell-date-nowrap">{formatDisplayDate(m.txDate)}</td>
                <td>{m.amount}</td>
                <td>{m.reference ?? '—'}</td>
                <td className="cell-desc">{m.description ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function App() {
  const [bankFile, setBankFile] = useState<File | null>(null)
  const [companyFile, setCompanyFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [toleranceDays, setToleranceDays] = useState(3)
  const [amountTolerance, setAmountTolerance] = useState(0.01)
  const [conciliarLoading, setConciliarLoading] = useState(false)
  const [conciliarResult, setConciliarResult] = useState<ConciliacionRunResult | null>(null)
  const [conciliarError, setConciliarError] = useState<string | null>(null)

  const [manualBankId, setManualBankId] = useState('')
  const [manualCompanyId, setManualCompanyId] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)

  const [detailLayout, setDetailLayout] = useState<'classic' | 'compare' | 'complete'>('compare')
  const [compareFilter, setCompareFilter] = useState<CompareFilterKind>('all')

  const comparisonRows = useMemo(
    () => (detail ? buildComparisonRows(detail) : []),
    [detail],
  )

  const chronologicalRows = useMemo(
    () => sortRowsChronologically(comparisonRows),
    [comparisonRows],
  )

  const compareCounts = useMemo(
    () => compareFilterCounts(comparisonRows),
    [comparisonRows],
  )

  const filteredComparisonRows = useMemo(
    () => comparisonRows.filter((r) => rowMatchesFilter(r, compareFilter)),
    [comparisonRows, compareFilter],
  )

  const loadSessions = useCallback(async () => {
    setSessionsError(null)
    try {
      const r = await fetch('/api/v1/conciliacion/sessions?size=30')
      if (!r.ok) throw new Error(await parseError(r))
      const page = (await r.json()) as PageSessions
      setSessions(page.content ?? [])
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const loadDetail = useCallback(async (id: number, options?: { soft?: boolean }) => {
    const soft = options?.soft === true
    if (!soft) {
      setDetailLoading(true)
      setDetailError(null)
      setConciliarResult(null)
      setConciliarError(null)
    }
    try {
      const r = await fetch(`/api/v1/conciliacion/sessions/${id}`)
      if (!r.ok) throw new Error(await parseError(r))
      setDetail((await r.json()) as SessionDetail)
      if (soft) setDetailError(null)
    } catch (e) {
      if (!soft) setDetail(null)
      setDetailError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!soft) setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (importResult?.sessionId != null) {
      setSelectedId(importResult.sessionId)
      void loadSessions()
    }
  }, [importResult, loadSessions])

  useEffect(() => {
    if (selectedId != null) {
      void loadDetail(selectedId)
    } else {
      setDetail(null)
    }
  }, [selectedId, loadDetail])

  useEffect(() => {
    setCompareFilter('all')
  }, [selectedId])

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    setImportError(null)
    setImportResult(null)
    if (!bankFile || !companyFile) {
      setImportError(
        'Seleccioná el archivo del banco y el de la empresa/plataforma (.xls o .xlsx cada uno).',
      )
      return
    }
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('bank', bankFile)
      fd.append('company', companyFile)
      const r = await fetch('/api/v1/conciliacion/import', {
        method: 'POST',
        body: fd,
      })
      if (!r.ok) throw new Error(await parseError(r))
      setImportResult((await r.json()) as ImportResult)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  async function handleManualPair() {
    if (selectedId == null) return
    const b = parseTransactionId(manualBankId)
    const c = parseTransactionId(manualCompanyId)
    if (b == null && c == null) {
      setManualError('Completá ambos IDs (solo números, sin letras). Ejemplo: 243 y 87.')
      return
    }
    if (b == null) {
      setManualError('ID de banco inválido o vacío. Usá la columna ID de «Pendientes banco».')
      return
    }
    if (c == null) {
      setManualError(
        'ID de empresa inválido o vacío. Escribí solo el número (columna ID de «Pendientes empresa»).',
      )
      return
    }
    setManualLoading(true)
    setManualError(null)
    try {
      const r = await fetch(`/api/v1/conciliacion/sessions/${selectedId}/pares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankTransactionId: b,
          companyTransactionId: c,
        }),
      })
      if (!r.ok) throw new Error(await parseError(r))
      setManualBankId('')
      setManualCompanyId('')
      await loadDetail(selectedId)
      await loadSessions()
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e))
    } finally {
      setManualLoading(false)
    }
  }

  async function handleDeleteManualPair(pairId: number) {
    if (selectedId == null) return
    if (!window.confirm('¿Quitar este vínculo manual?')) return
    try {
      const r = await fetch(
        `/api/v1/conciliacion/sessions/${selectedId}/pares/${pairId}`,
        { method: 'DELETE' },
      )
      if (!r.ok) throw new Error(await parseError(r))
      await loadDetail(selectedId)
      await loadSessions()
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleConciliar() {
    if (selectedId == null) return
    setConciliarLoading(true)
    setConciliarError(null)
    setConciliarResult(null)
    try {
      const q = new URLSearchParams({
        dateToleranceDays: String(toleranceDays),
        amountTolerance: String(amountTolerance),
      })
      const r = await fetch(
        `/api/v1/conciliacion/sessions/${selectedId}/conciliar?${q.toString()}`,
        { method: 'POST' },
      )
      if (!r.ok) throw new Error(await parseError(r))
      setConciliarResult((await r.json()) as ConciliacionRunResult)
      await loadDetail(selectedId)
      await loadSessions()
    } catch (e) {
      setConciliarError(e instanceof Error ? e.message : String(e))
    } finally {
      setConciliarLoading(false)
    }
  }

  async function handleSetClassification(
    side: 'bank' | 'company',
    txId: number,
    classification: string,
  ) {
    if (selectedId == null) return
    const sub =
      side === 'bank'
        ? `pending/banco/${txId}/clasificacion`
        : `pending/empresa/${txId}/clasificacion`
    try {
      const r = await fetch(
        `/api/v1/conciliacion/sessions/${selectedId}/${sub}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classification: classification === '' ? null : classification,
          }),
        },
      )
      if (!r.ok) throw new Error(await parseError(r))
      await loadDetail(selectedId)
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div
      className={
        selectedId != null ? 'app app--wide-detail' : 'app'
      }
    >
      <header className="app-header">
        <h1>Conciliación bancaria</h1>
        <p className="subtitle">
          Importación, sesiones, conciliación por importe (|Δ| ≤ tolerancia) y fecha más cercana
        </p>
      </header>

      <main className="app-main">
        <section className="card import-card">
          <h2>Importar archivos</h2>
          <form onSubmit={handleImport} className="import-form">
            <div className="import-form-files">
              <label className="file-label">
                <span>Banco (Excel .xls o .xlsx)</span>
                <input
                  className="import-file-input"
                  type="file"
                  accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(ev) => setBankFile(ev.target.files?.[0] ?? null)}
                />
              </label>
              <label className="file-label">
                <span>Empresa / plataforma (Excel .xls o .xlsx)</span>
                <input
                  className="import-file-input"
                  type="file"
                  accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(ev) => setCompanyFile(ev.target.files?.[0] ?? null)}
                />
                <a
                  className="import-template-link"
                  href="/api/v1/conciliacion/template/plataforma.xlsx"
                  download="plantilla-plataforma-resumen-bancario.xlsx"
                >
                  Descargar plantilla
                </a>
              </label>
            </div>
            <button type="submit" className="btn-import" disabled={importing}>
              {importing ? 'Importando…' : 'Importar'}
            </button>
          </form>
          {importError && <p className="msg err">{importError}</p>}
          {importResult && (
            <dl className="status-dl import-result">
              <dt>Sesión</dt>
              <dd>{importResult.sessionId}</dd>
              <dt>Filas banco</dt>
              <dd>{importResult.bankRows}</dd>
              <dt>Filas plataforma</dt>
              <dd>{importResult.companyRows}</dd>
              <dt>Archivo banco</dt>
              <dd>{importResult.sourceBankFileName}</dd>
              <dt>Archivo plataforma</dt>
              <dd>{importResult.sourceCompanyFileName}</dd>
            </dl>
          )}
        </section>

        <section className="card">
          <h2>Sesiones recientes</h2>
          <button type="button" className="btn-secondary" onClick={() => void loadSessions()}>
            Actualizar lista
          </button>
          {sessionsError && <p className="msg err">{sessionsError}</p>}
          {sessions.length === 0 && !sessionsError && (
            <p className="msg">No hay sesiones importadas todavía.</p>
          )}
          {sessions.length > 0 && (
            <ul className="session-list">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={
                      selectedId === s.id ? 'session-pill active' : 'session-pill'
                    }
                    onClick={() => setSelectedId(s.id)}
                  >
                    #{s.id} · {s.status} · banco {s.bankRowCount} · empresa{' '}
                    {s.companyRowCount} · pares {s.matchedPairs}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Detalle y conciliación</h2>
          {selectedId == null && (
            <p className="msg">Elegí una sesión en la lista o importá archivos nuevos.</p>
          )}
          {selectedId != null && (
            <>
              <p className="msg">
                Sesión <strong>{selectedId}</strong>
              </p>
              <div className="conciliar-row">
                <label className="file-label inline">
                  <span>Tolerancia de fechas (días)</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={toleranceDays}
                    onChange={(ev) => setToleranceDays(Number(ev.target.value))}
                  />
                </label>
                <label className="file-label inline">
                  <span>Tolerancia importe (±)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={amountTolerance}
                    onChange={(ev) => setAmountTolerance(Number(ev.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="btn-import"
                  disabled={conciliarLoading || detailLoading}
                  onClick={() => void handleConciliar()}
                >
                  {conciliarLoading ? 'Conciliando…' : 'Ejecutar conciliación'}
                </button>
              </div>
              {conciliarError && <p className="msg err">{conciliarError}</p>}
              <div className="export-row">
                <span className="export-label">Exportar</span>
                <a
                  className="export-link"
                  href={`/api/v1/conciliacion/sessions/${selectedId}/export.xlsx`}
                  download={`conciliacion-sesion-${selectedId}.xlsx`}
                >
                  Excel (.xlsx)
                </a>
              </div>

              {conciliarResult && (
                <dl className="status-dl">
                  <dt>Pares automáticos (esta corrida)</dt>
                  <dd>{conciliarResult.pairsCreated}</dd>
                  <dt>Sin match banco</dt>
                  <dd>{conciliarResult.unmatchedBank}</dd>
                  <dt>Sin match empresa</dt>
                  <dd>{conciliarResult.unmatchedCompany}</dd>
                  <dt>Tolerancias usadas</dt>
                  <dd>
                    {conciliarResult.dateToleranceDays} días · importe ±{' '}
                    {conciliarResult.amountTolerance}
                  </dd>
                </dl>
              )}
            </>
          )}
          {detailLoading && <p className="msg">Cargando detalle…</p>}
          {detailError && <p className="msg err">{detailError}</p>}
          {detail && !detailLoading && (
            <>
              <dl className="status-dl session-meta-dl">
                <dt>Estado sesión</dt>
                <dd>{detail.session.status}</dd>
                <dt>Banco (archivo)</dt>
                <dd>{detail.session.sourceBankFileName ?? '—'}</dd>
                <dt>Empresa (archivo)</dt>
                <dd>{detail.session.sourceCompanyFileName ?? '—'}</dd>
              </dl>

              <SessionBalancesForm
                session={detail.session}
                onSaved={async () => {
                  if (selectedId != null) await loadDetail(selectedId, { soft: true })
                }}
              />

              <ExecutiveSummaryPanel
                stats={detail.stats}
                closing={{
                  closingBankBalance: detail.session.closingBankBalance,
                  closingCompanyBalance: detail.session.closingCompanyBalance,
                }}
              />
              <PendingGuide />

              <div className="detail-view-toggle" role="tablist" aria-label="Vista de detalle">
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailLayout === 'compare'}
                  className={detailLayout === 'compare' ? 'session-pill active' : 'session-pill'}
                  onClick={() => setDetailLayout('compare')}
                >
                  Comparativa
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailLayout === 'complete'}
                  className={detailLayout === 'complete' ? 'session-pill active' : 'session-pill'}
                  onClick={() => setDetailLayout('complete')}
                >
                  Completa
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailLayout === 'classic'}
                  className={detailLayout === 'classic' ? 'session-pill active' : 'session-pill'}
                  onClick={() => setDetailLayout('classic')}
                >
                  Tablas clásicas
                </button>
              </div>

              {detailLayout === 'compare' ? (
                <>
                  <h3 className="subsection-title">
                    Comparación (
                    {compareFilter === 'all'
                      ? `${comparisonRows.length} filas`
                      : `${filteredComparisonRows.length} de ${comparisonRows.length}`}
                    )
                  </h3>
                  <p className="hint compare-hint">
                    Tocá un color (o «Todos») para ver solo filas de ese estado. La grilla se ordena:
                    pares, pendientes banco, pendientes empresa.
                  </p>
                  <ComparisonLegend
                    filter={compareFilter}
                    onFilter={setCompareFilter}
                    counts={compareCounts}
                  />
                  <ComparisonTable
                    rows={filteredComparisonRows}
                    allRowsCount={comparisonRows.length}
                    selectedId={selectedId}
                    onDeleteManual={(pairId) => void handleDeleteManualPair(pairId)}
                    onSetClassification={(side, txId, c) =>
                      void handleSetClassification(side, txId, c)
                    }
                  />
                </>
              ) : detailLayout === 'complete' ? (
                <>
                  <h3 className="subsection-title">
                    Vista completa ({chronologicalRows.length} filas)
                  </h3>
                  <p className="hint compare-hint">
                    Todas las filas en una sola tabla, ordenadas por fecha. En cada par se usa la
                    fecha más temprana entre banco y empresa. Los pendientes muestran solo un lado;
                    el otro queda vacío (—).
                  </p>
                  <CompleteViewLegendStatic />
                  <ComparisonTable
                    rows={chronologicalRows}
                    allRowsCount={comparisonRows.length}
                    selectedId={selectedId}
                    onDeleteManual={(pairId) => void handleDeleteManualPair(pairId)}
                    onSetClassification={(side, txId, c) =>
                      void handleSetClassification(side, txId, c)
                    }
                  />
                </>
              ) : (
                <>
                  <h3 className="subsection-title">Pares encontrados ({detail.pairs.length})</h3>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Origen</th>
                          <th>Importe banco</th>
                          <th>Importe empresa</th>
                          <th>Fecha banco</th>
                          <th>Fecha empresa</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.pairs.map((p) => (
                          <tr key={p.pairId}>
                            <td>{p.matchSource}</td>
                            <td>{p.bankAmount}</td>
                            <td>{p.companyAmount}</td>
                            <td className="cell-date-nowrap">{formatDisplayDate(p.bankDate)}</td>
                            <td className="cell-date-nowrap">{formatDisplayDate(p.companyDate)}</td>
                            <td>
                              {p.matchSource === 'MANUAL' && selectedId != null && (
                                <button
                                  type="button"
                                  className="btn-link danger"
                                  onClick={() => void handleDeleteManualPair(p.pairId)}
                                >
                                  Quitar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <MovimientosTable
                    title="Pendientes banco"
                    rows={detail.unmatchedBankTransactions}
                  />
                  <MovimientosTable
                    title="Pendientes empresa (plataforma)"
                    rows={detail.unmatchedCompanyTransactions}
                  />
                </>
              )}

              <h3 className="subsection-title">Vínculo manual</h3>
              <p className="hint">
                Localizá cada movimiento en la vista comparativa o completa (filas «Pendiente banco»
                / «Pendiente empresa») o en las tablas clásicas y copiá el número de la columna{' '}
                <strong>ID</strong> (solo dígitos). Ambos deben seguir <strong>pendientes</strong>.
                Los vínculos manuales no se borran al conciliar en automático.
              </p>
              <div className="conciliar-row manual-pair-row">
                <label className="file-label inline">
                  <span>ID mov. banco</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={manualBankId}
                    onChange={(ev) => {
                      setManualBankId(ev.target.value)
                      setManualError(null)
                    }}
                    placeholder=""
                  />
                </label>
                <label className="file-label inline">
                  <span>ID mov. empresa</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={manualCompanyId}
                    onChange={(ev) => {
                      setManualCompanyId(ev.target.value)
                      setManualError(null)
                    }}
                    placeholder=""
                  />
                </label>
                <button
                  type="button"
                  className="btn-import"
                  disabled={manualLoading || detailLoading}
                  onClick={() => void handleManualPair()}
                >
                  {manualLoading ? 'Guardando…' : 'Vincular'}
                </button>
              </div>
              {manualError && <p className="msg err">{manualError}</p>}
            </>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
