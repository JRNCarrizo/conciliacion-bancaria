import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import './conciliacion.css'
import {
  DEFAULT_IMPORT_BANK_LAYOUT_EXCEL,
  DEFAULT_IMPORT_COMPANY_LAYOUT_EXCEL,
  SESSION_HISTORY_PAGE_SIZE,
  STATUS_LABEL,
} from './constants'
import type {
  CompareFilterKind,
  ComparisonRow,
  ConciliacionRunResult,
  ConciliacionStatsDto,
  ImportBankLayoutExcel,
  ImportCompanyLayoutExcel,
  ImportResult,
  MovementAttachmentDto,
  MovimientoDto,
  PendingAttachmentTarget,
  PendingThreadTarget,
  PageSessions,
  ParDto,
  PairKind,
  PendingCommentDto,
  SessionClosingInfo,
  SessionDetail,
  SessionSummary,
} from './types'
import { apiFetch } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import {
  downloadAuthenticatedFile,
  openAuthenticatedFileInNewTab,
  useAuthenticatedBlobUrl,
} from './api/authenticatedBlob'
import { parseError } from './api/http'
import { rowMatchesClassification, rowMatchesSearch } from './utils/compareSearch'
import {
  coerceAmount,
  effectivePairKindFromAmounts,
  pairKindShowsAmountDifference,
} from './utils/effectivePairKind'
import {
  formatAmount,
  formatCommentAuthor,
  formatCommentWhen,
  formatDisplayDate,
  formatPct,
  formatSessionListWhen,
  formatToleranceInputDisplay,
  sessionStatusLabel,
  shortFileLabel,
  statusPanelClass,
} from './utils/format'
import { parseBalanceInput, parseTransactionId } from './utils/parse'
import {
  bankLayoutExcelToApi,
  companyLayoutExcelToApi,
  normalizeColumnLettersInput,
} from './utils/importLayoutExcel'

const AMOUNT_TOLERANCE_ARROW_STEP = 0.01

function stepToleranceDays(direction: 1 | -1, prev: number): number {
  return Math.min(60, Math.max(0, prev + direction))
}

function stepToleranceAmount(direction: 1 | -1, prev: number): number {
  return Math.max(
    0,
    Math.round((prev + direction * AMOUNT_TOLERANCE_ARROW_STEP) * 1e6) / 1e6,
  )
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

function InfoCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 16v-1M12 8v4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ExecutiveSummaryGuide() {
  return (
    <details className="exec-help-details">
      <summary className="exec-help-summary">
        <InfoCircleIcon className="exec-help-icon" />
        <span>Guía — interpretación del resumen</span>
      </summary>
      <div className="exec-help-body">
        <h4 className="exec-help-h">¿Qué es este panel?</h4>
        <p>
          Resume el cruce entre el <strong>extracto bancario</strong> (archivo importado como banco) y
          los <strong>registros de empresa / plataforma</strong>. Sirve para comprobar si los importes
          cierran entre sí, entender <strong>qué diferencias</strong> hay y qué parte queda pendiente
          de explicar.
        </p>

        <h4 className="exec-help-h">Importes generales</h4>
        <ul>
          <li>
            <strong>Σ importes extracto (banco, control)</strong> — suma de todos los movimientos del
            extracto; es lo ocurrido en la cuenta según el banco.
          </li>
          <li>
            <strong>Σ plataforma — conciliación (debe − haber, mismo criterio que extracto)</strong> —
            suma de la empresa ajustada al mismo criterio que el banco para que la comparación sea
            homogénea.
          </li>
          <li>
            <strong>Σ plataforma — neto contable (haber − debe por línea, libro)</strong> — resultado
            contable en el sistema; es <strong>solo informativo</strong> (referencia de libro) y no se
            usa para el emparejamiento automático.
          </li>
        </ul>

        <h4 className="exec-help-h">Diferencias</h4>
        <ul>
          <li>
            <strong>Diferencia total (banco − empresa)</strong> — brecha entre ambas columnas en el
            período. Lo ideal es que sea 0 o que se explique por completo con pares y pendientes.
          </li>
          <li>
            <strong>Δ pares (Σ banco en pares − Σ empresa en pares)</strong> — diferencia solo entre
            movimientos ya emparejados. Si no es 0, conviene revisar importes o pares con brecha de
            importe (no siempre es un «error» de datos: puede haber tolerancias).
          </li>
          <li>
            <strong>Efecto neto pendientes (Σ pend. banco − Σ pend. empresa)</strong> — impacto en el
            total de lo que no tiene par en el otro lado. Es normal que exista mientras haya
            pendientes.
          </li>
          <li>
            <strong>Validación algebraica (Δ pares + efecto neto pendientes = diferencia total)</strong>{' '}
            — comprueba que el desglose sea consistente. Si indica «No», hay que revisar datos o el
            cálculo.
          </li>
        </ul>

        <h4 className="exec-help-h">Movimientos y filas</h4>
        <ul>
          <li>
            <strong>Movimientos conciliados</strong> — cantidad y montos de operaciones que ya tienen
            par entre banco y empresa.
          </li>
          <li>
            <strong>Pendientes banco</strong> — están en el extracto y no en la empresa (p. ej. comisiones
            bancarias). Aportan al efecto neto de pendientes.
          </li>
          <li>
            <strong>Pendientes empresa</strong> — están en la empresa y no en el banco (p. ej. pagos aún
            no impactados en cuenta).
          </li>
          <li>
            <strong>% movimientos conciliados</strong> — uno para banco y otro para empresa: qué parte de
            las <strong>filas</strong> logró emparejarse (por cantidad).
          </li>
          <li>
            <strong>Filas en extracto / libro</strong> — totales de registros en cada lado y cuántos
            quedaron pendientes.
          </li>
        </ul>

        <h4 className="exec-help-h">Saldos y auditoría</h4>
        <ul>
          <li>
            <strong>Saldo final banco / extracto</strong> — lo informado por el extracto (lo cargás en el
            formulario de saldos de la sesión).
          </li>
          <li>
            <strong>Saldo final empresa</strong> — el registrado por la empresa para el mismo corte.
          </li>
          <li>
            <strong>Saldo ajustado (o ajuste de saldo)</strong> — el sistema lo calcula como:{' '}
            <strong>
              saldo final extracto + Σ pendientes empresa − Σ pendientes banco
            </strong>{' '}
            (misma lógica que en el bloque «Auditoría de cierre»).
          </li>
          <li>
            <strong>Diferencia de saldos (ajustado vs empresa)</strong> — debe tender a 0 dentro de la
            tolerancia si extracto, pendientes y saldos están bien cargados.
          </li>
        </ul>

        <h4 className="exec-help-h">Estados posibles (banda superior)</h4>
        <ul>
          <li>
            <strong>{STATUS_LABEL.OK}</strong> — datos consistentes; desglose coherente con lo esperado.
          </li>
          <li>
            <strong>{STATUS_LABEL.PENDING_DIFFERENCES}</strong> — siguen existiendo diferencias o
            pendientes por revisar.
          </li>
          <li>
            <strong>{STATUS_LABEL.PAIR_AMOUNT_MISMATCH}</strong> — hay un par emparejado con importes
            distintos.
          </li>
          <li>
            <strong>{STATUS_LABEL.PAIR_SIGN_MISMATCH}</strong> — hay pares con signos incompatibles.
          </li>
          <li>
            <strong>{STATUS_LABEL.STRUCTURAL_ERROR}</strong> — el desglose no cierra algebraicamente.
          </li>
          <li>
            <strong>{STATUS_LABEL.BALANCE_CROSS_CHECK_FAIL}</strong> — los saldos declarados no pasan la
            validación cruzada.
          </li>
        </ul>

        <h4 className="exec-help-h">Importante</h4>
        <ul>
          <li>La conciliación automática se basa en importe y fecha; los saldos se cargan a mano.</li>
          <li>Una diferencia no siempre es un error: a menudo se explica por pendientes o por diferencias de tiempo.</li>
          <li>
            Debajo del cuadro, <strong>Explicación de la diferencia</strong> lista frases generadas con
            el detalle del caso.
          </li>
        </ul>

        <h4 className="exec-help-h">Ejemplo práctico</h4>
        <p>
          Si el banco registra una comisión de <strong>−121</strong> que la empresa aún no imputó: suele
          aparecer como <strong>pendiente banco</strong> y explica parte de la{' '}
          <strong>diferencia total</strong> hasta que se registre del lado empresa o se clasifique.
        </p>

        <h4 className="exec-help-h">En síntesis</h4>
        <p>
          El objetivo es que la <strong>diferencia total</strong> quede explicada por el desglose (pares
          y pendientes) y que el <strong>saldo ajustado</strong> sea coherente con el{' '}
          <strong>saldo final empresa</strong>, dentro de la tolerancia declarada.
        </p>
      </div>
    </details>
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
    <details className="exec-summary-disclosure">
      <summary
        className="exec-summary-disclosure-summary"
        aria-label="Expandir o contraer resumen ejecutivo"
      >
        <span className="exec-summary-disclosure-title">Resumen ejecutivo</span>
        <span className={`exec-summary-disclosure-peek ${statusPanelClass(stats.reconciliationStatus)}`}>
          <strong>{label}</strong>
        </span>
        <span className="exec-summary-disclosure-meta">
          Dif. {formatAmount(diff)} · {stats.matchedPairs} pares · {stats.bankRowCount + stats.companyRowCount}{' '}
          filas
        </span>
      </summary>
      <div className="exec-summary-disclosure-body">
        <ExecutiveSummaryGuide />
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
    </details>
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

/** Estado del par según importes de la fila y tolerancia guardada (incluye 0). No usar solo pair.pairKind. */
function pairKindForComparisonRow(
  row: ComparisonRow,
  sessionTolerance: number | null | undefined,
): PairKind | null {
  if (row.kind !== 'pair') return null
  return effectivePairKindFromAmounts(row.bank.amount, row.company.amount, sessionTolerance)
}

/** Etiqueta y estilo del estado en grilla (par conciliado). */
function pairEstadoMeta(
  pair: ParDto,
  bank: MovimientoDto,
  company: MovimientoDto,
  sessionTolerance: number | null | undefined,
): { label: string; badgeClass: string } {
  const k = effectivePairKindFromAmounts(bank.amount, company.amount, sessionTolerance)
  if (k === 'OPPOSITE_SIGN') {
    return {
      label: 'Signo incorrecto',
      badgeClass: 'compare-badge compare-badge--estado compare-badge--opp-sign',
    }
  }
  if (k === 'AMOUNT_GAP') {
    return {
      label:
        pair.matchSource === 'MANUAL'
          ? 'Diferencia de importe (vínculo manual)'
          : 'Diferencia de importe',
      badgeClass: 'compare-badge compare-badge--estado compare-badge--amount-gap',
    }
  }
  if (k === 'AMOUNT_ADJUST') {
    return {
      label:
        pair.matchSource === 'MANUAL'
          ? 'Conciliado con ajuste (manual)'
          : 'Conciliado con ajuste (Δ dentro de tolerancia)',
      badgeClass: 'compare-badge compare-badge--estado compare-badge--amount-gap',
    }
  }
  if (pair.matchSource === 'MANUAL') {
    return {
      label: 'Conciliado manual',
      badgeClass: 'compare-badge compare-badge--estado compare-badge--manual',
    }
  }
  return {
    label: 'Conciliado',
    badgeClass: 'compare-badge compare-badge--estado compare-badge--auto',
  }
}

function SessionBalancesForm({
  session,
  onSaved,
  readOnly,
}: {
  session: SessionDetail['session']
  onSaved: () => Promise<void>
  /** Sesión cerrada: solo lectura (valores guardados). */
  readOnly: boolean
}) {
  const [openingBankBalance, setOpeningBankBalance] = useState('')
  const [closingBankBalance, setClosingBankBalance] = useState('')
  const [openingCompanyBalance, setOpeningCompanyBalance] = useState('')
  const [closingCompanyBalance, setClosingCompanyBalance] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  /**
   * Solo al cambiar de sesión o al pasar a cerrada: copiar desde el servidor.
   * No depender de los importes: tras Guardar, `loadDetail` actualizaría el efecto y pisaría lo escrito.
   */
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
  }, [session.id, readOnly])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (readOnly) return
    setSaving(true)
    setErr(null)
    try {
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${session.id}/balances`, {
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
    <form
      className={['balances-form', readOnly && 'balances-form--locked'].filter(Boolean).join(' ')}
      onSubmit={(e) => void handleSubmit(e)}
    >
      <h3 className="subsection-title">Saldos del período (opcional)</h3>
      {readOnly ? (
        <p className="hint balances-locked-hint">
          <strong>Sesión cerrada:</strong> saldos y clasificación de pendientes en solo lectura.
        </p>
      ) : (
        <p className="hint">
          Podés modificar los importes en cualquier momento y <strong>Guardar saldos</strong> para
          persistirlos. Miles con punto (27.000.000) o coma decimal (1.234,56). Con{' '}
          <strong>saldo final banco</strong> y <strong>saldo final empresa</strong> el resumen cierra
          la auditoría de cierre.
        </p>
      )}
      <div className="balances-grid">
        <label>
          <span>Saldo inicial banco</span>
          <input
            type="text"
            inputMode="decimal"
            readOnly={readOnly}
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
            readOnly={readOnly}
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
            readOnly={readOnly}
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
            readOnly={readOnly}
            value={closingCompanyBalance}
            onChange={(ev) => setClosingCompanyBalance(ev.target.value)}
            autoComplete="off"
          />
        </label>
      </div>
      {!readOnly && (
        <div className="balances-actions-row">
          <button type="submit" className="btn-secondary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar saldos'}
          </button>
        </div>
      )}
      {err && <p className="msg err">{err}</p>}
    </form>
  )
}

/** Búsqueda (izquierda) + rango de fechas (derecha) en un solo contenedor, encima de la tabla. */
function CompareFiltersBar({
  searchValue,
  onSearchChange,
  onSearchClear,
  classificationValue,
  classificationOptions,
  onClassificationChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClearDates,
}: {
  searchValue: string
  onSearchChange: (v: string) => void
  onSearchClear: () => void
  classificationValue: string
  classificationOptions: readonly string[]
  onClassificationChange: (v: string) => void
  dateFrom: string
  dateTo: string
  onDateFromChange: (v: string) => void
  onDateToChange: (v: string) => void
  onClearDates: () => void
}) {
  const hasSearch = searchValue.trim() !== ''
  return (
    <div
      className="compare-filters-bar compare-filters-bar--above-table"
      role="group"
      aria-label="Buscar y filtrar por fecha"
    >
      <div className="compare-filters-bar__search" role="search" aria-label="Buscar movimientos">
        <span className="compare-date-toolbar-label">Buscar</span>
        <div className="compare-filters-search-split">
          <div className="compare-filters-search-half">
            <div className="compare-search-controls compare-search-controls--half">
              <input
                type="search"
                className="compare-search-input"
                value={searchValue}
                onChange={(ev) => onSearchChange(ev.target.value)}
                placeholder="ID, referencia, descripción, importe…"
                aria-label="Buscar por ID, referencia, descripción o importe"
                autoComplete="off"
              />
              {hasSearch && (
                <button type="button" className="btn-secondary compare-search-clear" onClick={onSearchClear}>
                  Limpiar
                </button>
              )}
            </div>
          </div>
          <div className="compare-filters-search-half">
            <label className="compare-classif-filter-label">
              <span className="compare-classif-filter-caption">Clasificación</span>
              <select
                className="compare-classif-filter-select"
                value={classificationValue}
                onChange={(ev) => onClassificationChange(ev.target.value)}
                aria-label="Filtrar por clasificación"
              >
                <option value="">Todas</option>
                {classificationOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
      <div className="compare-filters-bar__dates" aria-label="Filtrar filas por fecha">
        <span className="compare-date-toolbar-label">Filtrar por fecha</span>
        <label className="compare-date-field">
          <span>Desde</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(ev) => onDateFromChange(ev.target.value)}
            aria-label="Fecha desde"
          />
        </label>
        <label className="compare-date-field">
          <span>Hasta</span>
          <input
            type="date"
            value={dateTo}
            onChange={(ev) => onDateToChange(ev.target.value)}
            aria-label="Fecha hasta"
          />
        </label>
        {(dateFrom !== '' || dateTo !== '') && (
          <button type="button" className="btn-secondary compare-date-clear" onClick={onClearDates}>
            Quitar fechas
          </button>
        )}
      </div>
    </div>
  )
}

function buildComparisonRows(
  detail: SessionDetail,
  sessionAmountTolerance: number | null | undefined,
): ComparisonRow[] {
  const tol = sessionAmountTolerance
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
          commentCount: 0,
          attachmentCount: 0,
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
          commentCount: 0,
          attachmentCount: 0,
        } satisfies MovimientoDto)
      const pair: ParDto = {
        ...p,
        pairKind: effectivePairKindFromAmounts(bank.amount, company.amount, tol),
      }
      return {
        key: `pair-${pair.pairId}`,
        kind: 'pair' as const,
        pair,
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

function rowClassForComparison(
  row: ComparisonRow,
  sessionTolerance: number | null | undefined,
): string {
  if (row.kind === 'pair') {
    const k = pairKindForComparisonRow(row, sessionTolerance)
    if (k === 'OPPOSITE_SIGN') return 'row--opp-sign'
    if (k != null && pairKindShowsAmountDifference(k)) return 'row--amount-gap'
    return row.pair.matchSource === 'MANUAL' ? 'row--manual' : 'row--auto'
  }
  if (row.kind === 'unmatchedBank') return 'row--pend-bank'
  return 'row--pend-company'
}

function rowMatchesFilter(
  row: ComparisonRow,
  f: CompareFilterKind,
  sessionTolerance: number | null | undefined,
): boolean {
  if (f === 'all') return true
  if (f === 'amount-gap') {
    const k = pairKindForComparisonRow(row, sessionTolerance)
    return k != null && pairKindShowsAmountDifference(k)
  }
  if (f === 'opposite-sign') {
    return pairKindForComparisonRow(row, sessionTolerance) === 'OPPOSITE_SIGN'
  }
  if (f === 'fuzzy') {
    if (row.kind === 'unmatchedBank' || row.kind === 'unmatchedCompany') {
      return row.m.fuzzyCounterpartId != null
    }
    return false
  }
  if (f === 'duplicate') {
    if (row.kind === 'unmatchedBank' || row.kind === 'unmatchedCompany') {
      return row.m.duplicateInFile === true
    }
    return false
  }
  if (row.kind === 'pair') {
    if (f === 'auto') return row.pair.matchSource !== 'MANUAL'
    if (f === 'manual') return row.pair.matchSource === 'MANUAL'
    return false
  }
  if (row.kind === 'unmatchedBank') return f === 'pend-bank'
  return f === 'pend-company'
}

/** Fecha YYYY-MM-DD desde strings del API. */
function normalizeRowDate(iso: string | null | undefined): string | null {
  if (iso == null || String(iso).trim() === '') return null
  const s = String(iso).trim()
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return m ? m[1] : s.slice(0, 10)
}

/**
 * Incluye la fila si alguna fecha relevante (banco y/o empresa en pares) cae en [desde, hasta] inclusive.
 * Vacío en ambos extremos = sin filtrar por fecha.
 */
function rowMatchesDateRange(
  row: ComparisonRow,
  dateFrom: string,
  dateTo: string,
): boolean {
  let from = dateFrom.trim()
  let to = dateTo.trim()
  if (from && to && from > to) {
    const x = from
    from = to
    to = x
  }
  if (!from && !to) return true

  const dates: string[] = []
  if (row.kind === 'pair') {
    const a = normalizeRowDate(row.bank.txDate)
    const b = normalizeRowDate(row.company.txDate)
    if (a) dates.push(a)
    if (b) dates.push(b)
  } else {
    const d = normalizeRowDate(row.m.txDate)
    if (d) dates.push(d)
  }
  if (dates.length === 0) return true

  const inRange = (d: string) => {
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }
  return dates.some(inRange)
}

function compareFilterCounts(
  rows: ComparisonRow[],
  sessionTolerance: number | null | undefined,
) {
  let auto = 0
  let manual = 0
  let pendBank = 0
  let pendCompany = 0
  let amountGap = 0
  let oppositeSign = 0
  let fuzzy = 0
  let duplicate = 0
  for (const r of rows) {
    if (r.kind === 'pair') {
      if (r.pair.matchSource === 'MANUAL') manual += 1
      else auto += 1
      const k = pairKindForComparisonRow(r, sessionTolerance)
      if (k != null && pairKindShowsAmountDifference(k)) amountGap += 1
      if (k === 'OPPOSITE_SIGN') oppositeSign += 1
    } else if (r.kind === 'unmatchedBank') {
      pendBank += 1
      if (r.m.fuzzyCounterpartId != null) fuzzy += 1
      if (r.m.duplicateInFile) duplicate += 1
    } else {
      pendCompany += 1
      if (r.m.fuzzyCounterpartId != null) fuzzy += 1
      if (r.m.duplicateInFile) duplicate += 1
    }
  }
  return {
    all: rows.length,
    auto,
    manual,
    pendBank,
    pendCompany,
    amountGap,
    oppositeSign,
    fuzzy,
    duplicate,
  }
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
    {
      id: 'amount-gap',
      label: 'Δ importe',
      swatch: 'compare-swatch--amount-gap',
      count: counts.amountGap,
      title: 'Pares con diferencia de importe o conciliado con ajuste',
    },
    {
      id: 'opposite-sign',
      label: 'Signo',
      swatch: 'compare-swatch--opp-sign',
      count: counts.oppositeSign,
      title: 'Pares con signo opuesto (inválido)',
    },
    {
      id: 'fuzzy',
      label: 'Posible match',
      swatch: 'compare-swatch--fuzzy',
      count: counts.fuzzy,
      title: 'Pendientes con candidato sugerido (importe/fecha cercanos)',
    },
    {
      id: 'duplicate',
      label: 'Duplicado',
      swatch: 'compare-swatch--duplicate',
      count: counts.duplicate,
      title: 'Pendientes marcados como duplicado (misma fecha e importe)',
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

function ClassificationCombo({
  value,
  suggestions,
  onCommit,
  disabled,
  ariaLabel = 'Clasificación',
}: {
  value: string | null | undefined
  /** Valores ya usados en la sesión; se filtran según lo escrito. */
  suggestions: readonly string[]
  onCommit: (v: string) => void
  /** Sesión cerrada u otro bloqueo: solo lectura. */
  disabled?: boolean
  ariaLabel?: string
}) {
  const listIdRaw = useId()
  const listId = `clasif-dl-${listIdRaw.replace(/:/g, '')}`
  const normalized = (value ?? '').trim()
  const [text, setText] = useState(normalized)
  useEffect(() => {
    setText((value ?? '').trim())
  }, [value])

  const filteredOptions = useMemo(() => {
    const pool = [...new Set(suggestions)].sort((a, b) => a.localeCompare(b, 'es'))
    const q = text.trim().toLowerCase()
    if (q.length === 0) {
      return pool.slice(0, 50)
    }
    return pool.filter((s) => s.toLowerCase().includes(q)).slice(0, 50)
  }, [suggestions, text])

  return (
    <>
      <datalist id={listId}>
        {filteredOptions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <input
        type="text"
        className="clasif-input"
        list={listId}
        value={text}
        disabled={disabled}
        placeholder="Sin clasificar"
        autoComplete="off"
        onChange={(ev) => setText(ev.target.value)}
        onBlur={(ev) => {
          const t = ev.currentTarget.value.trim()
          if (t !== normalized) {
            onCommit(t)
          }
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') {
            ev.currentTarget.blur()
          }
        }}
        aria-label={ariaLabel}
      />
    </>
  )
}

function ConversationBubbleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PendingConversationButton({
  commentCount,
  onClick,
}: {
  commentCount?: number
  onClick: () => void
}) {
  const n = commentCount ?? 0
  const label = n > 0 ? `Abrir conversación, ${n} mensajes` : 'Abrir conversación'
  return (
    <button
      type="button"
      className="comment-thread-btn"
      onClick={onClick}
      title={n > 0 ? `Conversación (${n})` : 'Conversación'}
      aria-label={label}
    >
      <span className="comment-thread-btn-inner">
        <ConversationBubbleIcon className="comment-thread-svg" />
        {n > 0 && (
          <span className="comment-thread-badge">{n > 99 ? '99+' : n}</span>
        )}
      </span>
    </button>
  )
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PendingAttachmentButton({
  attachmentCount,
  onClick,
}: {
  attachmentCount?: number
  onClick: () => void
}) {
  const n = attachmentCount ?? 0
  const label = n > 0 ? `Adjuntos, ${n} archivos` : 'Adjuntar comprobante'
  return (
    <button
      type="button"
      className="comment-thread-btn attachment-thread-btn"
      onClick={onClick}
      title={n > 0 ? `Adjuntos (${n})` : 'Adjuntar PDF o imagen'}
      aria-label={label}
    >
      <span className="comment-thread-btn-inner">
        <PaperclipIcon className="comment-thread-svg" />
        {n > 0 && (
          <span className="comment-thread-badge">{n > 99 ? '99+' : n}</span>
        )}
      </span>
    </button>
  )
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageAttachment(a: MovementAttachmentDto): boolean {
  if (a.contentType && a.contentType.startsWith('image/')) return true
  const ext = a.originalFilename.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext ?? '')
}

function attachmentsListUrl(sessionId: number, side: 'bank' | 'company', txId: number): string {
  const p = side === 'bank' ? 'banco' : 'empresa'
  return `/api/v1/conciliacion/sessions/${sessionId}/pending/${p}/${txId}/adjuntos`
}

function attachmentFileUrl(
  sessionId: number,
  side: 'bank' | 'company',
  txId: number,
  attachmentId: number,
): string {
  const p = side === 'bank' ? 'banco' : 'empresa'
  return `/api/v1/conciliacion/sessions/${sessionId}/pending/${p}/${txId}/adjuntos/${attachmentId}/archivo`
}

function pairAttachmentsListUrl(sessionId: number, pairId: number): string {
  return `/api/v1/conciliacion/sessions/${sessionId}/pares/${pairId}/adjuntos`
}

function pairAttachmentFileUrl(sessionId: number, pairId: number, attachmentId: number): string {
  return `/api/v1/conciliacion/sessions/${sessionId}/pares/${pairId}/adjuntos/${attachmentId}/archivo`
}

/** Vista ampliada encima del modal de adjuntos; Escape o clic fuera cierra. La imagen se carga con Bearer (blob). */
function ImagePreviewLightbox({
  apiPath,
  filename,
  onClose,
}: {
  apiPath: string
  filename: string
  onClose: () => void
}) {
  const { blobUrl, loading, error } = useAuthenticatedBlobUrl(apiPath)

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="image-lightbox-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="image-lightbox-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Imagen ampliada"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="image-lightbox-close" onClick={onClose} aria-label="Cerrar vista ampliada">
          ×
        </button>
        <div className="image-lightbox-img-wrap">
          {loading && <p className="msg subtle">Cargando imagen…</p>}
          {error && <p className="msg err">{error}</p>}
          {!loading && !error && blobUrl ? (
            <img src={blobUrl} alt={filename} className="image-lightbox-img" />
          ) : null}
        </div>
        <div className="image-lightbox-footer">
          <span className="image-lightbox-filename">{filename}</span>
          <div className="image-lightbox-actions">
            <button
              type="button"
              className="btn-link image-lightbox-download"
              onClick={() => void downloadAuthenticatedFile(apiPath, filename)}
            >
              Descargar
            </button>
            <button
              type="button"
              className="btn-link image-lightbox-download"
              onClick={() =>
                void openAuthenticatedFileInNewTab(apiPath).catch(() => {
                  /* popup bloqueado u otro error */
                })
              }
            >
              Abrir en pestaña nueva
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AttachmentImageThumb({ path, title }: { path: string; title: string }) {
  const { blobUrl, loading, error } = useAuthenticatedBlobUrl(path)
  if (error) return <p className="msg err subtle attachment-preview-err">{error}</p>
  if (loading || !blobUrl) {
    return <div className="attachment-preview-placeholder">Cargando vista previa…</div>
  }
  return <img className="attachment-preview-img" src={blobUrl} alt="" loading="lazy" title={title} />
}

type PendingAttachmentSidePanelProps =
  | {
      kind: 'movement'
      sessionId: number
      side: 'bank' | 'company'
      txId: number
      sessionClosed: boolean
      onAfterChange: () => void
      showSideHeading: boolean
    }
  | {
      kind: 'pair'
      sessionId: number
      pairId: number
      sessionClosed: boolean
      onAfterChange: () => void
    }

function PendingAttachmentSidePanel(props: PendingAttachmentSidePanelProps) {
  const [items, setItems] = useState<MovementAttachmentDto[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [imageLightbox, setImageLightbox] = useState<{ apiPath: string; filename: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const listUrl =
    props.kind === 'pair'
      ? pairAttachmentsListUrl(props.sessionId, props.pairId)
      : attachmentsListUrl(props.sessionId, props.side, props.txId)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setFetchError(null)
      setActionError(null)
      try {
        const r = await apiFetch(listUrl)
        if (!r.ok) throw new Error(await parseError(r))
        const data = (await r.json()) as MovementAttachmentDto[]
        if (!cancelled) setItems(data)
      } catch (e) {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [listUrl])

  async function handleFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file || props.sessionClosed) return
    setUploading(true)
    setActionError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await apiFetch(listUrl, {
        method: 'POST',
        body: fd,
      })
      if (!r.ok) throw new Error(await parseError(r))
      const created = (await r.json()) as MovementAttachmentDto
      setItems((prev) => [...prev, created])
      props.onAfterChange()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: number) {
    if (props.sessionClosed) return
    setActionError(null)
    try {
      const r = await apiFetch(`${listUrl}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(await parseError(r))
      setItems((prev) => prev.filter((x) => x.id !== id))
      props.onAfterChange()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    }
  }

  function fileUrlFor(a: MovementAttachmentDto): string {
    if (props.kind === 'pair') {
      return pairAttachmentFileUrl(props.sessionId, props.pairId, a.id)
    }
    return attachmentFileUrl(props.sessionId, props.side, props.txId, a.id)
  }

  const showSideHeading = props.kind === 'movement' && props.showSideHeading

  return (
    <>
      <div className={showSideHeading ? 'pair-thread-section' : undefined}>
        {showSideHeading && props.kind === 'movement' ? (
          <h4 className="pair-thread-heading">
            {props.side === 'bank' ? 'Banco' : 'Empresa'} · ID {props.txId}
          </h4>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          className="attachment-file-input"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*"
          tabIndex={-1}
          onChange={(e) => void handleFile(e)}
        />
        <div className="comment-thread-scroll attachment-thread-scroll">
          {loading && <p className="msg subtle">Cargando…</p>}
          {!loading && fetchError && <p className="msg err">{fetchError}</p>}
          {!loading && !fetchError && items.length === 0 && (
            <p className="msg subtle">Todavía no hay archivos. Subí un comprobante con el botón de abajo.</p>
          )}
          {!loading &&
            !fetchError &&
            items.map((a) => {
              const fileUrl = fileUrlFor(a)
              return (
                <article key={a.id} className="comment-bubble attachment-article">
                  <div className="attachment-row">
                    <div className="attachment-row-head">
                      <a
                        className="attachment-download-link"
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          void downloadAuthenticatedFile(fileUrl, a.originalFilename).catch((err) => {
                            setActionError(err instanceof Error ? err.message : String(err))
                          })
                        }}
                      >
                        {a.originalFilename}
                      </a>
                      <span className="attachment-meta">
                        <span className="attachment-meta-user">{formatCommentAuthor(a.createdByUsername)}</span>
                        {' · '}
                        {formatAttachmentSize(a.sizeBytes)} · {formatCommentWhen(a.createdAt)}
                      </span>
                    </div>
                    {!props.sessionClosed && (
                      <button
                        type="button"
                        className="btn-link danger attachment-delete"
                        onClick={() => void handleDelete(a.id)}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  {isImageAttachment(a) && (
                    <button
                      type="button"
                      className="attachment-preview-trigger"
                      title="Ver en grande"
                      aria-label={`Ver en grande: ${a.originalFilename}`}
                      onClick={() => setImageLightbox({ apiPath: fileUrl, filename: a.originalFilename })}
                    >
                      <AttachmentImageThumb path={fileUrl} title={`Ver en grande: ${a.originalFilename}`} />
                    </button>
                  )}
                </article>
              )
            })}
        </div>
        <div className="comment-modal-form attachment-modal-footer">
          {actionError && <p className="msg err comment-modal-form-err">{actionError}</p>}
          <button
            type="button"
            className="btn-import"
            disabled={props.sessionClosed || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Subiendo…' : 'Elegir archivo…'}
          </button>
        </div>
      </div>
      {imageLightbox ? (
        <ImagePreviewLightbox
          apiPath={imageLightbox.apiPath}
          filename={imageLightbox.filename}
          onClose={() => setImageLightbox(null)}
        />
      ) : null}
    </>
  )
}

function PendingAttachmentsModal({
  sessionId,
  target,
  sessionClosed,
  onClose,
  onAfterChange,
}: {
  sessionId: number
  target: PendingAttachmentTarget | null
  sessionClosed: boolean
  onClose: () => void
  onAfterChange: () => void
}) {
  const open = target != null

  useEffect(() => {
    if (!open) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return
      if (document.querySelector('.image-lightbox-backdrop')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || target == null) return null

  if (target.kind === 'pair') {
    return (
      <div className="comment-modal-backdrop" role="presentation" onClick={onClose}>
        <div
          className="comment-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="attachment-modal-title"
          onClick={(ev) => ev.stopPropagation()}
        >
          <header className="comment-modal-head">
            <h3 id="attachment-modal-title">Adjuntos del movimiento conciliado</h3>
            <button type="button" className="comment-modal-close" onClick={onClose} aria-label="Cerrar">
              ×
            </button>
          </header>
          <p className="comment-modal-hint">
            Un solo lugar para comprobantes de esta operación (banco + empresa). PDF o imagen (PNG, JPG, WEBP, GIF),
            máx. 20 MB.
          </p>
          {sessionClosed && (
            <p className="msg subtle comment-modal-readonly">Sesión cerrada: solo lectura y descarga.</p>
          )}
          <PendingAttachmentSidePanel
            kind="pair"
            sessionId={sessionId}
            pairId={target.pairId}
            sessionClosed={sessionClosed}
            onAfterChange={onAfterChange}
          />
        </div>
      </div>
    )
  }

  const sideLabel = target.side === 'bank' ? 'Banco' : 'Empresa'

  return (
    <div className="comment-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="comment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attachment-modal-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="comment-modal-head">
          <h3 id="attachment-modal-title">
            Adjuntos · {sideLabel} · ID {target.txId}
          </h3>
          <button type="button" className="comment-modal-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <p className="comment-modal-hint">
          PDF o imagen (PNG, JPG, WEBP, GIF), máx. 20 MB. Los archivos se guardan en el equipo donde corre el
          servidor.
        </p>
        {sessionClosed && (
          <p className="msg subtle comment-modal-readonly">Sesión cerrada: solo lectura y descarga.</p>
        )}
        <PendingAttachmentSidePanel
          kind="movement"
          sessionId={sessionId}
          side={target.side}
          txId={target.txId}
          sessionClosed={sessionClosed}
          onAfterChange={onAfterChange}
          showSideHeading={false}
        />
      </div>
    </div>
  )
}

function PendingCommentSidePanel({
  sessionId,
  side,
  txId,
  sessionClosed,
  onAfterChange,
  showSideHeading,
}: {
  sessionId: number
  side: 'bank' | 'company'
  txId: number
  sessionClosed: boolean
  onAfterChange: () => void
  showSideHeading: boolean
}) {
  const [items, setItems] = useState<PendingCommentDto[]>([])
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [draft, setDraft] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [postError, setPostError] = useState<string | null>(null)
  const threadScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft('')
    setPostError(null)
  }, [side, txId])

  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = threadScrollRef.current
    if (!el) return
    const run = () => {
      el.scrollTo({ top: el.scrollHeight, behavior })
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(run)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setFetchError(null)
      setPostError(null)
      try {
        const path = side === 'bank' ? 'banco' : 'empresa'
        const r = await apiFetch(
          `/api/v1/conciliacion/sessions/${sessionId}/pending/${path}/${txId}/comentarios`,
        )
        if (!r.ok) throw new Error(await parseError(r))
        const data = (await r.json()) as PendingCommentDto[]
        if (!cancelled) setItems(data)
      } catch (e) {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sessionId, side, txId])

  useEffect(() => {
    if (loading) return
    scrollThreadToBottom('smooth')
  }, [loading, items, scrollThreadToBottom])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (sessionClosed) return
    const text = draft.trim()
    if (!text) return
    setPosting(true)
    setPostError(null)
    try {
      const path = side === 'bank' ? 'banco' : 'empresa'
      const r = await apiFetch(
        `/api/v1/conciliacion/sessions/${sessionId}/pending/${path}/${txId}/comentarios`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        },
      )
      if (!r.ok) throw new Error(await parseError(r))
      const created = (await r.json()) as PendingCommentDto
      setItems((prev) => [...prev, created])
      setDraft('')
      onAfterChange()
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  const sideLabel = side === 'bank' ? 'Banco' : 'Empresa'

  return (
    <div className={showSideHeading ? 'pair-thread-section' : undefined}>
      {showSideHeading ? (
        <h4 className="pair-thread-heading">
          {sideLabel} · ID {txId}
        </h4>
      ) : null}
      <div ref={threadScrollRef} className="comment-thread-scroll" tabIndex={0}>
        {loading && <p className="msg subtle">Cargando…</p>}
        {!loading && fetchError && <p className="msg err">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && (
          <p className="msg subtle">Todavía no hay mensajes. Escribí uno abajo.</p>
        )}
        {!loading &&
          !fetchError &&
          items.map((c) => (
            <article key={c.id} className="comment-bubble">
              <div className="comment-bubble-meta">
                <span className="comment-bubble-author">{formatCommentAuthor(c.createdByUsername)}</span>
                <time className="comment-bubble-time" dateTime={c.createdAt}>
                  {formatCommentWhen(c.createdAt)}
                </time>
              </div>
              <p className="comment-bubble-body">{c.body}</p>
            </article>
          ))}
      </div>
      <form className="comment-modal-form" onSubmit={(e) => void handleSubmit(e)}>
        <label className="comment-modal-label">
          <span>Nuevo mensaje</span>
          <textarea
            className="comment-modal-input"
            rows={showSideHeading ? 3 : 4}
            value={draft}
            disabled={sessionClosed || posting}
            onChange={(ev) => setDraft(ev.target.value)}
            placeholder="Ej.: lo vimos con contaduría el 12/4…"
            maxLength={4000}
          />
        </label>
        {postError && <p className="msg err comment-modal-form-err">{postError}</p>}
        <div className="comment-modal-actions">
          <button
            type="submit"
            className="btn-import"
            disabled={sessionClosed || posting || draft.trim() === ''}
          >
            {posting ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function PairCommentPanel({
  sessionId,
  pairId,
  sessionClosed,
  onAfterChange,
}: {
  sessionId: number
  pairId: number
  sessionClosed: boolean
  onAfterChange: () => void
}) {
  const [items, setItems] = useState<PendingCommentDto[]>([])
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [draft, setDraft] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [postError, setPostError] = useState<string | null>(null)
  const threadScrollRef = useRef<HTMLDivElement>(null)

  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = threadScrollRef.current
    if (!el) return
    const run = () => {
      el.scrollTo({ top: el.scrollHeight, behavior })
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(run)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setFetchError(null)
      setPostError(null)
      try {
        const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/pairs/${pairId}/comentarios`)
        if (!r.ok) throw new Error(await parseError(r))
        const data = (await r.json()) as PendingCommentDto[]
        if (!cancelled) setItems(data)
      } catch (e) {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sessionId, pairId])

  useEffect(() => {
    if (loading) return
    scrollThreadToBottom('smooth')
  }, [loading, items, scrollThreadToBottom])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (sessionClosed) return
    const text = draft.trim()
    if (!text) return
    setPosting(true)
    setPostError(null)
    try {
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/pairs/${pairId}/comentarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!r.ok) throw new Error(await parseError(r))
      const created = (await r.json()) as PendingCommentDto
      setItems((prev) => [...prev, created])
      setDraft('')
      onAfterChange()
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  return (
    <div>
      <div ref={threadScrollRef} className="comment-thread-scroll" tabIndex={0}>
        {loading && <p className="msg subtle">Cargando…</p>}
        {!loading && fetchError && <p className="msg err">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && (
          <p className="msg subtle">Todavía no hay mensajes. Escribí uno abajo.</p>
        )}
        {!loading &&
          !fetchError &&
          items.map((c) => (
            <article key={c.id} className="comment-bubble">
              <div className="comment-bubble-meta">
                <span className="comment-bubble-author">{formatCommentAuthor(c.createdByUsername)}</span>
                <time className="comment-bubble-time" dateTime={c.createdAt}>
                  {formatCommentWhen(c.createdAt)}
                </time>
              </div>
              <p className="comment-bubble-body">{c.body}</p>
            </article>
          ))}
      </div>
      <form className="comment-modal-form" onSubmit={(e) => void handleSubmit(e)}>
        <label className="comment-modal-label">
          <span>Nuevo mensaje</span>
          <textarea
            className="comment-modal-input"
            rows={4}
            value={draft}
            disabled={sessionClosed || posting}
            onChange={(ev) => setDraft(ev.target.value)}
            placeholder="Ej.: lo vimos con contaduría el 12/4…"
            maxLength={4000}
          />
        </label>
        {postError && <p className="msg err comment-modal-form-err">{postError}</p>}
        <div className="comment-modal-actions">
          <button
            type="submit"
            className="btn-import"
            disabled={sessionClosed || posting || draft.trim() === ''}
          >
            {posting ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function PendingCommentsModal({
  sessionId,
  target,
  sessionClosed,
  onClose,
  onAfterChange,
}: {
  sessionId: number
  target: PendingThreadTarget | null
  sessionClosed: boolean
  onClose: () => void
  onAfterChange: () => void
}) {
  const open = target != null

  useEffect(() => {
    if (!open) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || target == null) return null

  if (target.kind === 'pair') {
    return (
      <div className="comment-modal-backdrop" role="presentation" onClick={onClose}>
        <div
          className="comment-modal comment-modal--pair"
          role="dialog"
          aria-modal="true"
          aria-labelledby="comment-modal-title"
          onClick={(ev) => ev.stopPropagation()}
        >
          <header className="comment-modal-head">
            <h3 id="comment-modal-title">Comentarios del par conciliado</h3>
            <button type="button" className="comment-modal-close" onClick={onClose} aria-label="Cerrar">
              ×
            </button>
          </header>
          <p className="comment-modal-hint">
            Un solo hilo por fila conciliada (par).
          </p>
          {sessionClosed && (
            <p className="msg subtle comment-modal-readonly">Sesión cerrada: solo lectura.</p>
          )}
          <PairCommentPanel
            sessionId={sessionId}
            pairId={target.pairId}
            sessionClosed={sessionClosed}
            onAfterChange={onAfterChange}
          />
        </div>
      </div>
    )
  }

  const sideLabel = target.side === 'bank' ? 'Banco' : 'Empresa'

  return (
    <div className="comment-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="comment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="comment-modal-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="comment-modal-head">
          <h3 id="comment-modal-title">
            Conversación · {sideLabel} · ID {target.txId}
          </h3>
          <button type="button" className="comment-modal-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <p className="comment-modal-hint">
          El historial queda guardado en esta sesión junto al movimiento (conciliado o pendiente).
        </p>
        {sessionClosed && (
          <p className="msg subtle comment-modal-readonly">Sesión cerrada: solo lectura.</p>
        )}
        <PendingCommentSidePanel
          sessionId={sessionId}
          side={target.side}
          txId={target.txId}
          sessionClosed={sessionClosed}
          onAfterChange={onAfterChange}
          showSideHeading={false}
        />
      </div>
    </div>
  )
}

function ComparisonTable({
  rows,
  allRowsCount,
  selectedId,
  sessionClosed,
  classificationReadOnly,
  sessionAmountTolerance,
  classificationSuggestions,
  onDeleteManual,
  onSetClassification,
  onSetPairClassification,
  onOpenPendingComments,
  onOpenPendingAttachments,
}: {
  rows: ComparisonRow[]
  /** Total sin filtrar; si es 0 la sesión está vacía. */
  allRowsCount: number
  selectedId: number | null
  /** Sesión cerrada: oculta «Quitar» y bloquea clasificación en pendientes. */
  sessionClosed: boolean
  /** Sesión cerrada o rol solo consulta: inputs de clasificación deshabilitados. */
  classificationReadOnly: boolean
  /** Tolerancia de importe guardada en sesión (0 es válido). */
  sessionAmountTolerance: number | null | undefined
  /** Clasificaciones ya usadas en la sesión (sugerencias al escribir). */
  classificationSuggestions: readonly string[]
  onDeleteManual: (pairId: number) => void
  onSetClassification: (side: 'bank' | 'company', txId: number, classification: string) => void
  /** Una sola clasificación por fila de par conciliado. */
  onSetPairClassification: (pairId: number, classification: string) => void
  /** Conversación archivada por movimiento pendiente o por par (un solo control por fila conciliada). */
  onOpenPendingComments?: (target: PendingThreadTarget) => void
  /** Comprobantes adjuntos al pendiente o al par. */
  onOpenPendingAttachments?: (target: PendingAttachmentTarget) => void
}) {
  return (
    <div className="table-wrap compare-table-wrap table-wrap--scrollY">
      <table className="data-table compare-table">
        <thead>
          <tr>
            <th rowSpan={2} className="rownum-th" aria-label="Número de fila">
              #
            </th>
            <th rowSpan={2} className="compare-th-tipo">
              Estado
            </th>
            <th colSpan={4} className="compare-th-group">
              Banco
            </th>
            <th colSpan={4} className="compare-th-group">
              Empresa
            </th>
            <th rowSpan={2} className="compare-th-delta" title="Diferencia de importe (empresa − banco)">
              Δ
            </th>
            <th rowSpan={2} className="compare-th-clasif">
              Clasif.
            </th>
            <th rowSpan={2} className="compare-th-notes" scope="col" title="Comentarios y adjuntos (par o pendiente)">
              Notas
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
              <td colSpan={14} className="compare-empty">
                {allRowsCount === 0
                  ? 'No hay movimientos en esta sesión.'
                  : 'No hay filas que coincidan. Probá «Todos», ampliá fechas, vaciá el buscador o el filtro de clasificación, o cambiá el texto.'}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => {
              const cls = rowClassForComparison(row, sessionAmountTolerance)
              if (row.kind === 'pair') {
                const { pair, bank, company } = row
                const delta = coerceAmount(company.amount) - coerceAmount(bank.amount)
                const deltaStr =
                  Math.abs(delta) < 1e-9 ? '0' : delta.toFixed(2)
                const estado = pairEstadoMeta(pair, bank, company, sessionAmountTolerance)
                return (
                  <tr key={row.key} className={cls}>
                    <td className="rownum-td">{idx + 1}</td>
                    <td className="compare-td-tipo">
                      <span className={estado.badgeClass}>{estado.label}</span>
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
                    <td className="compare-delta">{deltaStr}</td>
                    <td className="compare-td-clasif-pair">
                      <ClassificationCombo
                        value={pair.classification ?? undefined}
                        suggestions={classificationSuggestions}
                        disabled={classificationReadOnly}
                        ariaLabel="Clasificación del par conciliado"
                        onCommit={(v) => onSetPairClassification(pair.pairId, v)}
                      />
                    </td>
                    <td className="compare-td-notes">
                      <div className="compare-pending-tools">
                        {onOpenPendingComments ? (
                          <PendingConversationButton
                            commentCount={pair.pairCommentCount ?? 0}
                            onClick={() =>
                              onOpenPendingComments({
                                kind: 'pair',
                                pairId: pair.pairId,
                              })
                            }
                          />
                        ) : null}
                        {onOpenPendingAttachments ? (
                          <PendingAttachmentButton
                            attachmentCount={pair.pairAttachmentCount ?? 0}
                            onClick={() =>
                              onOpenPendingAttachments({
                                kind: 'pair',
                                pairId: pair.pairId,
                              })
                            }
                          />
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {pair.matchSource === 'MANUAL' && selectedId != null && !sessionClosed && (
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
                    <td className="rownum-td">{idx + 1}</td>
                    <td className="compare-td-tipo compare-td-tipo--stack">
                      <span className="compare-badge compare-badge--estado compare-badge--warn">
                        Pendiente banco
                      </span>
                      {m.duplicateInFile && (
                        <span className="compare-badge compare-badge--estado compare-badge--dup">
                          Duplicado
                        </span>
                      )}
                      {m.fuzzyHint && (
                        <span className="compare-fuzzy-hint" title={m.fuzzyHint ?? undefined}>
                          {m.fuzzyHint}
                        </span>
                      )}
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
                    <td className="compare-muted">—</td>
                    <td>
                      <ClassificationCombo
                        value={m.pendingClassification}
                        suggestions={classificationSuggestions}
                        disabled={classificationReadOnly}
                        ariaLabel="Clasificación pendiente banco"
                        onCommit={(v) => onSetClassification('bank', m.id, v)}
                      />
                    </td>
                    <td className="compare-td-notes">
                      <div className="compare-pending-tools">
                        {onOpenPendingComments ? (
                          <PendingConversationButton
                            commentCount={m.commentCount}
                            onClick={() =>
                              onOpenPendingComments({ kind: 'single', side: 'bank', txId: m.id })
                            }
                          />
                        ) : null}
                        {onOpenPendingAttachments ? (
                          <PendingAttachmentButton
                            attachmentCount={m.attachmentCount}
                            onClick={() =>
                              onOpenPendingAttachments({ kind: 'single', side: 'bank', txId: m.id })
                            }
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="compare-muted">—</td>
                  </tr>
                )
              }
              const { m } = row
              return (
                <tr key={row.key} className={cls}>
                  <td className="rownum-td">{idx + 1}</td>
                  <td className="compare-td-tipo compare-td-tipo--stack">
                    <span className="compare-badge compare-badge--estado compare-badge--company">
                      Pendiente empresa
                    </span>
                    {m.duplicateInFile && (
                      <span className="compare-badge compare-badge--estado compare-badge--dup">
                        Duplicado
                      </span>
                    )}
                    {m.fuzzyHint && (
                      <span className="compare-fuzzy-hint" title={m.fuzzyHint ?? undefined}>
                        {m.fuzzyHint}
                      </span>
                    )}
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
                  <td className="compare-muted">—</td>
                  <td>
                    <ClassificationCombo
                      value={m.pendingClassification}
                      suggestions={classificationSuggestions}
                      disabled={classificationReadOnly}
                      ariaLabel="Clasificación pendiente empresa"
                      onCommit={(v) => onSetClassification('company', m.id, v)}
                    />
                  </td>
                  <td className="compare-td-notes">
                    <div className="compare-pending-tools">
                      {onOpenPendingComments ? (
                        <PendingConversationButton
                          commentCount={m.commentCount}
                          onClick={() =>
                            onOpenPendingComments({ kind: 'single', side: 'company', txId: m.id })
                          }
                        />
                      ) : null}
                      {onOpenPendingAttachments ? (
                        <PendingAttachmentButton
                          attachmentCount={m.attachmentCount}
                          onClick={() =>
                            onOpenPendingAttachments({ kind: 'single', side: 'company', txId: m.id })
                          }
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="compare-muted">—</td>
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
        <span className="compare-swatch compare-swatch--amount-gap" aria-hidden /> Δ importe / ajuste
      </span>
      <span className="complete-legend-item">
        <span className="compare-swatch compare-swatch--opp-sign" aria-hidden /> Signo incorrecto
      </span>
      <span className="complete-legend-item">
        <span className="compare-swatch compare-swatch--pend-bank" aria-hidden /> Pendiente banco
      </span>
      <span className="complete-legend-item">
        <span className="compare-swatch compare-swatch--pend-company" aria-hidden /> Pendiente empresa
      </span>
      <span className="complete-legend-item">
        <span className="compare-swatch compare-swatch--fuzzy" aria-hidden /> Posible match
      </span>
      <span className="complete-legend-item">
        <span className="compare-swatch compare-swatch--duplicate" aria-hidden /> Duplicado
      </span>
    </div>
  )
}

function MovimientosTable({
  title,
  rows,
  classificationSuggestions,
  onClassificationChange,
  classificationLocked,
  onOpenPendingComments,
  onOpenPendingAttachments,
}: {
  title: string
  rows: MovimientoDto[]
  classificationSuggestions: readonly string[]
  /** Pendientes: columna «Clasif.» con el mismo criterio que en comparativa / vista completa. */
  onClassificationChange?: (txId: number, classification: string) => void
  /** Sesión cerrada o rol solo consulta: selector deshabilitado. */
  classificationLocked?: boolean
  /** Conversación archivada en el pendiente. */
  onOpenPendingComments?: (txId: number) => void
  onOpenPendingAttachments?: (txId: number) => void
}) {
  if (rows.length === 0) {
    return (
      <p className="msg subtle">
        {title}: ninguno.
      </p>
    )
  }
  const showClassif = onClassificationChange != null
  const showNotes = onOpenPendingComments != null
  const showAttach = onOpenPendingAttachments != null
  return (
    <>
      <h3 className="subsection-title">
        {title} ({rows.length})
      </h3>
      <div className="table-wrap table-wrap--scrollY">
        <table className="data-table">
          <thead>
            <tr>
              <th className="rownum-th" aria-label="Número de fila">
                #
              </th>
              <th>ID</th>
              <th>Fecha</th>
              <th>Importe</th>
              <th>Referencia</th>
              <th>Descripción</th>
              {showClassif && <th className="mov-clasif-th">Clasif.</th>}
              {showNotes && (
                <th className="mov-notes-th" scope="col" aria-label="Comentarios del pendiente">
                  <ConversationBubbleIcon className="comment-thread-svg comment-thread-svg--th" />
                </th>
              )}
              {showAttach && (
                <th className="mov-notes-th" scope="col" aria-label="Adjuntos">
                  <PaperclipIcon className="comment-thread-svg comment-thread-svg--th" />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((m, idx) => (
              <tr key={m.id}>
                <td className="rownum-td">{idx + 1}</td>
                <td>{m.id}</td>
                <td className="cell-date-nowrap">{formatDisplayDate(m.txDate)}</td>
                <td>{m.amount}</td>
                <td className="cell-desc">{m.reference ?? '—'}</td>
                <td className="cell-desc">{m.description ?? '—'}</td>
                {showClassif && onClassificationChange && (
                  <td className="mov-clasif-td">
                    <ClassificationCombo
                      value={m.pendingClassification}
                      suggestions={classificationSuggestions}
                      disabled={classificationLocked}
                      onCommit={(v) => onClassificationChange(m.id, v)}
                    />
                  </td>
                )}
                {showNotes && onOpenPendingComments && (
                  <td className="mov-notes-td">
                    <PendingConversationButton
                      commentCount={m.commentCount}
                      onClick={() => onOpenPendingComments(m.id)}
                    />
                  </td>
                )}
                {showAttach && onOpenPendingAttachments && (
                  <td className="mov-notes-td">
                    <PendingAttachmentButton
                      attachmentCount={m.attachmentCount}
                      onClick={() => onOpenPendingAttachments(m.id)}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function ConciliacionPage() {
  const { user } = useAuth()
  const [bankFile, setBankFile] = useState<File | null>(null)
  const [companyFile, setCompanyFile] = useState<File | null>(null)
  const [useCustomImportLayout, setUseCustomImportLayout] = useState(false)
  const [importBankLayoutExcel, setImportBankLayoutExcel] = useState<ImportBankLayoutExcel>(() => ({
    ...DEFAULT_IMPORT_BANK_LAYOUT_EXCEL,
  }))
  const [importCompanyLayoutExcel, setImportCompanyLayoutExcel] =
    useState<ImportCompanyLayoutExcel>(() => ({
      ...DEFAULT_IMPORT_COMPANY_LAYOUT_EXCEL,
    }))
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [sessionListPage, setSessionListPage] = useState(0)
  const [sessionListTotalPages, setSessionListTotalPages] = useState(0)
  const [sessionListTotalElements, setSessionListTotalElements] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [toleranceDays, setToleranceDays] = useState(3)
  const [amountTolerance, setAmountTolerance] = useState(0.01)
  const [amountToleranceText, setAmountToleranceText] = useState(() =>
    formatToleranceInputDisplay(0.01),
  )
  const [conciliarLoading, setConciliarLoading] = useState(false)
  const [conciliarResult, setConciliarResult] = useState<ConciliacionRunResult | null>(null)
  const [conciliarError, setConciliarError] = useState<string | null>(null)

  const [manualBankId, setManualBankId] = useState('')
  const [manualCompanyId, setManualCompanyId] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [closeSessionLoading, setCloseSessionLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [detailLayout, setDetailLayout] = useState<'classic' | 'compare' | 'complete'>('compare')
  const [compareFilter, setCompareFilter] = useState<CompareFilterKind>('all')
  const [compareDateFrom, setCompareDateFrom] = useState('')
  const [compareDateTo, setCompareDateTo] = useState('')
  const [compareSearchQuery, setCompareSearchQuery] = useState('')
  const [compareClassificationFilter, setCompareClassificationFilter] = useState('')

  const [commentTarget, setCommentTarget] = useState<PendingThreadTarget | null>(null)
  const [attachmentTarget, setAttachmentTarget] = useState<PendingAttachmentTarget | null>(null)

  /** Si el GET del detalle aún no trae `amountTolerance`, usamos la del POST /conciliar reciente. */
  const [pendingSessionTolerance, setPendingSessionTolerance] = useState<number | null>(null)

  const effectiveSessionAmountTolerance = useMemo(() => {
    const raw = detail?.session.amountTolerance
    if (raw !== undefined && raw !== null) return raw
    return pendingSessionTolerance ?? undefined
  }, [detail?.session.amountTolerance, pendingSessionTolerance])

  const comparisonRows = useMemo(
    () =>
      detail ? buildComparisonRows(detail, effectiveSessionAmountTolerance) : [],
    [detail, effectiveSessionAmountTolerance],
  )

  const compareCounts = useMemo(
    () => compareFilterCounts(comparisonRows, effectiveSessionAmountTolerance),
    [comparisonRows, effectiveSessionAmountTolerance],
  )

  const rowsAfterLegendAndDate = useMemo(
    () =>
      comparisonRows.filter(
        (r) =>
          rowMatchesFilter(r, compareFilter, effectiveSessionAmountTolerance) &&
          rowMatchesDateRange(r, compareDateFrom, compareDateTo),
      ),
    [
      comparisonRows,
      compareFilter,
      compareDateFrom,
      compareDateTo,
      effectiveSessionAmountTolerance,
    ],
  )

  const filteredComparisonRows = useMemo(
    () =>
      rowsAfterLegendAndDate.filter(
        (r) =>
          rowMatchesSearch(r, compareSearchQuery) &&
          rowMatchesClassification(r, compareClassificationFilter),
      ),
    [rowsAfterLegendAndDate, compareSearchQuery, compareClassificationFilter],
  )

  const filteredChronologicalRows = useMemo(
    () => sortRowsChronologically(filteredComparisonRows),
    [filteredComparisonRows],
  )

  /** Misma lógica que Comparativa/Completa: estado + rango de fechas → tablas clásicas. */
  const classicFilteredPairRows = useMemo(
    () =>
      filteredComparisonRows.filter(
        (r): r is Extract<ComparisonRow, { kind: 'pair' }> => r.kind === 'pair',
      ),
    [filteredComparisonRows],
  )

  const classicFilteredUnmatchedBank = useMemo(
    () =>
      filteredComparisonRows
        .filter((r) => r.kind === 'unmatchedBank')
        .map((r) => r.m),
    [filteredComparisonRows],
  )

  const classicFilteredUnmatchedCompany = useMemo(
    () =>
      filteredComparisonRows
        .filter((r) => r.kind === 'unmatchedCompany')
        .map((r) => r.m),
    [filteredComparisonRows],
  )

  const classificationSuggestions = useMemo(() => {
    if (!detail) return []
    const s = new Set<string>()
    for (const t of detail.bankTransactions) {
      const c = t.pendingClassification?.trim()
      if (c) s.add(c)
    }
    for (const t of detail.companyTransactions) {
      const c = t.pendingClassification?.trim()
      if (c) s.add(c)
    }
    for (const p of detail.pairs) {
      const c = p.classification?.trim()
      if (c) s.add(c)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'))
  }, [detail])

  const compareRowFilterActive =
    compareFilter !== 'all' ||
    compareDateFrom !== '' ||
    compareDateTo !== '' ||
    compareSearchQuery.trim() !== '' ||
    compareClassificationFilter.trim() !== ''

  const detailMatchesSelection =
    selectedId != null && detail != null && detail.session.id === selectedId
  const sessionClosed = detailMatchesSelection && detail.session.status === 'CLOSED'
  /** Consulta: solo lectura en clasificación (además de sesión cerrada). */
  const classificationReadOnly = sessionClosed || user?.role === 'CONSULTA'
  const reconcileLocked =
    detailLoading || (detailMatchesSelection && detail.session.status === 'CLOSED')

  const downloadSessionExcel = useCallback(async (sessionId: number) => {
    setExportError(null)
    setExportLoading(true)
    try {
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/export.xlsx`)
      if (!r.ok) throw new Error(await parseError(r))
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `conciliacion-sesion-${sessionId}.xlsx`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    } finally {
      setExportLoading(false)
    }
  }, [])

  const loadSessionListPage = useCallback(async (page: number) => {
    setSessionsError(null)
    try {
      const q = new URLSearchParams({
        page: String(page),
        size: String(SESSION_HISTORY_PAGE_SIZE),
      })
      const r = await apiFetch(`/api/v1/conciliacion/sessions?${q}`)
      if (!r.ok) throw new Error(await parseError(r))
      const data = (await r.json()) as PageSessions
      setSessions(data.content ?? [])
      setSessionListPage(data.number ?? page)
      setSessionListTotalPages(data.totalPages ?? 0)
      setSessionListTotalElements(data.totalElements ?? 0)
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
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${id}`)
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
    void loadSessionListPage(0)
  }, [loadSessionListPage])

  useEffect(() => {
    if (importResult?.sessionId != null) {
      setSelectedId(importResult.sessionId)
      void loadSessionListPage(0)
    }
  }, [importResult, loadSessionListPage])

  useEffect(() => {
    if (selectedId != null) {
      void loadDetail(selectedId)
    } else {
      setDetail(null)
    }
  }, [selectedId, loadDetail])

  useEffect(() => {
    setCompareFilter('all')
    setCompareDateFrom('')
    setCompareDateTo('')
    setCompareSearchQuery('')
    setCompareClassificationFilter('')
    setCommentTarget(null)
    setAttachmentTarget(null)
    setPendingSessionTolerance(null)
  }, [selectedId])

  useEffect(() => {
    const raw = detail?.session.amountTolerance
    if (raw !== undefined && raw !== null) {
      setPendingSessionTolerance(null)
    }
  }, [detail?.session.id, detail?.session.amountTolerance])

  useEffect(() => {
    setExportError(null)
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
      if (useCustomImportLayout) {
        const bankApi = bankLayoutExcelToApi(importBankLayoutExcel)
        const companyApi = companyLayoutExcelToApi(importCompanyLayoutExcel)
        fd.append(
          'layout',
          JSON.stringify({
            bank: bankApi,
            company: companyApi,
          }),
        )
      }
      const r = await apiFetch('/api/v1/conciliacion/import', {
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
    const y = window.scrollY
    try {
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${selectedId}/pares`, {
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
      await loadDetail(selectedId, { soft: true })
      await loadSessionListPage(sessionListPage)
      requestAnimationFrame(() => window.scrollTo({ top: y }))
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e))
    } finally {
      setManualLoading(false)
    }
  }

  async function handleDeleteManualPair(pairId: number) {
    if (selectedId == null) return
    if (!window.confirm('¿Quitar este vínculo manual?')) return
    const y = window.scrollY
    try {
      const r = await apiFetch(
        `/api/v1/conciliacion/sessions/${selectedId}/pares/${pairId}`,
        { method: 'DELETE' },
      )
      if (!r.ok) throw new Error(await parseError(r))
      await loadDetail(selectedId, { soft: true })
      await loadSessionListPage(sessionListPage)
      requestAnimationFrame(() => window.scrollTo({ top: y }))
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleCloseSession() {
    if (selectedId == null) return
    if (
      !window.confirm(
        '¿Cerrar esta sesión? Quedarán fijos los saldos, la clasificación de pendientes y no podrás ejecutar conciliación automática ni modificar vínculos manuales.',
      )
    ) {
      return
    }
    setCloseSessionLoading(true)
    setDetailError(null)
    try {
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${selectedId}/cierre`, {
        method: 'POST',
      })
      if (!r.ok) throw new Error(await parseError(r))
      await loadDetail(selectedId, { soft: true })
      await loadSessionListPage(sessionListPage)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e))
    } finally {
      setCloseSessionLoading(false)
    }
  }

  async function handleConciliar() {
    if (selectedId == null) return
    setConciliarLoading(true)
    setConciliarError(null)
    setConciliarResult(null)
    try {
      const parsedTol = parseBalanceInput(amountToleranceText)
      if (parsedTol != null && parsedTol >= 0) {
        setAmountTolerance(parsedTol)
        setAmountToleranceText(formatToleranceInputDisplay(parsedTol))
      }
      const q = new URLSearchParams({
        dateToleranceDays: String(toleranceDays),
        amountTolerance: String(
          parsedTol != null && parsedTol >= 0 ? parsedTol : amountTolerance,
        ),
      })
      const r = await apiFetch(
        `/api/v1/conciliacion/sessions/${selectedId}/conciliar?${q.toString()}`,
        { method: 'POST' },
      )
      if (!r.ok) throw new Error(await parseError(r))
      const run = (await r.json()) as ConciliacionRunResult
      setConciliarResult(run)
      setPendingSessionTolerance(run.amountTolerance)
      await loadDetail(selectedId)
      await loadSessionListPage(sessionListPage)
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
    const y = window.scrollY
    const sub =
      side === 'bank'
        ? `pending/banco/${txId}/clasificacion`
        : `pending/empresa/${txId}/clasificacion`
    try {
      const r = await apiFetch(
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
      await loadDetail(selectedId, { soft: true })
      requestAnimationFrame(() => window.scrollTo({ top: y }))
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleSetPairClassification(pairId: number, classification: string) {
    if (selectedId == null) return
    const y = window.scrollY
    try {
      const r = await apiFetch(
        `/api/v1/conciliacion/sessions/${selectedId}/pairs/${pairId}/clasificacion`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classification: classification === '' ? null : classification,
          }),
        },
      )
      if (!r.ok) throw new Error(await parseError(r))
      await loadDetail(selectedId, { soft: true })
      requestAnimationFrame(() => window.scrollTo({ top: y }))
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
        <section className="card card--history">
          <h2>Historial de sesiones</h2>
          <p className="hint history-hint">
            Abrí una sesión para ver el mismo detalle que tras importar: comparativa, vista completa,
            tablas clásicas y exportación Excel.
          </p>
          <div className="history-toolbar">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void loadSessionListPage(sessionListPage)}
            >
              Actualizar
            </button>
            <span className="history-toolbar-meta">
              {sessionListTotalElements === 1
                ? '1 sesión'
                : `${sessionListTotalElements} sesiones`}
            </span>
          </div>
          {sessionsError && <p className="msg err">{sessionsError}</p>}
          {exportError && selectedId == null && (
            <p className="msg err" role="alert">
              {exportError}
            </p>
          )}
          {sessions.length === 0 && !sessionsError && (
            <p className="msg">No hay sesiones importadas todavía.</p>
          )}
          {sessions.length > 0 && (
            <div className="table-wrap history-table-wrap">
              <table className="data-table history-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>ID</th>
                    <th>Archivo banco</th>
                    <th>Archivo plataforma</th>
                    <th className="cell-num">Filas B/E</th>
                    <th className="cell-num">Pares</th>
                    <th>Estado</th>
                    <th className="history-th-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      className={[
                        'history-row',
                        selectedId === s.id ? 'history-row--active' : '',
                        s.status === 'CLOSED' ? 'history-row--closed' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <td className="cell-nowrap">{formatSessionListWhen(s.createdAt)}</td>
                      <td className="cell-mono">{s.id}</td>
                      <td className="history-file" title={s.sourceBankFileName ?? undefined}>
                        {shortFileLabel(s.sourceBankFileName)}
                      </td>
                      <td className="history-file" title={s.sourceCompanyFileName ?? undefined}>
                        {shortFileLabel(s.sourceCompanyFileName)}
                      </td>
                      <td className="cell-num">
                        {s.bankRowCount} / {s.companyRowCount}
                      </td>
                      <td className="cell-num">{s.matchedPairs}</td>
                      <td>{sessionStatusLabel(s.status)}</td>
                      <td>
                        <div className="history-actions">
                          <button
                            type="button"
                            className="btn-link history-open-btn"
                            onClick={() => {
                              setSelectedId(s.id)
                              window.requestAnimationFrame(() => {
                                document
                                  .getElementById('detalle-conciliacion')
                                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                              })
                            }}
                          >
                            Abrir
                          </button>
                          <button
                            type="button"
                            className="export-link history-excel-link"
                            disabled={exportLoading}
                            onClick={() => void downloadSessionExcel(s.id)}
                          >
                            Excel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sessionListTotalPages > 1 && (
            <div className="history-pagination">
              <span className="history-page-info">
                Página {sessionListPage + 1} de {sessionListTotalPages} · hasta {SESSION_HISTORY_PAGE_SIZE}{' '}
                por página
              </span>
              <div className="history-pagination-actions">
                <div className="history-pagination-actions-start">
                  {sessionListPage > 0 && (
                    <button
                      type="button"
                      className="btn-import history-pagination-nav"
                      onClick={() => void loadSessionListPage(sessionListPage - 1)}
                    >
                      Anterior
                    </button>
                  )}
                </div>
                <div className="history-pagination-actions-end">
                  <button
                    type="button"
                    className="btn-import history-pagination-nav"
                    disabled={sessionListPage >= sessionListTotalPages - 1}
                    onClick={() => void loadSessionListPage(sessionListPage + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

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
            <div className="import-layout-section">
              <label className="import-layout-toggle-label">
                <input
                  type="checkbox"
                  checked={useCustomImportLayout}
                  onChange={(ev) => {
                    const on = ev.target.checked
                    setUseCustomImportLayout(on)
                    if (on) {
                      setImportBankLayoutExcel({ ...DEFAULT_IMPORT_BANK_LAYOUT_EXCEL })
                      setImportCompanyLayoutExcel({ ...DEFAULT_IMPORT_COMPANY_LAYOUT_EXCEL })
                    }
                  }}
                />{' '}
                Mapeo personalizado de filas y columnas (si el Excel cambió de posición)
              </label>
              {useCustomImportLayout && (
                <div className="import-layout-advanced">
                  <p className="import-layout-help">
                    Usá el <strong>mismo criterio que Excel</strong>: número de fila como en el margen
                    izquierdo de la hoja (1 = primera fila) y letra de columna como encima de la grilla
                    (A, B, … Z, AA). El texto de arriba del extracto (título, datos de cuenta) no cuenta
                    como &quot;fila de títulos&quot;: esa fila es solo donde están los nombres Fecha,
                    Importe, etc.
                  </p>
                  <div className="import-layout-grid">
                    <div>
                      <h3 className="import-layout-h3">Extracto banco</h3>
                      <div className="import-layout-fields">
                        <label className="import-layout-field">
                          <span>Hoja (1 = primera pestaña)</span>
                          <input
                            type="number"
                            min={1}
                            value={importBankLayoutExcel.sheetNumber}
                            onChange={(e) =>
                              setImportBankLayoutExcel((p) => ({
                                ...p,
                                sheetNumber: Math.max(1, parseInt(e.target.value, 10) || 1),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Fila de títulos de columnas</span>
                          <input
                            type="number"
                            min={1}
                            value={importBankLayoutExcel.titleRowNumber}
                            onChange={(e) =>
                              setImportBankLayoutExcel((p) => ({
                                ...p,
                                titleRowNumber: Math.max(1, parseInt(e.target.value, 10) || 1),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Primera fila de movimientos</span>
                          <input
                            type="number"
                            min={1}
                            value={importBankLayoutExcel.firstDataRowNumber}
                            onChange={(e) =>
                              setImportBankLayoutExcel((p) => ({
                                ...p,
                                firstDataRowNumber: Math.max(1, parseInt(e.target.value, 10) || 1),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Columna fecha</span>
                          <input
                            type="text"
                            className="import-layout-col-input"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={3}
                            value={importBankLayoutExcel.colDate}
                            onChange={(e) =>
                              setImportBankLayoutExcel((p) => ({
                                ...p,
                                colDate: normalizeColumnLettersInput(e.target.value),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Columna referencia</span>
                          <input
                            type="text"
                            className="import-layout-col-input"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={3}
                            value={importBankLayoutExcel.colReference}
                            onChange={(e) =>
                              setImportBankLayoutExcel((p) => ({
                                ...p,
                                colReference: normalizeColumnLettersInput(e.target.value),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Columna descripción</span>
                          <input
                            type="text"
                            className="import-layout-col-input"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={3}
                            value={importBankLayoutExcel.colDescription}
                            onChange={(e) =>
                              setImportBankLayoutExcel((p) => ({
                                ...p,
                                colDescription: normalizeColumnLettersInput(e.target.value),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Columna importe</span>
                          <input
                            type="text"
                            className="import-layout-col-input"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={3}
                            value={importBankLayoutExcel.colAmount}
                            onChange={(e) =>
                              setImportBankLayoutExcel((p) => ({
                                ...p,
                                colAmount: normalizeColumnLettersInput(e.target.value),
                              }))
                            }
                          />
                        </label>
                        <label
                          className="import-layout-field import-layout-field--check"
                          title="Por defecto el sistema comprueba que en la fila de títulos la celda de importe contenga la palabra «Importe». Si tu Excel dice «Monto», «Amount», etc., activá esto para importar igual."
                        >
                          <input
                            type="checkbox"
                            checked={importBankLayoutExcel.skipHeaderValidation}
                            onChange={(e) =>
                              setImportBankLayoutExcel((p) => ({
                                ...p,
                                skipHeaderValidation: e.target.checked,
                              }))
                            }
                          />{' '}
                          Omitir revisión del texto &quot;Importe&quot; en el encabezado de esa columna
                        </label>
                      </div>
                    </div>
                    <div>
                      <h3 className="import-layout-h3">Libro / plataforma (debe − haber)</h3>
                      <div className="import-layout-fields">
                        <label className="import-layout-field">
                          <span>Hoja (1 = primera pestaña)</span>
                          <input
                            type="number"
                            min={1}
                            value={importCompanyLayoutExcel.sheetNumber}
                            onChange={(e) =>
                              setImportCompanyLayoutExcel((p) => ({
                                ...p,
                                sheetNumber: Math.max(1, parseInt(e.target.value, 10) || 1),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Fila de títulos de columnas</span>
                          <input
                            type="number"
                            min={1}
                            value={importCompanyLayoutExcel.titleRowNumber}
                            onChange={(e) =>
                              setImportCompanyLayoutExcel((p) => ({
                                ...p,
                                titleRowNumber: Math.max(1, parseInt(e.target.value, 10) || 1),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Primera fila de movimientos</span>
                          <input
                            type="number"
                            min={1}
                            value={importCompanyLayoutExcel.firstDataRowNumber}
                            onChange={(e) =>
                              setImportCompanyLayoutExcel((p) => ({
                                ...p,
                                firstDataRowNumber: Math.max(1, parseInt(e.target.value, 10) || 1),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Columna fecha contable</span>
                          <input
                            type="text"
                            className="import-layout-col-input"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={3}
                            value={importCompanyLayoutExcel.colFechaContable}
                            onChange={(e) =>
                              setImportCompanyLayoutExcel((p) => ({
                                ...p,
                                colFechaContable: normalizeColumnLettersInput(e.target.value),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Columna tipo</span>
                          <input
                            type="text"
                            className="import-layout-col-input"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={3}
                            value={importCompanyLayoutExcel.colTipo}
                            onChange={(e) =>
                              setImportCompanyLayoutExcel((p) => ({
                                ...p,
                                colTipo: normalizeColumnLettersInput(e.target.value),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Columna número</span>
                          <input
                            type="text"
                            className="import-layout-col-input"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={3}
                            value={importCompanyLayoutExcel.colNumero}
                            onChange={(e) =>
                              setImportCompanyLayoutExcel((p) => ({
                                ...p,
                                colNumero: normalizeColumnLettersInput(e.target.value),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Columna fecha banco</span>
                          <input
                            type="text"
                            className="import-layout-col-input"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={3}
                            value={importCompanyLayoutExcel.colFechaBanco}
                            onChange={(e) =>
                              setImportCompanyLayoutExcel((p) => ({
                                ...p,
                                colFechaBanco: normalizeColumnLettersInput(e.target.value),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Columna debe</span>
                          <input
                            type="text"
                            className="import-layout-col-input"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={3}
                            value={importCompanyLayoutExcel.colDebe}
                            onChange={(e) =>
                              setImportCompanyLayoutExcel((p) => ({
                                ...p,
                                colDebe: normalizeColumnLettersInput(e.target.value),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Columna haber</span>
                          <input
                            type="text"
                            className="import-layout-col-input"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={3}
                            value={importCompanyLayoutExcel.colHaber}
                            onChange={(e) =>
                              setImportCompanyLayoutExcel((p) => ({
                                ...p,
                                colHaber: normalizeColumnLettersInput(e.target.value),
                              }))
                            }
                          />
                        </label>
                        <label className="import-layout-field">
                          <span>Columna observación</span>
                          <input
                            type="text"
                            className="import-layout-col-input"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={3}
                            value={importCompanyLayoutExcel.colObservacion}
                            onChange={(e) =>
                              setImportCompanyLayoutExcel((p) => ({
                                ...p,
                                colObservacion: normalizeColumnLettersInput(e.target.value),
                              }))
                            }
                          />
                        </label>
                        <label
                          className="import-layout-field import-layout-field--check"
                          title="Por defecto comprueba que la celda de la columna haber contenga «Haber». Si el título es otro, activá esto."
                        >
                          <input
                            type="checkbox"
                            checked={importCompanyLayoutExcel.skipHeaderValidation}
                            onChange={(e) =>
                              setImportCompanyLayoutExcel((p) => ({
                                ...p,
                                skipHeaderValidation: e.target.checked,
                              }))
                            }
                          />{' '}
                          Omitir revisión del texto &quot;Haber&quot; en el encabezado de esa columna
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button type="submit" className="btn-import" disabled={importing}>
              {importing ? 'Importando…' : 'Importar'}
            </button>
          </form>
          {importError && <p className="msg err">{importError}</p>}
          {importResult && (
            <div className="import-result">
              <h3 className="import-result-title">Sesión {importResult.sessionId}</h3>
              <div className="import-result-grid">
                <div className="import-result-cell">
                  <span className="import-result-k">Filas banco</span>
                  <span className="import-result-v">{importResult.bankRows}</span>
                </div>
                <div className="import-result-cell">
                  <span className="import-result-k">Filas plataforma</span>
                  <span className="import-result-v">{importResult.companyRows}</span>
                </div>
                <div className="import-result-cell">
                  <span className="import-result-k">Archivo banco</span>
                  <span className="import-result-v" title={importResult.sourceBankFileName}>
                    {importResult.sourceBankFileName}
                  </span>
                </div>
                <div className="import-result-cell">
                  <span className="import-result-k">Archivo plataforma</span>
                  <span className="import-result-v" title={importResult.sourceCompanyFileName}>
                    {importResult.sourceCompanyFileName}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section
          className={sessionClosed ? 'card card--session-closed' : 'card'}
          id="detalle-conciliacion"
        >
          <h2>Detalle y conciliación</h2>
          {selectedId == null && (
            <p className="msg">Elegí una sesión en la lista o importá archivos nuevos.</p>
          )}
          {selectedId != null && (
            <div className="session-detail-shell">
              <div className="session-detail-head">
                <h3 className="session-detail-title">Sesión {selectedId}</h3>
                <div className="session-detail-head-actions">
                  <button
                    type="button"
                    className="btn-secondary session-export-btn"
                    disabled={exportLoading}
                    onClick={() => void downloadSessionExcel(selectedId)}
                  >
                    {exportLoading ? 'Generando…' : 'Exportar Excel'}
                  </button>
                  {detailMatchesSelection && !detailLoading && !sessionClosed && (
                    <button
                      type="button"
                      className="btn-secondary session-close-btn"
                      disabled={closeSessionLoading}
                      onClick={() => void handleCloseSession()}
                    >
                      {closeSessionLoading ? 'Cerrando…' : 'Cerrar sesión'}
                    </button>
                  )}
                </div>
              </div>

              {detailMatchesSelection && !detailLoading && sessionClosed && (
                <div className="session-closed-banner" role="status">
                  Sesión cerrada: saldos, clasificación de pendientes y conciliación automática bloqueados.
                  Podés consultar y exportar.
                </div>
              )}

              {detailMatchesSelection && !detailLoading && user?.role === 'CONSULTA' && !sessionClosed && (
                <div className="msg subtle session-consulta-hint" role="status">
                  Perfil solo consulta: la clasificación de movimientos y pares es de solo lectura.
                </div>
              )}

              <div className="session-detail-run">
                <div className="session-tolerance-fields">
                  <label className="session-tolerance-field">
                    <span>Tolerancia de fechas (días)</span>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      step={1}
                      readOnly={reconcileLocked}
                      title="Flechas ↑ ↓: sumar o restar un día"
                      value={toleranceDays}
                      onChange={(ev) => setToleranceDays(Number(ev.target.value))}
                      onKeyDown={(ev) => {
                        if (reconcileLocked) return
                        if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return
                        ev.preventDefault()
                        const dir = ev.key === 'ArrowUp' ? 1 : -1
                        setToleranceDays((d) => stepToleranceDays(dir, Number.isFinite(d) ? d : 0))
                      }}
                    />
                  </label>
                  <label className="session-tolerance-field">
                    <span>Tolerancia importe (±)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      readOnly={reconcileLocked}
                      title="Flechas ↑ ↓: sumar o restar 0,01 en el importe"
                      value={amountToleranceText}
                      onChange={(ev) => {
                        const raw = ev.target.value
                        setAmountToleranceText(raw)
                        const n = parseBalanceInput(raw)
                        if (n != null && n >= 0) {
                          setAmountTolerance(n)
                        }
                      }}
                      onKeyDown={(ev) => {
                        if (reconcileLocked) return
                        if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return
                        ev.preventDefault()
                        const dir = ev.key === 'ArrowUp' ? 1 : -1
                        setAmountTolerance((prev) => {
                          const next = stepToleranceAmount(dir, prev)
                          setAmountToleranceText(formatToleranceInputDisplay(next))
                          return next
                        })
                      }}
                      onBlur={() => {
                        const n = parseBalanceInput(amountToleranceText)
                        if (n != null && n >= 0) {
                          setAmountTolerance(n)
                          setAmountToleranceText(formatToleranceInputDisplay(n))
                        } else {
                          setAmountToleranceText(formatToleranceInputDisplay(amountTolerance))
                        }
                      }}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn-import session-conciliar-btn"
                  disabled={conciliarLoading || reconcileLocked}
                  onClick={() => void handleConciliar()}
                >
                  {conciliarLoading ? 'Conciliando…' : 'Ejecutar conciliación'}
                </button>
              </div>
              {conciliarError && <p className="msg err session-detail-msg">{conciliarError}</p>}
              {exportError && (
                <p className="msg err session-detail-msg" role="alert">
                  {exportError}
                </p>
              )}

              {detailMatchesSelection && detailLoading && (
                <p className="msg subtle session-detail-meta-loading">Cargando datos de la sesión…</p>
              )}

              {detailMatchesSelection && detail && !detailLoading && (
                <div className="session-detail-meta">
                  <div className="session-detail-meta-row">
                    <span className="session-detail-meta-k">Estado</span>
                    <span
                      className={`session-status-pill session-status-pill--${detail.session.status.toLowerCase()}`}
                    >
                      {sessionStatusLabel(detail.session.status)}
                    </span>
                  </div>
                  <div className="session-detail-files">
                    <div className="session-detail-file">
                      <span className="session-detail-meta-k">Archivo banco</span>
                      <span
                        className="session-detail-file-name"
                        title={detail.session.sourceBankFileName ?? undefined}
                      >
                        {detail.session.sourceBankFileName ?? '—'}
                      </span>
                    </div>
                    <div className="session-detail-file">
                      <span className="session-detail-meta-k">Archivo empresa</span>
                      <span
                        className="session-detail-file-name"
                        title={detail.session.sourceCompanyFileName ?? undefined}
                      >
                        {detail.session.sourceCompanyFileName ?? '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {conciliarResult && (
                <dl className="status-dl session-conciliar-result">
                  <dt>Pares automáticos (esta corrida)</dt>
                  <dd>{conciliarResult.pairsCreated}</dd>
                  <dt>Sin match banco</dt>
                  <dd>{conciliarResult.unmatchedBank}</dd>
                  <dt>Sin match empresa</dt>
                  <dd>{conciliarResult.unmatchedCompany}</dd>
                  <dt>Tolerancias usadas</dt>
                  <dd>
                    {conciliarResult.dateToleranceDays} días · importe ±{' '}
                    {formatToleranceInputDisplay(Number(conciliarResult.amountTolerance))}
                  </dd>
                </dl>
              )}
            </div>
          )}
          {detailLoading && <p className="msg">Cargando detalle…</p>}
          {detailError && <p className="msg err">{detailError}</p>}
          {/*
            Formulario de saldos fuera de `!detailLoading`: un loadDetail() completo (clasificación,
            conciliar, etc.) ponía detailLoading en true y desmontaba todo el bloque; al remontar se
            perdía «Editar» y volvía la vista guardada. Mostramos saldos mientras haya detalle alineado
            a la sesión elegida (puede ser datos del fetch anterior un instante al cambiar de sesión).
          */}
          {detailMatchesSelection && detail && (
            <SessionBalancesForm
              session={detail.session}
              readOnly={sessionClosed}
              onSaved={async () => {
                if (selectedId != null) await loadDetail(selectedId, { soft: true })
              }}
            />
          )}
          {detail && !detailLoading && (
            <>
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
                    {compareRowFilterActive
                      ? `${filteredComparisonRows.length} de ${comparisonRows.length}`
                      : `${comparisonRows.length} filas`}
                    )
                  </h3>
                  <p className="hint compare-hint">
                    Tocá un color (o «Todos») para ver solo filas de ese estado; en la barra de abajo,
                    buscá por ID, referencia, descripción o importe (mitad izquierda), filtrá por
                    clasificación si querés (mitad derecha) y acotá por fechas (extremo derecho). La
                    grilla se ordena: pares, pendientes banco, pendientes empresa.
                    {effectiveSessionAmountTolerance !== undefined ? (
                      <>
                        {' '}
                        «Δ importe» solo si la brecha supera la tolerancia de la última conciliación (±
                        {formatToleranceInputDisplay(
                          Number(effectiveSessionAmountTolerance),
                        )}
                        ).
                      </>
                    ) : (
                      <> «Δ importe» usa umbral 0,02 hasta que concilies con tolerancia propia.</>
                    )}
                  </p>
                  <ComparisonLegend
                    filter={compareFilter}
                    onFilter={setCompareFilter}
                    counts={compareCounts}
                  />
                  <CompareFiltersBar
                    searchValue={compareSearchQuery}
                    onSearchChange={setCompareSearchQuery}
                    onSearchClear={() => setCompareSearchQuery('')}
                    classificationValue={compareClassificationFilter}
                    classificationOptions={classificationSuggestions}
                    onClassificationChange={setCompareClassificationFilter}
                    dateFrom={compareDateFrom}
                    dateTo={compareDateTo}
                    onDateFromChange={setCompareDateFrom}
                    onDateToChange={setCompareDateTo}
                    onClearDates={() => {
                      setCompareDateFrom('')
                      setCompareDateTo('')
                    }}
                  />
                  <ComparisonTable
                    rows={filteredComparisonRows}
                    allRowsCount={comparisonRows.length}
                    selectedId={selectedId}
                    sessionClosed={sessionClosed}
                    classificationReadOnly={classificationReadOnly}
                    sessionAmountTolerance={effectiveSessionAmountTolerance}
                    classificationSuggestions={classificationSuggestions}
                    onDeleteManual={(pairId) => void handleDeleteManualPair(pairId)}
                    onSetClassification={(side, txId, c) =>
                      void handleSetClassification(side, txId, c)
                    }
                    onSetPairClassification={(pairId, c) =>
                      void handleSetPairClassification(pairId, c)
                    }
                    onOpenPendingComments={(t) => setCommentTarget(t)}
                    onOpenPendingAttachments={(t) => setAttachmentTarget(t)}
                  />
                </>
              ) : detailLayout === 'complete' ? (
                <>
                  <h3 className="subsection-title">
                    Vista completa (
                    {compareRowFilterActive
                      ? `${filteredChronologicalRows.length} de ${comparisonRows.length}`
                      : `${comparisonRows.length}`}{' '}
                    filas)
                  </h3>
                  <p className="hint compare-hint">
                    Todas las filas en una sola tabla, ordenadas por fecha. En cada par se usa la
                    fecha más temprana entre banco y empresa. Los pendientes muestran solo un lado;
                    el otro queda vacío (—). Debajo de la leyenda, la misma barra: búsqueda y filtro por
                    clasificación, y fechas a la derecha.
                  </p>
                  <CompleteViewLegendStatic />
                  <CompareFiltersBar
                    searchValue={compareSearchQuery}
                    onSearchChange={setCompareSearchQuery}
                    onSearchClear={() => setCompareSearchQuery('')}
                    classificationValue={compareClassificationFilter}
                    classificationOptions={classificationSuggestions}
                    onClassificationChange={setCompareClassificationFilter}
                    dateFrom={compareDateFrom}
                    dateTo={compareDateTo}
                    onDateFromChange={setCompareDateFrom}
                    onDateToChange={setCompareDateTo}
                    onClearDates={() => {
                      setCompareDateFrom('')
                      setCompareDateTo('')
                    }}
                  />
                  <ComparisonTable
                    rows={filteredChronologicalRows}
                    allRowsCount={comparisonRows.length}
                    selectedId={selectedId}
                    sessionClosed={sessionClosed}
                    classificationReadOnly={classificationReadOnly}
                    sessionAmountTolerance={effectiveSessionAmountTolerance}
                    classificationSuggestions={classificationSuggestions}
                    onDeleteManual={(pairId) => void handleDeleteManualPair(pairId)}
                    onSetClassification={(side, txId, c) =>
                      void handleSetClassification(side, txId, c)
                    }
                    onSetPairClassification={(pairId, c) =>
                      void handleSetPairClassification(pairId, c)
                    }
                    onOpenPendingComments={(t) => setCommentTarget(t)}
                    onOpenPendingAttachments={(t) => setAttachmentTarget(t)}
                  />
                </>
              ) : (
                <>
                  <h3 className="subsection-title">
                    Tablas clásicas (
                    {compareRowFilterActive
                      ? `${classicFilteredPairRows.length + classicFilteredUnmatchedBank.length + classicFilteredUnmatchedCompany.length} de ${comparisonRows.length}`
                      : `${comparisonRows.length} filas`}
                    )
                  </h3>
                  <p className="hint compare-hint">
                    Mismos filtros que en Comparativa: tipo de fila, búsqueda (ID, ref., importe),
                    clasificación y fechas; las tres tablas muestran solo lo que cumple todos los
                    criterios activos.
                  </p>
                  <ComparisonLegend
                    filter={compareFilter}
                    onFilter={setCompareFilter}
                    counts={compareCounts}
                  />
                  <CompareFiltersBar
                    searchValue={compareSearchQuery}
                    onSearchChange={setCompareSearchQuery}
                    onSearchClear={() => setCompareSearchQuery('')}
                    classificationValue={compareClassificationFilter}
                    classificationOptions={classificationSuggestions}
                    onClassificationChange={setCompareClassificationFilter}
                    dateFrom={compareDateFrom}
                    dateTo={compareDateTo}
                    onDateFromChange={setCompareDateFrom}
                    onDateToChange={setCompareDateTo}
                    onClearDates={() => {
                      setCompareDateFrom('')
                      setCompareDateTo('')
                    }}
                  />
                  <h3 className="subsection-title">
                    Pares encontrados (
                    {compareRowFilterActive
                      ? `${classicFilteredPairRows.length} de ${detail.pairs.length}`
                      : `${detail.pairs.length}`}
                    )
                  </h3>
                  {detail.pairs.length > 0 && classicFilteredPairRows.length === 0 ? (
                    <p className="msg subtle">
                      Ningún par coincide con el filtro actual (probá «Todos», otra búsqueda o ampliá
                      fechas).
                    </p>
                  ) : (
                    <div className="table-wrap table-wrap--scrollY">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th className="rownum-th" aria-label="Número de fila">
                              #
                            </th>
                            <th>Origen</th>
                            <th>Importe banco</th>
                            <th>Importe empresa</th>
                            <th>Fecha banco</th>
                            <th>Fecha empresa</th>
                            <th>Clasif.</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {classicFilteredPairRows.map((row, idx) => {
                            const { pair: p } = row
                            return (
                              <tr key={p.pairId}>
                                <td className="rownum-td">{idx + 1}</td>
                                <td>{p.matchSource}</td>
                                <td>{p.bankAmount}</td>
                                <td>{p.companyAmount}</td>
                                <td className="cell-date-nowrap">{formatDisplayDate(p.bankDate)}</td>
                                <td className="cell-date-nowrap">{formatDisplayDate(p.companyDate)}</td>
                                <td className="mov-clasif-td">
                                  <ClassificationCombo
                                    value={p.classification ?? undefined}
                                    suggestions={classificationSuggestions}
                                    disabled={classificationReadOnly}
                                    ariaLabel="Clasificación del par conciliado"
                                    onCommit={(v) => void handleSetPairClassification(p.pairId, v)}
                                  />
                                </td>
                                <td>
                                  {p.matchSource === 'MANUAL' &&
                                    selectedId != null &&
                                    !sessionClosed && (
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
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <MovimientosTable
                    title="Pendientes banco"
                    rows={classicFilteredUnmatchedBank}
                    classificationSuggestions={classificationSuggestions}
                    classificationLocked={classificationReadOnly}
                    onClassificationChange={(txId, c) =>
                      void handleSetClassification('bank', txId, c)
                    }
                    onOpenPendingComments={(txId) =>
                      setCommentTarget({ kind: 'single', side: 'bank', txId })
                    }
                    onOpenPendingAttachments={(txId) =>
                      setAttachmentTarget({ kind: 'single', side: 'bank', txId })
                    }
                  />
                  <MovimientosTable
                    title="Pendientes empresa (plataforma)"
                    rows={classicFilteredUnmatchedCompany}
                    classificationSuggestions={classificationSuggestions}
                    classificationLocked={classificationReadOnly}
                    onClassificationChange={(txId, c) =>
                      void handleSetClassification('company', txId, c)
                    }
                    onOpenPendingComments={(txId) =>
                      setCommentTarget({ kind: 'single', side: 'company', txId })
                    }
                    onOpenPendingAttachments={(txId) =>
                      setAttachmentTarget({ kind: 'single', side: 'company', txId })
                    }
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
              <div
                className="manual-pair-toolbar"
                role="group"
                aria-label="Vínculo manual por ID"
              >
                <label className="compare-date-field">
                  <span>ID mov. banco</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={reconcileLocked}
                    value={manualBankId}
                    onChange={(ev) => {
                      setManualBankId(ev.target.value)
                      setManualError(null)
                    }}
                    placeholder="Pendiente banco"
                    aria-label="ID movimiento banco"
                  />
                </label>
                <label className="compare-date-field">
                  <span>ID mov. empresa</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={reconcileLocked}
                    value={manualCompanyId}
                    onChange={(ev) => {
                      setManualCompanyId(ev.target.value)
                      setManualError(null)
                    }}
                    placeholder="Pendiente empresa"
                    aria-label="ID movimiento empresa"
                  />
                </label>
                <button
                  type="button"
                  className="btn-import manual-pair-submit"
                  disabled={manualLoading || reconcileLocked}
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
      {selectedId != null && (
        <>
          <PendingCommentsModal
            sessionId={selectedId}
            target={commentTarget}
            sessionClosed={sessionClosed}
            onClose={() => setCommentTarget(null)}
            onAfterChange={() => {
              if (selectedId != null) void loadDetail(selectedId, { soft: true })
            }}
          />
          <PendingAttachmentsModal
            sessionId={selectedId}
            target={attachmentTarget}
            sessionClosed={sessionClosed}
            onClose={() => setAttachmentTarget(null)}
            onAfterChange={() => {
              if (selectedId != null) void loadDetail(selectedId, { soft: true })
            }}
          />
        </>
      )}
    </div>
  )
}

