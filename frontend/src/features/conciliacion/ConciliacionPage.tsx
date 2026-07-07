import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import './conciliacion.css'
import { HelpPopoverButton } from './HelpPopoverButton'
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
  GroupDto,
  PendingCommentDto,
  SessionAuditEntry,
  SessionClosingInfo,
  SessionDetail,
  SessionSummary,
} from './types'
import { apiFetch } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { registerLogoutCheckpointProvider } from '../../auth/logoutCheckpoint'
import {
  downloadAuthenticatedFile,
  openAuthenticatedFileInNewTab,
  useAuthenticatedBlobUrl,
} from './api/authenticatedBlob'
import { parseError } from './api/http'
import { rowMatchesClassification, rowMatchesSearch, compareSearchRowOrder } from './utils/compareSearch'
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
  statusPanelClass,
} from './utils/format'
import { parseBalanceInput } from './utils/parse'
import {
  bankLayoutExcelToApi,
  companyLayoutExcelToApi,
  normalizeColumnLettersInput,
} from './utils/importLayoutExcel'
import { CounterpartPreviewModal } from './CounterpartPreviewModal'
import { ClassificationCombo } from './ClassificationCombo'
import { FullLedgerView } from './FullLedgerView'
import { PendingLinkSelectionPanel } from './PendingLinkSelectionPanel'
import { RubroGroupsView } from './RubroGroupsView'
import { RubroLinkConfirmModal } from './RubroLinkConfirmModal'
import { usePendingMultiLinkPicker } from './usePendingMultiLinkPicker'
import { CompareGroupTableRows, compareGroupSideKey } from './CompareGroupTableRows'
import { CompareTableColumnResizeRails } from './CompareTableColumnResizeRails'
import {
  findDuplicateSiblings,
  findMovementInSession,
  fuzzyMatchBadgeLabel,
  movementDisplayLabel,
  resolveFuzzyCounterpart,
  type CounterpartInspectRequest,
} from './utils/counterpartUtils'
import {
  beginCompareColumnResize,
  loadCompareColumnWidths,
  measureCompareTableColumnWidths,
  normalizeCompareColumnWidths,
  saveCompareColumnWidths,
  compareTableTotalWidth,
} from './utils/compareTableColumns'
import { SessionCheckpointsSection } from './SessionCheckpointsSection'
import { SessionDisplayNameEditor, SessionHistoryList } from './SessionHistoryList'
import { SessionSourceFiles } from './SessionSourceFiles'
import { SessionReimportPanel } from './SessionReimportPanel'
import { SessionDeferredPanels } from './SessionDeferredPanels'
import { scrollConciliacionWorkspaceToTop } from './keyboardScrollUtils'
import { deferMovement } from './api/deferred'
import { createReconciliationGroup, deleteReconciliationGroup } from './api/groups'
import {
  allBankMovementRefs,
  allCompanyMovementRefs,
  collectSelectionClassificationTargets,
  isRubroMovementLinkable,
} from './utils/rubroGroups'
import { ShareInChatButton } from './ShareInChatButton'
import { UnlinkPairButton } from './UnlinkPairButton'
import {
  buildShareRefFromComparisonRow,
  parseFocusFromSearchParam,
  parseSessionIdFromSearchParam,
  shareRefToRowKey,
  type ConciliacionFocusNavState,
} from './utils/shareLink'
import {
  comparisonRowHasDeferredOrigin,
  deferredOriginTitle,
  hasDeferredOrigin,
} from './utils/deferredOrigin'
import {
  CheckpointsNavIcon,
  CompareNavIcon,
  ConciliacionSectionNav,
  DeferredNavIcon,
  FilesNavIcon,
  GroupsNavIcon,
  ImportNavIcon,
  LedgerNavIcon,
  ReconcileNavIcon,
  SessionNavIcon,
  SessionsNavIcon,
  type ConciliacionNavItem,
  type ConciliacionSectionId,
  type ConciliacionSectionNavHandle,
} from './ConciliacionSectionNav'

const NAV_COLLAPSED_STORAGE_KEY = 'conciliacion.sectionNav.collapsed'

const SESSION_SECTION_IDS: ConciliacionSectionId[] = [
  'sesion',
  'diferidos',
  'conciliar',
  'comparar',
  'grupos',
  'ledger',
  'archivos',
  'cortes',
]

const AMOUNT_TOLERANCE_ARROW_STEP = 0.01

const CAN_SHARE_IN_CHAT = ['ADMIN', 'OPERADOR', 'CONSULTA'] as const

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
          Cargá <strong>saldo final banco</strong> y <strong>saldo final empresa</strong> en{' '}
          <strong>Saldos del período</strong> (icono de configuración del resumen) para validar el puente
          extracto ↔ libro y dejar el circuito listo para revisión externa.
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

function movementModalLabel(
  detail: SessionDetail | null,
  side: 'bank' | 'company',
  txId: number,
): string {
  const sideLabel = side === 'bank' ? 'Banco' : 'Empresa'
  if (!detail) return sideLabel
  const m = findMovementInSession(detail, side, txId)
  return m ? `${sideLabel} · ${movementDisplayLabel(m)}` : sideLabel
}

function CompareViewHelpText({
  effectiveSessionAmountTolerance,
}: {
  effectiveSessionAmountTolerance: number | undefined
}) {
  return (
    <>
      Tocá un color (o «Todos») para ver solo filas de ese estado. En la barra de filtros, buscá por número de fila
      (#12, fila 12 o solo el número), referencia, descripción o importe. Si buscás por fila, esa
      fila va primero y debajo el resto de coincidencias; filtrá por clasificación y acotá por fechas. La grilla se
      ordena: pares, pendientes banco, pendientes empresa. En «Ref. / desc.» podés arrastrar la línea
      vertical del encabezado para ensanchar el detalle (el resto de columnas mantiene su ancho; si no
      entra, desplazate con scroll horizontal). El icono ⌨ resume los atajos para vincular pendientes.
      {effectiveSessionAmountTolerance !== undefined ? (
        <>
          {' '}
          «Δ importe» solo si la brecha supera la tolerancia de la última conciliación (±
          {formatToleranceInputDisplay(Number(effectiveSessionAmountTolerance))}).
        </>
      ) : (
        <> «Δ importe» usa umbral 0,02 hasta que concilies con tolerancia propia.</>
      )}
    </>
  )
}

function LedgerViewHelpText() {
  return (
    <>
      <p>
        Listado completo sin agrupar por rubro: <strong>banco a la izquierda</strong>,{' '}
        <strong>empresa a la derecha</strong>. Cada columna tiene <strong>scroll independiente</strong>.
      </p>
      <p>
        En cada fila ves <strong>par</strong> o <strong>grp</strong> si ya está conciliado, o{' '}
        <strong>pend.</strong> si falta vincular. Tocá varios <strong>pend.</strong> en cada columna para
        seleccionarlos: con uno de cada lado se abre el vínculo 1:1; con varios de algún lado podés{' '}
        <strong>conciliar grupo</strong> (N:M).
      </p>
    </>
  )
}

function LedgerKeyboardHelpText({ linkMode }: { linkMode: boolean }) {
  return linkMode ? (
    <p className="keyboard-hint-popover-body">
      Tocá la <strong>fila</strong> del pendiente o pasá el mouse sobre una tabla: <kbd>↑</kbd>{' '}
      <kbd>↓</kbd> recorren filas, <kbd>←</kbd> <kbd>→</kbd> cambian de tabla, <kbd>Espacio</kbd>{' '}
      selecciona pendientes, <kbd>Enter</kbd> confirma el vínculo, <kbd>Esc</kbd> limpia la selección
      (el foco queda en la tabla).
    </p>
  ) : (
    <p className="keyboard-hint-popover-body">
      Sobre una tabla: <kbd>↑</kbd> <kbd>↓</kbd> recorren filas; <kbd>←</kbd> <kbd>→</kbd> pasan al otro
      lado.
    </p>
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
            <strong>Saldo final banco / extracto</strong> — lo informado por el extracto (lo cargás en{' '}
            <strong>Saldos del período</strong>, desde el icono ⚙ del resumen).
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

function ExecutiveSummarySettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="exec-summary-settings-icon">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"
      />
    </svg>
  )
}

function ExecutiveSummaryPanel({
  stats,
  closing,
  balancesStatus,
  onOpenBalances,
}: {
  stats: ConciliacionStatsDto
  closing: SessionClosingInfo
  balancesStatus: BalancesLoadStatus
  onOpenBalances: () => void
}) {
  const diff = stats.differenceTotal
  const diffNonZero = Math.abs(diff) >= 0.005
  const label = STATUS_LABEL[stats.reconciliationStatus] ?? stats.reconciliationStatus
  return (
    <section className="exec-summary-panel" aria-label="Resumen ejecutivo">
      <div className="exec-summary-panel-head">
        <span className="exec-summary-disclosure-title">Resumen ejecutivo</span>
        <span className={`exec-summary-disclosure-peek ${statusPanelClass(stats.reconciliationStatus)}`}>
          <strong>{label}</strong>
        </span>
        <span className="exec-summary-disclosure-meta">
          Dif. {formatAmount(diff)} · {stats.matchedPairs} pares · {stats.bankRowCount + stats.companyRowCount}{' '}
          filas
        </span>
        <span className="exec-summary-settings-wrap">
          {balancesStatus !== 'empty' && (
            <span
              className={`balances-disclosure-badge balances-disclosure-badge--${balancesStatus} exec-summary-balances-badge`}
            >
              {BALANCES_STATUS_LABEL[balancesStatus]}
            </span>
          )}
          <button
            type="button"
            className="exec-summary-settings-btn"
            aria-label="Configuración — saldos del período"
            title="Saldos del período"
            onClick={() => onOpenBalances()}
          >
            <ExecutiveSummarySettingsIcon />
          </button>
        </span>
      </div>
      <div className="exec-summary-panel-body">
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
            '— (indicá saldo final extracto en configuración)'
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
    </section>
  )
}

/** Estado del par según importes de la fila y tolerancia guardada (incluye 0). No usar solo pair.pairKind. */
function pairKindForComparisonRow(
  row: ComparisonRow,
  sessionTolerance: number | null | undefined,
): PairKind | null {
  if (row.kind === 'pair') {
    return effectivePairKindFromAmounts(row.bank.amount, row.company.amount, sessionTolerance)
  }
  if (row.kind === 'group') {
    return effectivePairKindFromAmounts(row.group.bankSum, row.group.companySum, sessionTolerance)
  }
  return null
}

/** Etiqueta y estilo del estado en grilla (par conciliado). */
function pairEstadoMeta(
  pair: ParDto,
  bank: MovimientoDto,
  company: MovimientoDto,
  sessionTolerance: number | null | undefined,
): { label: string; abbr: string; badgeClass: string } {
  const k = effectivePairKindFromAmounts(bank.amount, company.amount, sessionTolerance)
  if (k === 'OPPOSITE_SIGN') {
    return {
      label: 'Signo incorrecto',
      abbr: 'SI',
      badgeClass: 'compare-badge compare-badge--estado compare-badge--opp-sign',
    }
  }
  if (k === 'AMOUNT_GAP') {
    return {
      label:
        pair.matchSource === 'MANUAL'
          ? 'Diferencia de importe (vínculo manual)'
          : 'Diferencia de importe',
      abbr: pair.matchSource === 'MANUAL' ? 'ΔM' : 'ΔI',
      badgeClass: 'compare-badge compare-badge--estado compare-badge--amount-gap',
    }
  }
  if (k === 'AMOUNT_ADJUST') {
    return {
      label:
        pair.matchSource === 'MANUAL'
          ? 'Conciliado con ajuste (manual)'
          : 'Conciliado con ajuste (Δ dentro de tolerancia)',
      abbr: pair.matchSource === 'MANUAL' ? 'AjM' : 'Aj',
      badgeClass: 'compare-badge compare-badge--estado compare-badge--amount-gap',
    }
  }
  if (pair.matchSource === 'MANUAL') {
    return {
      label: 'Conciliado manual',
      abbr: 'CM',
      badgeClass: 'compare-badge compare-badge--estado compare-badge--manual',
    }
  }
  return {
    label: 'Conciliado',
    abbr: 'CA',
    badgeClass: 'compare-badge compare-badge--estado compare-badge--auto',
  }
}

type BalancesLoadStatus = 'empty' | 'partial' | 'ready'

function balancesLoadStatus(session: SessionDetail['session']): BalancesLoadStatus {
  const filled = [
    session.openingBankBalance,
    session.closingBankBalance,
    session.openingCompanyBalance,
    session.closingCompanyBalance,
  ].filter((v) => v != null).length
  if (filled === 0) return 'empty'
  if (session.closingBankBalance != null && session.closingCompanyBalance != null) return 'ready'
  return 'partial'
}

const BALANCES_STATUS_LABEL: Record<BalancesLoadStatus, string> = {
  empty: 'Opcional',
  partial: 'En progreso',
  ready: 'Cierre listo',
}

function balancesTabDetail(session: SessionDetail['session']): string {
  const filled = [
    session.openingBankBalance,
    session.closingBankBalance,
    session.openingCompanyBalance,
    session.closingCompanyBalance,
  ].filter((v) => v != null).length
  if (filled === 0) {
    return 'Completá los saldos para cerrar la auditoría del período'
  }
  const parts: string[] = []
  if (session.closingBankBalance != null) {
    parts.push(`Banco final ${formatAmount(session.closingBankBalance)}`)
  }
  if (session.closingCompanyBalance != null) {
    parts.push(`Empresa final ${formatAmount(session.closingCompanyBalance)}`)
  }
  if (parts.length > 0) return parts.join(' · ')
  return `${filled} de 4 saldos cargados`
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
      {readOnly ? (
        <p className="hint balances-locked-hint">
          <strong>Conciliación cerrada:</strong> saldos y clasificación de pendientes en solo lectura.
        </p>
      ) : (
        <p className="hint balances-form-hint">
          Podés modificar los importes en cualquier momento y <strong>Guardar saldos</strong> para
          persistirlos. Miles con punto (27.000.000) o coma decimal (1.234,56). Con{' '}
          <strong>saldo final banco</strong> y <strong>saldo final empresa</strong> el resumen cierra
          la auditoría de cierre.
        </p>
      )}
      <div className="balances-columns">
        <div className="balances-column balances-column--bank">
          <h4 className="balances-column-title">Banco</h4>
          <div className="balances-grid balances-grid--column">
            <label>
              <span>Saldo inicial</span>
              <input
                type="text"
                inputMode="decimal"
                readOnly={readOnly}
                value={openingBankBalance}
                onChange={(ev) => setOpeningBankBalance(ev.target.value)}
                autoComplete="off"
                placeholder="—"
              />
            </label>
            <label>
              <span>Saldo final</span>
              <input
                type="text"
                inputMode="decimal"
                readOnly={readOnly}
                value={closingBankBalance}
                onChange={(ev) => setClosingBankBalance(ev.target.value)}
                autoComplete="off"
                placeholder="—"
              />
            </label>
          </div>
        </div>
        <div className="balances-column balances-column--company">
          <h4 className="balances-column-title">Empresa</h4>
          <div className="balances-grid balances-grid--column">
            <label>
              <span>Saldo inicial</span>
              <input
                type="text"
                inputMode="decimal"
                readOnly={readOnly}
                value={openingCompanyBalance}
                onChange={(ev) => setOpeningCompanyBalance(ev.target.value)}
                autoComplete="off"
                placeholder="—"
              />
            </label>
            <label>
              <span>Saldo final</span>
              <input
                type="text"
                inputMode="decimal"
                readOnly={readOnly}
                value={closingCompanyBalance}
                onChange={(ev) => setClosingCompanyBalance(ev.target.value)}
                autoComplete="off"
                placeholder="—"
              />
            </label>
          </div>
        </div>
      </div>
      {!readOnly && (
        <div className="balances-actions-row balances-actions-row--modal">
          <button type="submit" className="btn-import balances-save-btn" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar saldos'}
          </button>
        </div>
      )}
      {err && <p className="msg err">{err}</p>}
    </form>
  )
}

function SessionBalancesModal({
  session,
  onSaved,
  readOnly,
  onClose,
}: {
  session: SessionDetail['session']
  onSaved: () => Promise<void>
  readOnly: boolean
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const loadStatus = balancesLoadStatus(session)
  const tabDetail = balancesTabDetail(session)

  return (
    <div className="comment-modal-backdrop session-balances-backdrop" role="presentation" onClick={onClose}>
      <div
        className="comment-modal session-balances-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-balances-modal-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="comment-modal-head session-balances-modal-head">
          <div className="session-balances-modal-head-block">
            <h3 id="session-balances-modal-title">Saldos del período</h3>
            <span className={`balances-disclosure-badge balances-disclosure-badge--${loadStatus}`}>
              {BALANCES_STATUS_LABEL[loadStatus]}
            </span>
          </div>
          <button type="button" className="comment-modal-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <p className="comment-modal-hint session-balances-modal-hint">{tabDetail}</p>
        <div className="session-balances-modal-body">
          <SessionBalancesForm session={session} onSaved={onSaved} readOnly={readOnly} />
        </div>
      </div>
    </div>
  )
}

function SubsectionTitleRow({
  children,
  help,
  helpAriaLabel,
  helpDialogLabel,
  keyboardHelp,
  keyboardHelpAriaLabel,
  keyboardHelpDialogLabel,
}: {
  children: React.ReactNode
  help?: React.ReactNode
  helpAriaLabel?: string
  helpDialogLabel?: string
  keyboardHelp?: React.ReactNode
  keyboardHelpAriaLabel?: string
  keyboardHelpDialogLabel?: string
}) {
  return (
    <div className="subsection-title-row">
      <h3 className="subsection-title">{children}</h3>
      {help || keyboardHelp ? (
        <div className="subsection-title-help">
          {help ? (
            <HelpPopoverButton ariaLabel={helpAriaLabel} dialogLabel={helpDialogLabel}>
              {help}
            </HelpPopoverButton>
          ) : null}
          {keyboardHelp ? (
            <HelpPopoverButton
              variant="keyboard"
              ariaLabel={keyboardHelpAriaLabel ?? 'Atajos de teclado'}
              dialogLabel={keyboardHelpDialogLabel ?? 'Atajos de teclado'}
            >
              {keyboardHelp}
            </HelpPopoverButton>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Búsqueda + clasificación + fechas en una cinta; ayuda y atajos junto al buscador. */
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
  help,
  keyboardHelp,
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
  help?: React.ReactNode
  keyboardHelp?: React.ReactNode
}) {
  const hasSearch = searchValue.trim() !== ''
  const hasDates = dateFrom !== '' || dateTo !== ''
  const hasHelpCluster = help != null || keyboardHelp != null
  return (
    <div
      className={[
        'compare-filters-bar',
        'compare-filters-bar--above-table',
        hasHelpCluster ? 'compare-filters-bar--with-help' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="group"
      aria-label="Buscar y filtrar"
    >
      <div
        className={[
          'compare-filters-bar__grid',
          hasHelpCluster ? 'compare-filters-bar__grid--with-help' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {hasHelpCluster ? (
          <div className="compare-filters-bar__help">
            {help ? (
              <HelpPopoverButton ariaLabel="Ayuda sobre filtros y vista" dialogLabel="Ayuda">
                {help}
              </HelpPopoverButton>
            ) : null}
            {keyboardHelp ? (
              <HelpPopoverButton
                variant="keyboard"
                ariaLabel="Atajos de teclado"
                dialogLabel="Atajos de teclado"
              >
                {keyboardHelp}
              </HelpPopoverButton>
            ) : null}
          </div>
        ) : null}

        <span className="compare-filters-field-label">Buscar</span>
        <span className="compare-filters-field-label">Clasificación</span>
        <span className="compare-filters-field-label">Desde</span>
        <span className="compare-filters-field-label">Hasta</span>
        <span className="compare-filters-field-label compare-filters-field-label--actions" aria-hidden />

        <div className="compare-filters-field compare-filters-field--search" role="search">
          <div className="compare-search-controls">
            <input
              type="search"
              className="compare-search-input"
              value={searchValue}
              onChange={(ev) => onSearchChange(ev.target.value)}
              placeholder="# fila, referencia, descripción, importe…"
              aria-label="Buscar por número de fila, referencia, descripción o importe"
              autoComplete="off"
            />
            {hasSearch ? (
              <button type="button" className="btn-secondary compare-search-clear" onClick={onSearchClear}>
                Limpiar
              </button>
            ) : null}
          </div>
        </div>

        <div className="compare-filters-field compare-filters-field--classif">
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
        </div>

        <div className="compare-filters-field compare-filters-field--date">
          <input
            type="date"
            value={dateFrom}
            onChange={(ev) => onDateFromChange(ev.target.value)}
            aria-label="Fecha desde"
          />
        </div>

        <div className="compare-filters-field compare-filters-field--date">
          <input
            type="date"
            value={dateTo}
            onChange={(ev) => onDateToChange(ev.target.value)}
            aria-label="Fecha hasta"
          />
        </div>

        <div className="compare-filters-field compare-filters-field--actions">
          {hasDates ? (
            <button type="button" className="btn-secondary compare-date-clear" onClick={onClearDates}>
              Quitar fechas
            </button>
          ) : null}
        </div>
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
  const groupRows: ComparisonRow[] = (detail.groups ?? [])
    .map((g) => {
      const banks = g.bankTxIds
        .map((id) => bankMap.get(id))
        .filter((m): m is MovimientoDto => m != null)
      const companies = g.companyTxIds
        .map((id) => companyMap.get(id))
        .filter((m): m is MovimientoDto => m != null)
      const group: GroupDto = {
        ...g,
        pairKind: effectivePairKindFromAmounts(g.bankSum, g.companySum, tol),
      }
      return {
        key: `group-${g.groupId}`,
        kind: 'group' as const,
        group,
        banks,
        companies,
      }
    })
    .sort((a, b) => {
      const da = a.group.bankMinDate ?? a.group.companyMinDate ?? ''
      const db = b.group.bankMinDate ?? b.group.companyMinDate ?? ''
      return da.localeCompare(db)
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
  return [...pairRows, ...groupRows, ...ub, ...uc]
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
  if (row.kind === 'group') {
    const k = pairKindForComparisonRow(row, sessionTolerance)
    if (k === 'OPPOSITE_SIGN') return 'row--opp-sign row--group'
    if (k != null && pairKindShowsAmountDifference(k)) return 'row--amount-gap row--group'
    return row.group.matchSource === 'MANUAL' ? 'row--manual row--group' : 'row--auto row--group'
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
  if (f === 'deferred-in') {
    return comparisonRowHasDeferredOrigin(row)
  }
  if (row.kind === 'group') {
    if (f === 'auto') return row.group.matchSource !== 'MANUAL'
    if (f === 'manual') return row.group.matchSource === 'MANUAL'
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
  } else if (row.kind === 'group') {
    for (const m of [...row.banks, ...row.companies]) {
      const d = normalizeRowDate(m.txDate)
      if (d) dates.push(d)
    }
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
  let deferredIn = 0
  for (const r of rows) {
    if (comparisonRowHasDeferredOrigin(r)) deferredIn += 1
    if (r.kind === 'pair' || r.kind === 'group') {
      const manualMatch = r.kind === 'pair' ? r.pair.matchSource === 'MANUAL' : r.group.matchSource === 'MANUAL'
      if (manualMatch) manual += 1
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
    deferredIn,
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
    {
      id: 'deferred-in',
      label: 'Incorporado dif.',
      swatch: 'compare-swatch--deferred-in',
      count: counts.deferredIn,
      title: 'Movimientos incorporados desde diferidos de otro período',
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
            onClick={() => onFilter(filter === id ? 'all' : id)}
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

function PendingDeferButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="defer-pending-btn"
      onClick={onClick}
      title="Diferir a próxima conciliación"
      aria-label="Diferir a próxima conciliación"
    >
      <svg className="defer-pending-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect
          x="3"
          y="5"
          width="13"
          height="14"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path d="M3 9.5h13" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M7 3v3.5M12 3v3.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M18.5 12h3M20.5 10l2 2-2 2"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
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

function groupAttachmentsListUrl(sessionId: number, groupId: number): string {
  return `/api/v1/conciliacion/sessions/${sessionId}/grupos/${groupId}/adjuntos`
}

function groupAttachmentFileUrl(sessionId: number, groupId: number, attachmentId: number): string {
  return `/api/v1/conciliacion/sessions/${sessionId}/grupos/${groupId}/adjuntos/${attachmentId}/archivo`
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
      movementLabel?: string
    }
  | {
      kind: 'pair'
      sessionId: number
      pairId: number
      sessionClosed: boolean
      onAfterChange: () => void
    }
  | {
      kind: 'group'
      sessionId: number
      groupId: number
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
      : props.kind === 'group'
        ? groupAttachmentsListUrl(props.sessionId, props.groupId)
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
    if (props.kind === 'group') {
      return groupAttachmentFileUrl(props.sessionId, props.groupId, a.id)
    }
    return attachmentFileUrl(props.sessionId, props.side, props.txId, a.id)
  }

  const showSideHeading = props.kind === 'movement' && props.showSideHeading

  return (
    <>
      <div className={showSideHeading ? 'pair-thread-section' : undefined}>
        {showSideHeading && props.kind === 'movement' ? (
          <h4 className="pair-thread-heading">
            {props.movementLabel ?? (props.side === 'bank' ? 'Banco' : 'Empresa')}
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
  detail,
  sessionClosed,
  onClose,
  onAfterChange,
}: {
  sessionId: number
  target: PendingAttachmentTarget | null
  detail: SessionDetail | null
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
            <p className="msg subtle comment-modal-readonly">Conciliación cerrada: solo lectura y descarga.</p>
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

  if (target.kind === 'group') {
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
            <h3 id="attachment-modal-title">Adjuntos del grupo conciliado</h3>
            <button type="button" className="comment-modal-close" onClick={onClose} aria-label="Cerrar">
              ×
            </button>
          </header>
          <p className="comment-modal-hint">
            Comprobantes del grupo N:M (todos los movimientos vinculados). PDF o imagen (PNG, JPG, WEBP, GIF), máx. 20
            MB.
          </p>
          {sessionClosed && (
            <p className="msg subtle comment-modal-readonly">Conciliación cerrada: solo lectura y descarga.</p>
          )}
          <PendingAttachmentSidePanel
            kind="group"
            sessionId={sessionId}
            groupId={target.groupId}
            sessionClosed={sessionClosed}
            onAfterChange={onAfterChange}
          />
        </div>
      </div>
    )
  }

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
            Adjuntos · {movementModalLabel(detail, target.side, target.txId)}
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
          <p className="msg subtle comment-modal-readonly">Conciliación cerrada: solo lectura y descarga.</p>
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
  movementLabel,
}: {
  sessionId: number
  side: 'bank' | 'company'
  txId: number
  sessionClosed: boolean
  onAfterChange: () => void
  showSideHeading: boolean
  movementLabel?: string
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
        <h4 className="pair-thread-heading">{movementLabel ?? sideLabel}</h4>
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

function GroupCommentPanel({
  sessionId,
  groupId,
  sessionClosed,
  onAfterChange,
}: {
  sessionId: number
  groupId: number
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
        const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/grupos/${groupId}/comentarios`)
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
  }, [sessionId, groupId])

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
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/grupos/${groupId}/comentarios`, {
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
            placeholder="Ej.: acordamos el ajuste por comisión bancaria…"
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

function SessionActivityModal({
  sessionId,
  entries,
  loading,
  error,
  onClose,
}: {
  sessionId: number
  entries: SessionAuditEntry[]
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="comment-modal-backdrop session-activity-backdrop" role="presentation" onClick={onClose}>
      <div
        className="comment-modal session-activity-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-activity-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="comment-modal-head session-activity-head">
          <div className="session-activity-head-block">
            <p className="session-activity-kicker">Historial de auditoría</p>
            <h3 id="session-activity-title" className="session-activity-title">
              Actividad de la sesión{' '}
              <span className="session-activity-id-chip" title={`ID ${sessionId}`}>
                #{sessionId}
              </span>
            </h3>
          </div>
          <button type="button" className="comment-modal-close session-activity-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <p className="session-activity-hint">
          Importación, apertura del detalle, conciliación, cortes de jornada, saldos, cierre y reapertura (admin) — quién y cuándo.
        </p>
        {loading && (
          <div className="session-activity-state session-activity-state--loading" aria-busy="true">
            <span className="session-activity-spinner" aria-hidden />
            Cargando eventos…
          </div>
        )}
        {error && (
          <div className="session-activity-state session-activity-state--error">
            <p className="msg err session-activity-err">{error}</p>
          </div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div className="session-activity-state session-activity-state--empty">
            <p className="session-activity-empty-text">No hay eventos registrados para esta sesión.</p>
          </div>
        )}
        {!loading && !error && entries.length > 0 && (
          <ul className="session-activity-list">
            {entries.map((e) => (
              <li key={e.id} className="session-activity-item" data-event={e.eventType}>
                <div className="session-activity-card">
                  <div className="session-activity-card-top">
                    <span className="session-activity-label">{e.eventLabel}</span>
                    <time className="session-activity-time" dateTime={e.createdAt}>
                      {formatSessionListWhen(e.createdAt)}
                    </time>
                  </div>
                  <div className="session-activity-user-row">
                    <span className="session-activity-user">{formatCommentAuthor(e.username)}</span>
                  </div>
                  {e.detail != null && e.detail.trim() !== '' && (
                    <p className="session-activity-detail">{e.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function PendingCommentsModal({
  sessionId,
  target,
  detail,
  sessionClosed,
  onClose,
  onAfterChange,
}: {
  sessionId: number
  target: PendingThreadTarget | null
  detail: SessionDetail | null
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
            <p className="msg subtle comment-modal-readonly">Conciliación cerrada: solo lectura.</p>
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

  if (target.kind === 'group') {
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
            <h3 id="comment-modal-title">Comentarios del grupo conciliado</h3>
            <button type="button" className="comment-modal-close" onClick={onClose} aria-label="Cerrar">
              ×
            </button>
          </header>
          <p className="comment-modal-hint">
            Un solo hilo por fila de grupo N:M (todos los movimientos vinculados).
          </p>
          {sessionClosed && (
            <p className="msg subtle comment-modal-readonly">Conciliación cerrada: solo lectura.</p>
          )}
          <GroupCommentPanel
            sessionId={sessionId}
            groupId={target.groupId}
            sessionClosed={sessionClosed}
            onAfterChange={onAfterChange}
          />
        </div>
      </div>
    )
  }

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
            Conversación · {movementModalLabel(detail, target.side, target.txId)}
          </h3>
          <button type="button" className="comment-modal-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <p className="comment-modal-hint">
          El historial queda guardado en esta sesión junto al movimiento (conciliado o pendiente).
        </p>
        {sessionClosed && (
          <p className="msg subtle comment-modal-readonly">Conciliación cerrada: solo lectura.</p>
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

function DeferredOriginChips({ movements }: { movements: MovimientoDto[] }) {
  const withOrigin = movements.filter(hasDeferredOrigin)
  if (withOrigin.length === 0) return null
  return (
    <>
      {withOrigin.map((m) => (
        <CompareEstadoChip
          key={`dif-${m.id}`}
          abbr="Dif←"
          title={deferredOriginTitle(m)}
          className="compare-badge compare-badge--estado compare-badge--deferred-in"
        />
      ))}
    </>
  )
}

function CompareEstadoChips({ children }: { children: ReactNode }) {
  return <div className="compare-estado-chips">{children}</div>
}

function CompareEstadoChip({
  abbr,
  title,
  className,
  onClick,
  active,
}: {
  abbr: string
  title: string
  className: string
  onClick?: () => void
  active?: boolean
}) {
  const cls = [
    className,
    'compare-estado-chip',
    onClick ? 'compare-hint-btn' : '',
    active ? 'compare-estado-chip--selected' : '',
  ]
    .filter(Boolean)
    .join(' ')
  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        title={title}
        aria-label={title}
        aria-pressed={active ?? false}
        onMouseDown={(ev) => ev.preventDefault()}
        onClick={(ev) => {
          ev.preventDefault()
          onClick()
        }}
      >
        {abbr}
      </button>
    )
  }
  return (
    <span className={cls} title={title} aria-label={title}>
      {abbr}
    </span>
  )
}

function CompareLinkPickCell({
  side,
  txId,
  linkMode,
  onTogglePending,
  className,
  children,
}: {
  side: 'bank' | 'company'
  txId: number
  linkMode?: boolean
  onTogglePending?: (side: 'bank' | 'company', txId: number) => void
  className?: string
  children: ReactNode
}) {
  const pickable = linkMode && onTogglePending != null
  const cls = [
    className,
    pickable ? 'compare-td-link-pick' : '',
    pickable ? `compare-td-link-pick--${side}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (!pickable) {
    return <td className={cls || undefined}>{children}</td>
  }

  const title = 'Clic para seleccionar o quitar este pendiente'

  return (
    <td
      className={cls}
      title={title}
      onMouseDown={(ev) => ev.preventDefault()}
      onClick={() => onTogglePending(side, txId)}
    >
      {children}
    </td>
  )
}

function PendingHintBadges({
  m,
  side,
  onInspect,
}: {
  m: MovimientoDto
  side: 'bank' | 'company'
  onInspect?: (req: CounterpartInspectRequest) => void
}) {
  const fuzzyLabel = fuzzyMatchBadgeLabel(m)
  if (!m.duplicateInFile && !fuzzyLabel) return null
  const fuzzyTitle =
    m.fuzzyHint?.trim() || fuzzyLabel || 'Posible match — Ver candidato y vincular'
  return (
    <>
      {m.duplicateInFile ? (
        <CompareEstadoChip
          abbr="Dup"
          title="Duplicado — Ver otros movimientos con la misma fecha e importe"
          className="compare-badge compare-badge--estado compare-badge--dup"
          onClick={() => onInspect?.({ mode: 'duplicate', side, mov: m })}
        />
      ) : null}
      {fuzzyLabel ? (
        <CompareEstadoChip
          abbr="PM"
          title={fuzzyTitle}
          className="compare-badge compare-badge--estado compare-badge--fuzzy"
          onClick={() => onInspect?.({ mode: 'fuzzy', side, mov: m })}
        />
      ) : null}
    </>
  )
}

function ComparisonTable({
  rows,
  allRowsCount,
  baselineRowNumbers,
  lockedColWidths,
  onLockedColWidthsChange,
  selectedId,
  sessionId,
  canShareInChat,
  sessionClosed,
  classificationReadOnly,
  sessionAmountTolerance,
  classificationSuggestions,
  onUnlinkPair,
  onUnlinkGroup,
  onSetClassification,
  onSetPairClassification,
  onSetGroupClassification,
  onOpenPendingComments,
  onOpenPendingAttachments,
  onInspectCounterpart,
  onDeferMovement,
  linkMode,
  selectedBankIds,
  selectedCompanyIds,
  onTogglePending,
}: {
  rows: ComparisonRow[]
  /** Total sin filtrar; si es 0 la sesión está vacía. */
  allRowsCount: number
  /** Número de fila estable (#) respecto a estado/fechas (no cambia al buscar). */
  baselineRowNumbers?: Map<string, number>
  /** Anchos de columna (persistidos en el padre para sobrevivir cambio de vista). */
  lockedColWidths: number[] | null
  onLockedColWidthsChange: (widths: number[] | null) => void
  selectedId: number | null
  sessionId: number | null
  canShareInChat: boolean
  /** Sesión cerrada: oculta desvincular y bloquea clasificación en pendientes. */
  sessionClosed: boolean
  /** Sesión cerrada o rol solo consulta: inputs de clasificación deshabilitados. */
  classificationReadOnly: boolean
  /** Tolerancia de importe guardada en sesión (0 es válido). */
  sessionAmountTolerance: number | null | undefined
  /** Clasificaciones ya usadas en la sesión (sugerencias al escribir). */
  classificationSuggestions: readonly string[]
  onUnlinkPair: (pairId: number, matchSource: 'MANUAL' | 'AUTO') => void
  onUnlinkGroup?: (groupId: number) => void
  onSetClassification: (side: 'bank' | 'company', txId: number, classification: string) => void
  /** Una sola clasificación por fila de par conciliado. */
  onSetPairClassification: (pairId: number, classification: string) => void
  /** Una sola clasificación por fila de grupo N:M. */
  onSetGroupClassification: (groupId: number, classification: string) => void
  /** Conversación archivada por movimiento pendiente o por par (un solo control por fila conciliada). */
  onOpenPendingComments?: (target: PendingThreadTarget) => void
  /** Comprobantes adjuntos al pendiente o al par. */
  onOpenPendingAttachments?: (target: PendingAttachmentTarget) => void
  /** Posible match / duplicado: comparar y vincular. */
  onInspectCounterpart?: (req: CounterpartInspectRequest) => void
  /** Diferir pendiente a la bolsa para la próxima conciliación. */
  onDeferMovement?: (side: 'bank' | 'company', txId: number) => void
  /** Selección de pendientes para vincular / agrupar. */
  linkMode?: boolean
  selectedBankIds?: ReadonlySet<number>
  selectedCompanyIds?: ReadonlySet<number>
  onTogglePending?: (side: 'bank' | 'company', txId: number) => void
}) {
  const tableRef = useRef<HTMLTableElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [expandedGroupSides, setExpandedGroupSides] = useState<Set<string>>(() => new Set())
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.()
      document.body.classList.remove('compare-col-resize-active')
    }
  }, [])

  useLayoutEffect(() => {
    if (lockedColWidths == null) return
    const normalized = normalizeCompareColumnWidths(lockedColWidths)
    if (normalized.some((w, i) => w !== lockedColWidths[i])) {
      onLockedColWidthsChange(normalized)
      if (sessionId != null) saveCompareColumnWidths(sessionId, normalized)
    }
  }, [lockedColWidths, onLockedColWidthsChange, sessionId])

  const handleColumnResizeStart = useCallback(
    (leftCol: number, ev: React.PointerEvent<HTMLSpanElement>) => {
      if (lockedColWidths == null) return
      const target = ev.currentTarget
      target.setPointerCapture(ev.pointerId)
      const startWidths = lockedColWidths
      resizeCleanupRef.current?.()
      resizeCleanupRef.current = beginCompareColumnResize(
        startWidths,
        leftCol,
        ev.clientX,
        (next) => onLockedColWidthsChange(next),
        (finalWidths) => {
          if (sessionId != null) saveCompareColumnWidths(sessionId, finalWidths)
        },
      )
    },
    [lockedColWidths, onLockedColWidthsChange, sessionId],
  )

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (sessionId != null) {
          const saved = loadCompareColumnWidths(sessionId)
          if (saved) {
            onLockedColWidthsChange(saved)
            return
          }
        }
        onLockedColWidthsChange(null)
      }, 200)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (timer) clearTimeout(timer)
    }
  }, [onLockedColWidthsChange, sessionId])

  const canCaptureColumnLayout = rows.length > 0 && rows.length === allRowsCount

  useLayoutEffect(() => {
    if (lockedColWidths != null) return
    if (sessionId != null) {
      const saved = loadCompareColumnWidths(sessionId)
      if (saved) {
        onLockedColWidthsChange(saved)
        return
      }
    }
    if (!canCaptureColumnLayout) return
    const table = tableRef.current
    if (!table) return
    const widths = measureCompareTableColumnWidths(table)
    if (widths) onLockedColWidthsChange(widths)
  }, [canCaptureColumnLayout, lockedColWidths, onLockedColWidthsChange, rows, sessionId])

  useEffect(() => {
    const validGroupKeys = new Set(rows.filter((r) => r.kind === 'group').map((r) => r.key))
    setExpandedGroupSides((prev) => {
      const next = new Set(
        [...prev].filter((k) => {
          const sep = k.lastIndexOf('::')
          if (sep < 0) return false
          const rowKey = k.slice(0, sep)
          const side = k.slice(sep + 2)
          return validGroupKeys.has(rowKey) && (side === 'bank' || side === 'company')
        }),
      )
      return next.size === prev.size ? prev : next
    })
  }, [rows])

  function toggleGroupSideExpand(key: string, side: 'bank' | 'company') {
    const sideKey = compareGroupSideKey(key, side)
    setExpandedGroupSides((prev) => {
      const next = new Set(prev)
      if (next.has(sideKey)) next.delete(sideKey)
      else next.add(sideKey)
      return next
    })
  }

  const lockedTableWidthPx = useMemo(
    () => (lockedColWidths != null ? compareTableTotalWidth(lockedColWidths) : null),
    [lockedColWidths],
  )

  return (
    <div className="table-wrap compare-table-wrap table-wrap--scrollY">
      <div
        ref={innerRef}
        className="compare-table-inner"
        style={
          lockedTableWidthPx != null
            ? { width: `${lockedTableWidthPx}px`, minWidth: `${lockedTableWidthPx}px` }
            : undefined
        }
      >
        {lockedColWidths ? (
          <CompareTableColumnResizeRails
            tableRef={tableRef}
            innerRef={innerRef}
            widths={lockedColWidths}
            onResizeStart={handleColumnResizeStart}
          />
        ) : null}
        <table
          ref={tableRef}
          className={`data-table compare-table${lockedColWidths ? ' compare-table--cols-locked' : ''}`}
          style={
            lockedTableWidthPx != null
              ? { width: `${lockedTableWidthPx}px`, minWidth: `${lockedTableWidthPx}px` }
              : undefined
          }
        >
        {lockedColWidths ? (
          <colgroup>
            {lockedColWidths.map((w, i) => (
              <col key={i} style={{ width: `${w}px` }} />
            ))}
          </colgroup>
        ) : null}
        <thead>
          <tr>
            <th rowSpan={2} className="rownum-th" aria-label="Número de fila">
              #
            </th>
            <th rowSpan={2} className="compare-th-tipo">
              Estado
            </th>
            <th colSpan={3} className="compare-th-group compare-th-group--bank">
              Banco
            </th>
            <th colSpan={3} className="compare-th-group">
              Empresa
            </th>
            <th rowSpan={2} className="compare-th-delta" title="Diferencia de importe (empresa − banco)">
              Δ
            </th>
            <th rowSpan={2} className="compare-th-clasif">
              Clasif.
            </th>
            <th rowSpan={2} className="compare-th-notes" scope="col" title="Notas, adjuntos y diferir a próxima conciliación">
              Notas
            </th>
            <th rowSpan={2} className="compare-th-unlink" scope="col" aria-label="Desvincular par o grupo"></th>
          </tr>
          <tr>
            <th>Fecha</th>
            <th>Importe</th>
            <th className="compare-th-split-edge">Ref. / desc.</th>
            <th>Fecha</th>
            <th>Importe</th>
            <th className="compare-th-split-edge">Ref. / desc.</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={12} className="compare-empty">
                {allRowsCount === 0
                  ? 'No hay movimientos en esta sesión.'
                  : 'No hay filas que coincidan. Probá «Todos», ampliá fechas, vaciá el buscador o el filtro de clasificación, o cambiá el texto.'}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => {
              const displayRowNum = baselineRowNumbers?.get(row.key) ?? idx + 1
              const cls = rowClassForComparison(row, sessionAmountTolerance)
              const shareRef =
                canShareInChat && sessionId != null
                  ? buildShareRefFromComparisonRow(sessionId, row, displayRowNum)
                  : null
              if (row.kind === 'pair') {
                const { pair, bank, company } = row
                const delta = coerceAmount(company.amount) - coerceAmount(bank.amount)
                const deltaStr =
                  Math.abs(delta) < 1e-9 ? '0' : delta.toFixed(2)
                const estado = pairEstadoMeta(pair, bank, company, sessionAmountTolerance)
                return (
                  <tr key={row.key} data-row-key={row.key} className={cls}>
                    <td className="rownum-td">{displayRowNum}</td>
                    <td className="compare-td-tipo">
                      <CompareEstadoChips>
                        <CompareEstadoChip
                          abbr={estado.abbr}
                          title={estado.label}
                          className={estado.badgeClass}
                        />
                        <DeferredOriginChips movements={[bank, company]} />
                      </CompareEstadoChips>
                    </td>
                    <td className="cell-date-nowrap">{formatDisplayDate(bank.txDate)}</td>
                    <td>{bank.amount}</td>
                    <td className="compare-td-split-edge cell-desc">
                      {[bank.reference, bank.description].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="cell-date-nowrap">
                      {formatDisplayDate(company.txDate)}
                    </td>
                    <td>{company.amount}</td>
                    <td className="compare-td-split-edge cell-desc">
                      {[company.reference, company.description].filter(Boolean).join(' · ') ||
                        '—'}
                    </td>
                    <td className="compare-delta" title={deltaStr}>
                      {deltaStr}
                    </td>
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
                        {shareRef ? <ShareInChatButton shareRef={shareRef} /> : null}
                      </div>
                    </td>
                    <td className="compare-td-unlink">
                      {selectedId != null && !sessionClosed && !classificationReadOnly ? (
                        <UnlinkPairButton
                          variant="icon"
                          matchSource={pair.matchSource === 'MANUAL' ? 'MANUAL' : 'AUTO'}
                          onClick={() =>
                            onUnlinkPair(
                              pair.pairId,
                              pair.matchSource === 'MANUAL' ? 'MANUAL' : 'AUTO',
                            )
                          }
                        />
                      ) : null}
                    </td>
                  </tr>
                )
              }
              if (row.kind === 'group') {
                const { group } = row
                return (
                  <CompareGroupTableRows
                    key={row.key}
                    row={row}
                    rowNum={displayRowNum}
                    rowClass={cls}
                    expandedBank={expandedGroupSides.has(compareGroupSideKey(row.key, 'bank'))}
                    expandedCompany={expandedGroupSides.has(compareGroupSideKey(row.key, 'company'))}
                    onToggleBankExpand={() => toggleGroupSideExpand(row.key, 'bank')}
                    onToggleCompanyExpand={() => toggleGroupSideExpand(row.key, 'company')}
                    sessionAmountTolerance={sessionAmountTolerance}
                    classificationReadOnly={classificationReadOnly}
                    sessionClosed={sessionClosed}
                    selectedId={selectedId}
                    onUnlinkGroup={onUnlinkGroup}
                    classificationSuggestions={classificationSuggestions}
                    onSetGroupClassification={onSetGroupClassification}
                    notesTools={
                      <div className="compare-pending-tools">
                        {onOpenPendingComments ? (
                          <PendingConversationButton
                            commentCount={group.groupCommentCount ?? 0}
                            onClick={() =>
                              onOpenPendingComments({
                                kind: 'group',
                                groupId: group.groupId,
                              })
                            }
                          />
                        ) : null}
                        {onOpenPendingAttachments ? (
                          <PendingAttachmentButton
                            attachmentCount={group.groupAttachmentCount ?? 0}
                            onClick={() =>
                              onOpenPendingAttachments({
                                kind: 'group',
                                groupId: group.groupId,
                              })
                            }
                          />
                        ) : null}
                        {shareRef ? <ShareInChatButton shareRef={shareRef} /> : null}
                      </div>
                    }
                  />
                )
              }
              if (row.kind === 'unmatchedBank') {
                const { m } = row
                const pendingSelected = linkMode && (selectedBankIds?.has(m.id) ?? false)
                return (
                  <tr
                    key={row.key}
                    data-row-key={row.key}
                    className={[cls, pendingSelected ? 'compare-row--link-selected' : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td className="rownum-td">{displayRowNum}</td>
                    <td className="compare-td-tipo compare-td-tipo--stack">
                      <CompareEstadoChips>
                        <CompareEstadoChip
                          abbr="PB"
                          title={
                            linkMode
                              ? pendingSelected
                                ? 'Quitar selección · Enter confirma vínculo'
                                : 'Seleccionar para vincular · Enter confirma'
                              : 'Pendiente banco'
                          }
                          className="compare-badge compare-badge--estado compare-badge--warn"
                          active={pendingSelected}
                          onClick={
                            linkMode && onTogglePending
                              ? () => onTogglePending('bank', m.id)
                              : undefined
                          }
                        />
                        <PendingHintBadges m={m} side="bank" onInspect={onInspectCounterpart} />
                        <DeferredOriginChips movements={[m]} />
                      </CompareEstadoChips>
                    </td>
                    <CompareLinkPickCell
                      side="bank"
                      txId={m.id}
                      linkMode={linkMode}
                      onTogglePending={onTogglePending}
                      className="cell-date-nowrap"
                    >
                      {formatDisplayDate(m.txDate)}
                    </CompareLinkPickCell>
                    <CompareLinkPickCell
                      side="bank"
                      txId={m.id}
                      linkMode={linkMode}
                      onTogglePending={onTogglePending}
                    >
                      {m.amount}
                    </CompareLinkPickCell>
                    <CompareLinkPickCell
                      side="bank"
                      txId={m.id}
                      linkMode={linkMode}
                      onTogglePending={onTogglePending}
                      className="compare-td-split-edge cell-desc"
                    >
                      {[m.reference, m.description].filter(Boolean).join(' · ') || '—'}
                    </CompareLinkPickCell>
                    <td colSpan={3} className="compare-td-split-start compare-muted">
                      —
                    </td>
                    <td className="compare-muted">—</td>
                    <td className="compare-td-clasif-pair">
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
                        {shareRef ? <ShareInChatButton shareRef={shareRef} /> : null}
                        {onDeferMovement ? (
                          <PendingDeferButton onClick={() => onDeferMovement('bank', m.id)} />
                        ) : null}
                      </div>
                    </td>
                    <td className="compare-muted">—</td>
                  </tr>
                )
              }
              const { m } = row
              const pendingSelected = linkMode && (selectedCompanyIds?.has(m.id) ?? false)
              return (
                <tr
                  key={row.key}
                  data-row-key={row.key}
                  className={[cls, pendingSelected ? 'compare-row--link-selected' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td className="rownum-td">{displayRowNum}</td>
                  <td className="compare-td-tipo compare-td-tipo--stack">
                    <CompareEstadoChips>
                      <CompareEstadoChip
                        abbr="PE"
                        title={
                          linkMode
                            ? pendingSelected
                              ? 'Quitar selección · Enter confirma vínculo'
                              : 'Seleccionar para vincular · Enter confirma'
                            : 'Pendiente empresa'
                        }
                        className="compare-badge compare-badge--estado compare-badge--company"
                        active={pendingSelected}
                        onClick={
                          linkMode && onTogglePending
                            ? () => onTogglePending('company', m.id)
                            : undefined
                        }
                      />
                      <PendingHintBadges m={m} side="company" onInspect={onInspectCounterpart} />
                      <DeferredOriginChips movements={[m]} />
                    </CompareEstadoChips>
                  </td>
                  <td colSpan={3} className="compare-td-split-edge compare-muted">
                    —
                  </td>
                  <CompareLinkPickCell
                    side="company"
                    txId={m.id}
                    linkMode={linkMode}
                    onTogglePending={onTogglePending}
                    className="cell-date-nowrap"
                  >
                    {formatDisplayDate(m.txDate)}
                  </CompareLinkPickCell>
                  <CompareLinkPickCell
                    side="company"
                    txId={m.id}
                    linkMode={linkMode}
                    onTogglePending={onTogglePending}
                  >
                    {m.amount}
                  </CompareLinkPickCell>
                  <CompareLinkPickCell
                    side="company"
                    txId={m.id}
                    linkMode={linkMode}
                    onTogglePending={onTogglePending}
                    className="compare-td-split-edge cell-desc"
                  >
                    {[m.reference, m.description].filter(Boolean).join(' · ') || '—'}
                  </CompareLinkPickCell>
                  <td className="compare-muted">—</td>
                  <td className="compare-td-clasif-pair">
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
                      {shareRef ? <ShareInChatButton shareRef={shareRef} /> : null}
                      {onDeferMovement ? (
                        <PendingDeferButton onClick={() => onDeferMovement('company', m.id)} />
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
    </div>
  )
}

export default function ConciliacionPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const shareDeepLinkSetupRef = useRef<string | null>(null)
  const shareDeepLinkScrollRef = useRef<string | null>(null)
  const canShareInChat =
    user != null && (CAN_SHARE_IN_CHAT as readonly string[]).includes(user.role)
  const [bankFiles, setBankFiles] = useState<File[]>([])
  const [companyFiles, setCompanyFiles] = useState<File[]>([])
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
  const [selectedId, setSelectedId] = useState<number | null>(() =>
    parseSessionIdFromSearchParam(searchParams),
  )
  const [showImportForm, setShowImportForm] = useState(false)
  const [activeSection, setActiveSection] = useState<ConciliacionSectionId>(() =>
    parseSessionIdFromSearchParam(searchParams) != null ? 'sesion' : 'sesiones',
  )
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) === '1',
  )
  const sectionNavRef = useRef<ConciliacionSectionNavHandle>(null)
  const contentAreaRef = useRef<HTMLElement>(null)

  const focusContentArea = useCallback(() => {
    contentAreaRef.current?.focus({ preventScroll: true })
  }, [])

  const scrollSessionSectionToTop = useCallback(() => {
    window.requestAnimationFrame(() => scrollConciliacionWorkspaceToTop())
  }, [])
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

  const [manualLoading, setManualLoading] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [closeSessionLoading, setCloseSessionLoading] = useState(false)
  const [reopenSessionLoading, setReopenSessionLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [activityModalSessionId, setActivityModalSessionId] = useState<number | null>(null)
  const [activityEntries, setActivityEntries] = useState<SessionAuditEntry[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [balancesModalOpen, setBalancesModalOpen] = useState(false)

  const [detailLayout, setDetailLayout] = useState<'compare' | 'rubro' | 'ledger'>('compare')
  const [compareTableColWidths, setCompareTableColWidths] = useState<number[] | null>(null)
  const [compareFilter, setCompareFilter] = useState<CompareFilterKind>('all')
  const [compareDateFrom, setCompareDateFrom] = useState('')
  const [compareDateTo, setCompareDateTo] = useState('')
  const [compareSearchQuery, setCompareSearchQuery] = useState('')
  const [compareClassificationFilter, setCompareClassificationFilter] = useState('')

  const [commentTarget, setCommentTarget] = useState<PendingThreadTarget | null>(null)
  const [attachmentTarget, setAttachmentTarget] = useState<PendingAttachmentTarget | null>(null)
  const [comparePairLinkOpen, setComparePairLinkOpen] = useState(false)
  const [compareClassifyLoading, setCompareClassifyLoading] = useState(false)
  const [compareClassifyError, setCompareClassifyError] = useState<string | null>(null)
  const [counterpartInspect, setCounterpartInspect] = useState<CounterpartInspectRequest | null>(
    null,
  )

  /** Si el GET del detalle aún no trae `amountTolerance`, usamos la del POST /conciliar reciente. */
  const [pendingSessionTolerance, setPendingSessionTolerance] = useState<number | null>(null)

  const selectSession = useCallback(
    (sessionId: number | null) => {
      setSelectedId(sessionId)
      setBalancesModalOpen(false)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (sessionId != null) {
            const prevSession = parseSessionIdFromSearchParam(prev)
            next.set('sesion', String(sessionId))
            if (prevSession !== sessionId) {
              next.delete('focus')
              next.delete('notas')
            }
          } else {
            next.delete('sesion')
            next.delete('focus')
            next.delete('notas')
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

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

  useEffect(() => {
    if (selectedId == null) {
      setCompareTableColWidths(null)
      return
    }
    setCompareTableColWidths(loadCompareColumnWidths(selectedId))
  }, [selectedId, comparisonRows.length])

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

  const comparisonRowNumbers = useMemo(() => {
    const map = new Map<string, number>()
    rowsAfterLegendAndDate.forEach((r, i) => map.set(r.key, i + 1))
    return map
  }, [rowsAfterLegendAndDate])

  const filteredComparisonRows = useMemo(() => {
    const filtered = rowsAfterLegendAndDate.filter(
      (r) =>
        rowMatchesSearch(r, compareSearchQuery, comparisonRowNumbers.get(r.key)) &&
        rowMatchesClassification(r, compareClassificationFilter),
    )
    const q = compareSearchQuery.trim()
    if (q === '') return filtered
    return [...filtered].sort((a, b) =>
      compareSearchRowOrder(
        a,
        b,
        q,
        comparisonRowNumbers.get(a.key),
        comparisonRowNumbers.get(b.key),
      ),
    )
  }, [rowsAfterLegendAndDate, compareSearchQuery, compareClassificationFilter, comparisonRowNumbers])

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
    for (const g of detail.groups ?? []) {
      const c = g.classification?.trim()
      if (c) s.add(c)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'))
  }, [detail])

  const detailMatchesSelection =
    selectedId != null && detail != null && detail.session.id === selectedId
  const sessionClosed = detailMatchesSelection && detail.session.status === 'CLOSED'
  /** Consulta: solo lectura en clasificación (además de sesión cerrada). */
  const classificationReadOnly = sessionClosed || user?.role === 'CONSULTA'
  const reconcileLocked =
    detailLoading || (detailMatchesSelection && detail.session.status === 'CLOSED')

  const compareLinkableBank = useMemo(
    () => (detail ? allBankMovementRefs(detail).filter(isRubroMovementLinkable) : []),
    [detail],
  )
  const compareLinkableCompany = useMemo(
    () => (detail ? allCompanyMovementRefs(detail).filter(isRubroMovementLinkable) : []),
    [detail],
  )

  const compareLinkMode =
    detailLayout === 'compare' &&
    !reconcileLocked &&
    compareLinkableBank.length > 0 &&
    compareLinkableCompany.length > 0

  const compareLinkPickerResetKey = useMemo(
    () =>
      detail
        ? [
            detail.session.id,
            ...compareLinkableBank.map((i) => i.m.id),
            ...compareLinkableCompany.map((i) => i.m.id),
          ].join('|')
        : '',
    [detail, compareLinkableBank, compareLinkableCompany],
  )

  const {
    selectedBankIds: compareSelectedBankIds,
    selectedCompanyIds: compareSelectedCompanyIds,
    selectedBank: compareSelectedBank,
    selectedCompany: compareSelectedCompany,
    toggleBank: compareToggleBank,
    toggleCompany: compareToggleCompany,
    clearSelection: clearCompareLinkSelection,
    bankSum: compareBankSum,
    companySum: compareCompanySum,
    delta: compareDelta,
    hasBank: compareHasBank,
    hasCompany: compareHasCompany,
    bothSides: compareBothSides,
    canGroupLink: compareCanGroupLink,
    pairPrompt: comparePairPrompt,
    hasSelection: compareHasSelection,
  } = usePendingMultiLinkPicker(
    compareLinkMode,
    compareLinkableBank,
    compareLinkableCompany,
    compareLinkPickerResetKey,
  )

  useEffect(() => {
    if (detailLayout !== 'compare') {
      clearCompareLinkSelection()
      setComparePairLinkOpen(false)
      setCompareClassifyError(null)
    }
  }, [detailLayout, clearCompareLinkSelection])

  useEffect(() => {
    if (!compareHasSelection) setCompareClassifyError(null)
  }, [compareHasSelection])

  const compareLinkScrollRef = useRef<{ win: number; table: number } | null>(null)

  const handleCompareTogglePending = useCallback(
    (side: 'bank' | 'company', txId: number) => {
      const tableWrap = document.querySelector<HTMLElement>('.compare-table-wrap')
      compareLinkScrollRef.current = {
        win: window.scrollY,
        table: tableWrap?.scrollTop ?? 0,
      }
      if (side === 'bank') compareToggleBank(txId)
      else compareToggleCompany(txId)
    },
    [compareToggleBank, compareToggleCompany],
  )

  useLayoutEffect(() => {
    const saved = compareLinkScrollRef.current
    if (!saved) return
    compareLinkScrollRef.current = null
    const tableWrap = document.querySelector<HTMLElement>('.compare-table-wrap')
    window.scrollTo(0, saved.win)
    if (tableWrap) tableWrap.scrollTop = saved.table
  }, [compareSelectedBankIds, compareSelectedCompanyIds])

  const logoutCheckpointRef = useRef<{ sessionId: number | null; canSave: boolean }>({
    sessionId: null,
    canSave: false,
  })
  logoutCheckpointRef.current = {
    sessionId:
      detailMatchesSelection && !sessionClosed && selectedId != null ? selectedId : null,
    canSave: !sessionClosed && user?.role !== 'CONSULTA',
  }

  useEffect(() => {
    return registerLogoutCheckpointProvider(() => {
      const { sessionId, canSave } = logoutCheckpointRef.current
      if (sessionId == null || !canSave) return null
      return { sessionId }
    })
  }, [])

  const counterpartModalPayload = useMemo(() => {
    if (!counterpartInspect || !detail) return null
    const { mode, side, mov } = counterpartInspect
    if (mode === 'fuzzy') {
      return {
        counterpart: resolveFuzzyCounterpart(detail, side, mov),
        duplicateSiblings: [] as MovimientoDto[],
      }
    }
    return {
      counterpart: null as MovimientoDto | null,
      duplicateSiblings: findDuplicateSiblings(detail, side, mov),
    }
  }, [counterpartInspect, detail])

  const scrollToComparisonRow = useCallback((rowKey: string) => {
    const tr = document.querySelector<HTMLTableRowElement>(
      `.compare-table-wrap tr[data-row-key="${rowKey}"]`,
    )
    if (!tr) return
    tr.scrollIntoView({ block: 'center', behavior: 'smooth' })
    tr.classList.remove('compare-row-flash')
    void tr.offsetWidth
    tr.classList.add('compare-row-flash')
    window.setTimeout(() => tr.classList.remove('compare-row-flash'), 2200)
  }, [])

  useEffect(() => {
    const sesionRaw = searchParams.get('sesion')
    const focusRaw = searchParams.get('focus')
    if (!sesionRaw?.trim() || !focusRaw?.trim()) return

    const sessionId = Number(sesionRaw)
    const focus = parseFocusFromSearchParam(focusRaw)
    if (!Number.isFinite(sessionId) || focus == null) return

    const linkKey = `${sessionId}:${focusRaw}:${searchParams.get('notas') ?? ''}`
    const navState = location.state as ConciliacionFocusNavState | null
    const refocusTick = navState?.conciliacionRefocus ?? 0
    const scrollToken = `${linkKey}:${refocusTick}`

    if (selectedId !== sessionId) {
      setSelectedId(sessionId)
      return
    }

    if (!detail || detail.session.id !== sessionId || detailLoading) return

    if (shareDeepLinkSetupRef.current !== linkKey) {
      shareDeepLinkSetupRef.current = linkKey
      setActiveSection('comparar')
      setDetailLayout('compare')
      setCompareFilter('all')
      setCompareSearchQuery('')
      setCompareClassificationFilter('')
      setCompareDateFrom('')
      setCompareDateTo('')

      if (searchParams.get('notas') === '1') {
        if (focus.kind === 'pair') {
          setCommentTarget({ kind: 'pair', pairId: focus.pairId })
        } else if (focus.kind === 'group') {
          setCommentTarget({ kind: 'group', groupId: focus.groupId })
        } else if (focus.kind === 'bank') {
          setCommentTarget({ kind: 'single', side: 'bank', txId: focus.txId })
        } else {
          setCommentTarget({ kind: 'single', side: 'company', txId: focus.txId })
        }
      }
    }

    if (shareDeepLinkScrollRef.current === scrollToken) return
    shareDeepLinkScrollRef.current = scrollToken

    const rowKey = shareRefToRowKey({
      sessionId,
      focus,
      label: '',
    })
    window.requestAnimationFrame(() => scrollToComparisonRow(rowKey))
  }, [
    searchParams,
    location.state,
    selectedId,
    detail,
    detailLoading,
    scrollToComparisonRow,
  ])

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

  const downloadSessionPdf = useCallback(async (sessionId: number) => {
    setExportError(null)
    setExportLoading(true)
    try {
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/export/pdf`)
      if (!r.ok) throw new Error(await parseError(r))
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `conciliacion-sesion-${sessionId}.pdf`
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

  const closeActivityModal = useCallback(() => {
    setActivityModalSessionId(null)
    setActivityEntries([])
    setActivityError(null)
  }, [])

  const openSessionActivity = useCallback(async (sessionId: number) => {
    setActivityModalSessionId(sessionId)
    setActivityLoading(true)
    setActivityError(null)
    setActivityEntries([])
    try {
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/activity`)
      if (!r.ok) throw new Error(await parseError(r))
      const data = (await r.json()) as SessionAuditEntry[]
      setActivityEntries(Array.isArray(data) ? data : [])
    } catch (e) {
      setActivityError(e instanceof Error ? e.message : String(e))
    } finally {
      setActivityLoading(false)
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

  const loadDetail = useCallback(async (id: number, options?: { soft?: boolean; opening?: boolean }) => {
    const soft = options?.soft === true
    const opening = options?.opening === true
    if (!soft) {
      setDetailLoading(true)
      setDetailError(null)
      setConciliarResult(null)
      setConciliarError(null)
    }
    try {
      const q = !soft && opening ? '?recordAccess=true' : ''
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${id}${q}`)
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
      selectSession(importResult.sessionId)
      setShowImportForm(false)
      setActiveSection('sesion')
      void loadSessionListPage(0)
    }
  }, [importResult, loadSessionListPage, selectSession])

  useEffect(() => {
    if (activeSection !== 'sesion') return
    scrollSessionSectionToTop()
  }, [activeSection, selectedId, scrollSessionSectionToTop])

  useEffect(() => {
    if (selectedId != null) {
      void loadDetail(selectedId, { opening: true })
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
    setCounterpartInspect(null)
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
    if (bankFiles.length === 0 || companyFiles.length === 0) {
      setImportError(
        'Seleccioná al menos un Excel de banco/tarjetas y uno de empresa/plataforma (.xls o .xlsx). Podés elegir varios de cada lado.',
      )
      return
    }
    setImporting(true)
    try {
      const fd = new FormData()
      for (const f of bankFiles) {
        fd.append('bank', f)
      }
      for (const f of companyFiles) {
        fd.append('company', f)
      }
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
      const raw = (await r.json()) as ImportResult
      setImportResult({
        ...raw,
        bankFileCount: typeof raw.bankFileCount === 'number' ? raw.bankFileCount : 1,
        companyFileCount: typeof raw.companyFileCount === 'number' ? raw.companyFileCount : 1,
        bankFileSummaries:
          raw.bankFileSummaries?.length > 0
            ? raw.bankFileSummaries
            : [{ fileName: raw.sourceBankFileName, rowCount: raw.bankRows }],
        companyFileSummaries:
          raw.companyFileSummaries?.length > 0
            ? raw.companyFileSummaries
            : [{ fileName: raw.sourceCompanyFileName, rowCount: raw.companyRows }],
      })
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  async function handleManualPairIds(bankId: number, companyId: number, opts?: { closeModal?: boolean }) {
    if (selectedId == null) return
    setManualLoading(true)
    setManualError(null)
    const y = window.scrollY
    try {
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${selectedId}/pares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankTransactionId: bankId,
          companyTransactionId: companyId,
        }),
      })
      if (!r.ok) throw new Error(await parseError(r))
      if (opts?.closeModal) setCounterpartInspect(null)
      setComparePairLinkOpen(false)
      clearCompareLinkSelection()
      await loadDetail(selectedId, { soft: true })
      await loadSessionListPage(sessionListPage)
      requestAnimationFrame(() => window.scrollTo({ top: y }))
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e))
    } finally {
      setManualLoading(false)
    }
  }

  async function handleCreateGroup(bankIds: number[], companyIds: number[]) {
    if (selectedId == null) return
    setManualLoading(true)
    setManualError(null)
    const y = window.scrollY
    try {
      await createReconciliationGroup(selectedId, bankIds, companyIds)
      setComparePairLinkOpen(false)
      clearCompareLinkSelection()
      await loadDetail(selectedId, { soft: true })
      await loadSessionListPage(sessionListPage)
      requestAnimationFrame(() => window.scrollTo({ top: y }))
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e))
    } finally {
      setManualLoading(false)
    }
  }

  useEffect(() => {
    if (detailLayout !== 'compare' || !compareLinkMode) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Enter' || ev.repeat) return
      if (comparePairLinkOpen || counterpartInspect || commentTarget || attachmentTarget) return
      if (
        ev.target instanceof HTMLElement &&
        ev.target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return
      }
      if (!compareBothSides) return
      if (compareCanGroupLink) {
        const bankIds = compareSelectedBank.map((i) => i.m.id)
        const companyIds = compareSelectedCompany.map((i) => i.m.id)
        const msg =
          `¿Conciliar grupo con ${bankIds.length} mov. banco y ${companyIds.length} mov. empresa?\n` +
          `Σ banco ${formatAmount(compareBankSum)} · Σ empresa ${formatAmount(compareCompanySum)}`
        ev.preventDefault()
        if (!window.confirm(msg)) return
        void handleCreateGroup(bankIds, companyIds)
        return
      }
      if (comparePairPrompt) {
        ev.preventDefault()
        setComparePairLinkOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    detailLayout,
    compareLinkMode,
    comparePairLinkOpen,
    counterpartInspect,
    commentTarget,
    attachmentTarget,
    compareBothSides,
    compareCanGroupLink,
    comparePairPrompt,
    compareSelectedBank,
    compareSelectedCompany,
    compareBankSum,
    compareCompanySum,
    sessionListPage,
    selectedId,
  ])

  async function handleUnlinkPair(pairId: number, matchSource: 'MANUAL' | 'AUTO'): Promise<boolean> {
    if (selectedId == null || classificationReadOnly) return false
    const msg =
      matchSource === 'MANUAL'
        ? '¿Quitar este vínculo manual? Los dos movimientos volverán a pendientes.'
        : '¿Desvincular este par automático? Los dos movimientos volverán a pendientes.'
    if (!window.confirm(msg)) return false
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
      return true
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  async function handleUnlinkGroup(groupId: number) {
    if (selectedId == null || classificationReadOnly) return
    if (
      !window.confirm(
        '¿Desvincular este grupo? Todos los movimientos volverán a pendientes en esta sesión.',
      )
    ) {
      return
    }
    setManualLoading(true)
    setManualError(null)
    const y = window.scrollY
    try {
      await deleteReconciliationGroup(selectedId, groupId)
      await loadDetail(selectedId, { soft: true })
      await loadSessionListPage(sessionListPage)
      requestAnimationFrame(() => window.scrollTo({ top: y }))
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e))
    } finally {
      setManualLoading(false)
    }
  }

  async function handleDeferMovement(side: 'bank' | 'company', txId: number) {
    if (selectedId == null || classificationReadOnly) return
    if (
      !window.confirm(
        '¿Diferir este movimiento a la próxima conciliación?\n\nDejará de figurar como pendiente en esta sesión y quedará guardado para incorporarlo en el próximo período.',
      )
    ) {
      return
    }
    try {
      await deferMovement(selectedId, side, txId)
      await loadDetail(selectedId, { soft: true })
      await loadSessionListPage(sessionListPage)
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleCloseSession() {
    if (selectedId == null) return
    if (
      !window.confirm(
        '¿Cerrar esta conciliación? Quedarán fijos los saldos, la clasificación de pendientes y no podrás ejecutar conciliación automática ni modificar vínculos.',
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

  async function handleReopenSession() {
    if (selectedId == null || user?.role !== 'ADMIN') return
    if (
      !window.confirm(
        '¿Reabrir esta conciliación? Volverán a poder modificarse saldos, clasificación y conciliación. Quedará registrado en Actividad.',
      )
    ) {
      return
    }
    const reasonRaw = window.prompt(
      'Motivo opcional (si lo escribís queda en Actividad). Podés dejar vacío o Cancelar para reabrir sin motivo.',
      '',
    )
    const reason = reasonRaw !== null && reasonRaw.trim() !== '' ? reasonRaw.trim() : null
    setReopenSessionLoading(true)
    setDetailError(null)
    try {
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${selectedId}/reapertura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!r.ok) throw new Error(await parseError(r))
      await loadDetail(selectedId, { soft: true })
      await loadSessionListPage(sessionListPage)
      if (activityModalSessionId === selectedId) {
        await openSessionActivity(selectedId)
      }
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e))
    } finally {
      setReopenSessionLoading(false)
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

  function handleSessionRenamed(sessionId: number, displayName: string | null) {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, displayName } : s)))
    setDetail((prev) =>
      prev && prev.session.id === sessionId
        ? { ...prev, session: { ...prev.session, displayName } }
        : prev,
    )
  }

  function openSessionFromList(sessionId: number) {
    selectSession(sessionId)
    setShowImportForm(false)
    setActiveSection('sesion')
    window.requestAnimationFrame(() => focusContentArea())
  }

  function startNewConciliacion() {
    setShowImportForm(true)
    selectSession(null)
    setImportError(null)
    setImportResult(null)
    setBankFiles([])
    setCompanyFiles([])
    setActiveSection('importar')
    window.requestAnimationFrame(() => focusContentArea())
  }

  function selectConciliacionSection(id: ConciliacionSectionId) {
    if (id === 'importar') {
      setShowImportForm(true)
    }
    if (id === 'comparar') setDetailLayout('compare')
    if (id === 'grupos') setDetailLayout('rubro')
    if (id === 'ledger') setDetailLayout('ledger')
    setActiveSection(id)
    window.requestAnimationFrame(() => focusContentArea())
  }

  function toggleNavCollapsed() {
    setNavCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(NAV_COLLAPSED_STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  function handleContentAreaKeyDown(ev: React.KeyboardEvent<HTMLElement>) {
    if (ev.key !== 'Escape' || ev.defaultPrevented) return
    if (
      balancesModalOpen ||
      activityModalSessionId != null ||
      commentTarget != null ||
      attachmentTarget != null ||
      counterpartInspect != null ||
      comparePairLinkOpen
    ) {
      return
    }
    ev.preventDefault()
    sectionNavRef.current?.focusActiveItem()
  }

  function closeImportForm() {
    setShowImportForm(false)
    setActiveSection('sesiones')
  }

  const selectedSessionName =
    selectedId != null
      ? sessions.find((s) => s.id === selectedId)?.displayName?.trim() || `Sesión #${selectedId}`
      : null

  const historySavedTabLabel =
    sessionListTotalElements === 0
      ? 'Sin sesiones guardadas'
      : sessionListTotalElements === 1
        ? '1 sesión guardada'
        : `${sessionListTotalElements} sesiones guardadas`

  const deferredNavIndicator = useMemo(() => {
    if (selectedId == null || !detailMatchesSelection || detail == null) return null

    const pendingIncorporate = detail.availableDeferredCount ?? 0
    const sentFromHere = (detail.deferredFromSession ?? []).filter(
      (d) => d.sourceSessionId === selectedId && d.status === 'AVAILABLE',
    ).length
    const incorporated = (detail.deferredIntoSession ?? []).length
    const total = pendingIncorporate + sentFromHere + incorporated

    if (total <= 0) return null

    return {
      total,
      pendingIncorporate,
      urgent: pendingIncorporate > 0,
    }
  }, [selectedId, detailMatchesSelection, detail])

  const navItems = useMemo((): ConciliacionNavItem[] => {
    const items: ConciliacionNavItem[] = [
      {
        id: 'sesiones',
        label: 'Sesiones',
        icon: <SessionsNavIcon />,
        badge:
          sessionListTotalElements > 0 ? String(sessionListTotalElements) : undefined,
      },
      {
        id: 'importar',
        label: 'Importar',
        icon: <ImportNavIcon />,
      },
    ]
    if (selectedId != null) {
      items.push(
        {
          id: 'sesion',
          label: 'Detalle y resumen',
          icon: <SessionNavIcon />,
        },
        {
          id: 'diferidos',
          label: 'Diferidos',
          icon: <DeferredNavIcon />,
          badge: deferredNavIndicator
            ? deferredNavIndicator.urgent
              ? String(deferredNavIndicator.pendingIncorporate)
              : String(deferredNavIndicator.total)
            : undefined,
          badgeAttention: deferredNavIndicator != null,
          badgeUrgent: deferredNavIndicator?.urgent ?? false,
        },
        {
          id: 'conciliar',
          label: 'Conciliar',
          icon: <ReconcileNavIcon />,
        },
        {
          id: 'comparar',
          label: 'Filtros',
          icon: <CompareNavIcon />,
        },
        {
          id: 'grupos',
          label: 'Grupos',
          icon: <GroupsNavIcon />,
        },
        {
          id: 'ledger',
          label: 'Vista paralela',
          icon: <LedgerNavIcon />,
        },
        {
          id: 'archivos',
          label: 'Actualizar archivos',
          icon: <FilesNavIcon />,
        },
        {
          id: 'cortes',
          label: 'Cortes',
          icon: <CheckpointsNavIcon />,
        },
      )
    }
    return items
  }, [selectedId, sessionListTotalElements, deferredNavIndicator])

  useEffect(() => {
    if (selectedId == null && SESSION_SECTION_IDS.includes(activeSection)) {
      setActiveSection('sesiones')
    }
  }, [selectedId, activeSection])

  useEffect(() => {
    if (!navItems.some((item) => item.id === activeSection)) {
      setActiveSection(navItems[0]?.id ?? 'sesiones')
    }
  }, [navItems, activeSection])

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

  async function handleCompareSelectionBulkClassify(classification: string) {
    if (selectedId == null) return
    setCompareClassifyLoading(true)
    setCompareClassifyError(null)
    const y = window.scrollY
    try {
      const targets = collectSelectionClassificationTargets(
        compareSelectedBank,
        compareSelectedCompany,
      )
      const payload = classification === '' ? null : classification
      for (const txId of targets.bankPendingIds) {
        const r = await apiFetch(
          `/api/v1/conciliacion/sessions/${selectedId}/pending/banco/${txId}/clasificacion`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classification: payload }),
          },
        )
        if (!r.ok) throw new Error(await parseError(r))
      }
      for (const txId of targets.companyPendingIds) {
        const r = await apiFetch(
          `/api/v1/conciliacion/sessions/${selectedId}/pending/empresa/${txId}/clasificacion`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classification: payload }),
          },
        )
        if (!r.ok) throw new Error(await parseError(r))
      }
      await loadDetail(selectedId, { soft: true })
      requestAnimationFrame(() => window.scrollTo({ top: y }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setCompareClassifyError(msg)
      setManualError(msg)
    } finally {
      setCompareClassifyLoading(false)
    }
  }

  async function handleSetGroupClassification(groupId: number, classification: string) {
    if (selectedId == null) return
    const y = window.scrollY
    try {
      const r = await apiFetch(
        `/api/v1/conciliacion/sessions/${selectedId}/grupos/${groupId}/clasificacion`,
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
    <div className={`app app--conciliacion${navCollapsed ? ' app--conc-nav-collapsed' : ''}`}>
      <ConciliacionSectionNav
        ref={sectionNavRef}
        items={navItems}
        activeId={activeSection}
        collapsed={navCollapsed}
        onToggleCollapsed={toggleNavCollapsed}
        onSelect={selectConciliacionSection}
      />

      <div className="conc-workspace">
        <main
          ref={contentAreaRef}
          className="conc-content-area"
          tabIndex={-1}
          onKeyDown={handleContentAreaKeyDown}
          aria-label="Contenido de la sección activa"
        >
          {activeSection === 'sesiones' && (
            <section className="conc-section-panel sessions-panel" aria-labelledby="sessions-hero-title">
              <header className="sessions-hero">
                <div className="sessions-hero-top">
                  <div className="sessions-hero-main">
                    <div className="sessions-hero-icon" aria-hidden>
                      <SessionsNavIcon />
                    </div>
                    <div className="sessions-hero-copy">
                      <span className="sessions-hero-eyebrow">Historial</span>
                      <h2 id="sessions-hero-title" className="sessions-hero-title">
                        Sesiones de conciliación
                      </h2>
                      <p className="sessions-hero-lead">
                        Cada importación queda guardada como una sesión con <strong>nombre editable</strong>.
                        Abrí una para conciliar, revisá su <strong>actividad</strong> o exportá el resultado en
                        Excel y PDF.
                      </p>
                    </div>
                  </div>
                  <button type="button" className="btn-import sessions-hero-cta" onClick={startNewConciliacion}>
                    Nueva conciliación
                  </button>
                </div>
                <ul className="sessions-hero-highlights" aria-label="Resumen del historial">
                  <li>
                    <span
                      className={`sessions-hero-chip${
                        sessionListTotalElements === 0 ? '' : ' sessions-hero-chip--count'
                      }`}
                    >
                      <span className="sessions-hero-chip-dot" aria-hidden />
                      {historySavedTabLabel}
                    </span>
                  </li>
                  {selectedSessionName ? (
                    <li>
                      <span className="sessions-hero-chip sessions-hero-chip--active">
                        <span className="sessions-hero-chip-dot" aria-hidden />
                        Activa: {selectedSessionName}
                      </span>
                    </li>
                  ) : null}
                  <li>
                    <span className="sessions-hero-chip">
                      <span className="sessions-hero-chip-dot" aria-hidden />
                      Hasta {SESSION_HISTORY_PAGE_SIZE} por página
                    </span>
                  </li>
                </ul>
              </header>

              <div className="sessions-body">
                {sessionsError && <p className="msg err">{sessionsError}</p>}
                {exportError && selectedId == null && (
                  <p className="msg err" role="alert">
                    {exportError}
                  </p>
                )}
                {sessions.length === 0 && !sessionsError && (
                  <div className="sessions-empty">
                    <p className="sessions-empty-title">Todavía no hay sesiones importadas</p>
                    <p className="sessions-empty-lead">
                      Importá los extractos de banco y empresa para crear tu primera sesión de conciliación.
                    </p>
                    <button type="button" className="btn-import" onClick={startNewConciliacion}>
                      Importar archivos
                    </button>
                  </div>
                )}
                {sessions.length > 0 && (
                  <SessionHistoryList
                    sessions={sessions}
                    selectedId={selectedId}
                    exportLoading={exportLoading}
                    onOpen={openSessionFromList}
                    onActivity={(id) => void openSessionActivity(id)}
                    onExportExcel={(id) => void downloadSessionExcel(id)}
                    onExportPdf={(id) => void downloadSessionPdf(id)}
                  />
                )}
                {sessionListTotalPages > 1 && (
                  <div className="history-pagination sessions-pagination">
                    <span className="history-page-info">
                      Página {sessionListPage + 1} de {sessionListTotalPages}
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
              </div>
            </section>
          )}

        {activeSection === 'importar' && showImportForm && (
        <section className="conc-section-panel import-card" id="importar-archivos">
          <header className="import-hero">
            <div className="import-hero-top">
              <div className="import-hero-main">
                <div className="import-hero-icon" aria-hidden>
                  <ImportNavIcon />
                </div>
                <div className="import-hero-copy">
                  <span className="import-hero-eyebrow">Nueva sesión</span>
                  <h2 className="import-hero-title">Importar archivos</h2>
                  <p className="import-hero-lead">
                    Subí los extractos de <strong>banco</strong> y <strong>empresa</strong> del mismo
                    período. Podés cargar <strong>varios Excel por lado</strong> (tarjetas, plataformas,
                    etc.) y el sistema arma <strong>una sola sesión</strong> para conciliar todo junto.
                  </p>
                </div>
              </div>
              <button type="button" className="btn-secondary import-hero-cancel" onClick={closeImportForm}>
                Cancelar
              </button>
            </div>
            <ul className="import-hero-highlights" aria-label="Resumen de la importación">
              <li>
                <span className="import-hero-chip import-hero-chip--bank">
                  <span className="import-hero-chip-dot" aria-hidden />
                  Banco / tarjetas
                </span>
              </li>
              <li>
                <span className="import-hero-chip import-hero-chip--company">
                  <span className="import-hero-chip-dot" aria-hidden />
                  Empresa / plataforma
                </span>
              </li>
              <li>
                <span className="import-hero-chip">
                  <span className="import-hero-chip-dot" aria-hidden />
                  .xls y .xlsx
                </span>
              </li>
              <li>
                <span className="import-hero-chip">
                  <span className="import-hero-chip-dot" aria-hidden />
                  Una sesión unificada
                </span>
              </li>
            </ul>
          </header>
          <form onSubmit={handleImport} className="import-form">
            <div className="import-form-files">
              <label className="file-label">
                <span>Banco / tarjetas (uno o más .xls o .xlsx)</span>
                <input
                  className="import-file-input"
                  type="file"
                  multiple
                  accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(ev) =>
                    setBankFiles(ev.target.files ? Array.from(ev.target.files) : [])
                  }
                />
                {bankFiles.length > 0 ? (
                  <span className="import-file-count">
                    {bankFiles.length} archivo{bankFiles.length === 1 ? '' : 's'}:{' '}
                    {bankFiles.map((f) => f.name).join(', ')}
                  </span>
                ) : null}
              </label>
              <label className="file-label">
                <span>Empresa / plataforma (uno o más .xls o .xlsx)</span>
                <input
                  className="import-file-input"
                  type="file"
                  multiple
                  accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(ev) =>
                    setCompanyFiles(ev.target.files ? Array.from(ev.target.files) : [])
                  }
                />
                {companyFiles.length > 0 ? (
                  <span className="import-file-count">
                    {companyFiles.length} archivo{companyFiles.length === 1 ? '' : 's'}:{' '}
                    {companyFiles.map((f) => f.name).join(', ')}
                  </span>
                ) : null}
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
                        <label className="import-layout-field import-layout-field--meta">
                          <span>Hoja (1 = primera pestaña)</span>
                          <input
                            type="number"
                            className="import-layout-meta-input"
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
                        <label className="import-layout-field import-layout-field--meta">
                          <span>Fila de títulos de columnas</span>
                          <input
                            type="number"
                            className="import-layout-meta-input"
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
                        <label className="import-layout-field import-layout-field--meta">
                          <span>Primera fila de movimientos</span>
                          <input
                            type="number"
                            className="import-layout-meta-input"
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
                        <label className="import-layout-field import-layout-field--meta">
                          <span>Hoja (1 = primera pestaña)</span>
                          <input
                            type="number"
                            className="import-layout-meta-input"
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
                        <label className="import-layout-field import-layout-field--meta">
                          <span>Fila de títulos de columnas</span>
                          <input
                            type="number"
                            className="import-layout-meta-input"
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
                        <label className="import-layout-field import-layout-field--meta">
                          <span>Primera fila de movimientos</span>
                          <input
                            type="number"
                            className="import-layout-meta-input"
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
                  <span className="import-result-k">Total filas banco</span>
                  <span className="import-result-v">{importResult.bankRows}</span>
                </div>
                <div className="import-result-cell">
                  <span className="import-result-k">Total filas plataforma</span>
                  <span className="import-result-v">{importResult.companyRows}</span>
                </div>
              </div>
              <div className="import-result-files">
                <div className="import-result-files-group">
                  <span className="import-result-k">Banco — filas por archivo</span>
                  <ul className="import-result-file-list">
                    {importResult.bankFileSummaries.map((f, idx) => (
                      <li key={`bank-${f.fileName}-${idx}`} className="import-result-file-item">
                        <span className="import-result-file-name" title={f.fileName}>
                          {f.fileName}
                        </span>
                        <span className="import-result-file-count">{f.rowCount} filas</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="import-result-files-group">
                  <span className="import-result-k">Plataforma — filas por archivo</span>
                  <ul className="import-result-file-list">
                    {importResult.companyFileSummaries.map((f, idx) => (
                      <li key={`company-${f.fileName}-${idx}`} className="import-result-file-item">
                        <span className="import-result-file-name" title={f.fileName}>
                          {f.fileName}
                        </span>
                        <span className="import-result-file-count">{f.rowCount} filas</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>
        )}

        {activeSection === 'sesion' && selectedId != null && (
        <section
          className={`conc-section-panel session-detail-card session-detail-card--open${sessionClosed ? ' session-detail-card--closed' : ''}`}
          id="detalle-conciliacion"
        >
            <div className="session-detail-shell">
              <p className="session-detail-eyebrow">Detalle y conciliación</p>
              <div className="session-detail-head">
                {detailMatchesSelection && !detailLoading ? (
                  <SessionDisplayNameEditor
                    sessionId={selectedId}
                    createdAt={detail.session.createdAt}
                    displayName={detail.session.displayName}
                    status={detail.session.status}
                    readOnly={user?.role === 'CONSULTA'}
                    onSaved={(displayName) => handleSessionRenamed(selectedId, displayName)}
                  />
                ) : (
                  <div className="session-display-name-view session-display-name-view--loading">
                    <h3 className="session-detail-title">Sesión #{selectedId}</h3>
                    <p className="session-detail-subtitle">Cargando datos de la sesión…</p>
                  </div>
                )}
                <div className="session-detail-head-actions">
                  <div className="session-detail-actions-panel" aria-label="Acciones de sesión">
                    <div className="session-detail-actions-group">
                      <span className="session-detail-actions-label">Exportar</span>
                      <div className="session-detail-actions-buttons">
                        <button
                          type="button"
                          className="btn-secondary session-export-btn"
                          disabled={exportLoading}
                          onClick={() => void downloadSessionExcel(selectedId)}
                        >
                          {exportLoading ? 'Generando…' : 'Excel'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary session-export-pdf-btn"
                          title="Resumen ejecutivo, conciliados y pendientes"
                          disabled={exportLoading}
                          onClick={() => void downloadSessionPdf(selectedId)}
                        >
                          {exportLoading ? 'Generando…' : 'PDF'}
                        </button>
                      </div>
                    </div>
                    {detailMatchesSelection && !detailLoading && !sessionClosed && (
                      <div className="session-detail-actions-group session-detail-actions-group--primary">
                        <span className="session-detail-actions-label">Sesión</span>
                        <div className="session-detail-actions-buttons">
                          <button
                            type="button"
                            className="btn-secondary session-close-btn"
                            disabled={closeSessionLoading}
                            onClick={() => void handleCloseSession()}
                          >
                            {closeSessionLoading ? 'Cerrando…' : 'Cerrar conciliación'}
                          </button>
                        </div>
                      </div>
                    )}
                    {detailMatchesSelection && !detailLoading && sessionClosed && user?.role === 'ADMIN' && (
                      <div className="session-detail-actions-group session-detail-actions-group--primary">
                        <span className="session-detail-actions-label">Sesión</span>
                        <div className="session-detail-actions-buttons">
                          <button
                            type="button"
                            className="btn-secondary session-reopen-btn"
                            disabled={reopenSessionLoading}
                            onClick={() => void handleReopenSession()}
                            title="Solo administrador; queda registrado en Actividad"
                          >
                            {reopenSessionLoading ? 'Reabriendo…' : 'Reabrir conciliación'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {detailMatchesSelection && !detailLoading && sessionClosed && (
                <div className="session-closed-banner" role="status">
                  Conciliación cerrada: saldos, clasificación de pendientes y conciliación automática bloqueados.
                  Podés consultar y exportar.
                  {user?.role === 'ADMIN' && (
                    <>
                      {' '}
                      Como administrador podés usar <strong>Reabrir conciliación</strong>; el motivo opcional queda en{' '}
                      <strong>Actividad</strong>.
                    </>
                  )}
                </div>
              )}

              {detailMatchesSelection && !detailLoading && user?.role === 'CONSULTA' && !sessionClosed && (
                <div className="msg subtle session-consulta-hint" role="status">
                  Perfil solo consulta: la clasificación de movimientos y pares es de solo lectura.
                </div>
              )}

              {detailMatchesSelection && detailLoading && (
                <p className="msg subtle session-detail-meta-loading">Cargando datos de la sesión…</p>
              )}
              {exportError && (
                <p className="msg err session-detail-msg" role="alert">
                  {exportError}
                </p>
              )}
            </div>
          {detailLoading && <p className="msg">Cargando detalle…</p>}
          {detailError && <p className="msg err">{detailError}</p>}
          {detailMatchesSelection && detail && !detailLoading && (
            <div className="conc-section-summary-block">
              <ExecutiveSummaryPanel
                stats={detail.stats}
                closing={{
                  closingBankBalance: detail.session.closingBankBalance,
                  closingCompanyBalance: detail.session.closingCompanyBalance,
                }}
                balancesStatus={balancesLoadStatus(detail.session)}
                onOpenBalances={() => setBalancesModalOpen(true)}
              />
            </div>
          )}
        </section>
        )}

        {activeSection === 'cortes' && selectedId != null && (
          <section className="conc-section-panel" aria-label="Cortes de conciliación">
            {detailMatchesSelection && !detailLoading ? (
              <SessionCheckpointsSection sessionId={selectedId} />
            ) : (
              <p className="conc-section-empty">Cargando cortes de la sesión…</p>
            )}
          </section>
        )}

        {activeSection === 'archivos' && selectedId != null && (
          <section className="conc-section-panel" aria-label="Archivos importados">
            {detailMatchesSelection && detail && !detailLoading ? (
              <div className="session-detail-meta">
                <SessionSourceFiles
                  bankFileName={detail.session.sourceBankFileName}
                  companyFileName={detail.session.sourceCompanyFileName}
                  bankFileSummaries={detail.session.bankFileSummaries}
                  companyFileSummaries={detail.session.companyFileSummaries}
                  variant="detail"
                />
                {!classificationReadOnly && (
                  <section className="session-reimport-section" aria-label="Actualizar archivos importados">
                    <div className="session-reimport-section-head">
                      <span className="session-reimport-section-eyebrow">Actualización incremental</span>
                      <p className="session-reimport-section-lead">
                        Reemplazá un lado con el Excel completo actualizado. El otro lado de la sesión no se
                        modifica.
                      </p>
                    </div>
                    <div className="session-reimport-grid">
                      <SessionReimportPanel
                        sessionId={selectedId}
                        side="bank"
                        readOnly={classificationReadOnly}
                        useCustomImportLayout={useCustomImportLayout}
                        bankLayoutExcel={importBankLayoutExcel}
                        companyLayoutExcel={importCompanyLayoutExcel}
                        onApplied={async () => {
                          await loadDetail(selectedId, { soft: true })
                          await loadSessionListPage(sessionListPage)
                        }}
                      />
                      <SessionReimportPanel
                        sessionId={selectedId}
                        side="company"
                        readOnly={classificationReadOnly}
                        useCustomImportLayout={useCustomImportLayout}
                        bankLayoutExcel={importBankLayoutExcel}
                        companyLayoutExcel={importCompanyLayoutExcel}
                        onApplied={async () => {
                          await loadDetail(selectedId, { soft: true })
                          await loadSessionListPage(sessionListPage)
                        }}
                      />
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <p className="conc-section-empty">Cargando archivos de la sesión…</p>
            )}
          </section>
        )}

        {activeSection === 'diferidos' && selectedId != null && (
          <section className="conc-section-panel" aria-label="Movimientos diferidos">
            <header className="conc-section-intro">
              <h2 className="conc-section-intro-title">Diferidos</h2>
              <p className="conc-section-intro-lead">
                Movimientos guardados para incorporar en otra conciliación, consultar los ya traídos o
                restaurar los enviados desde esta sesión.
              </p>
            </header>
            {detailMatchesSelection && detail && !detailLoading ? (
              <SessionDeferredPanels
                sessionId={selectedId}
                deferredFromSession={detail.deferredFromSession ?? []}
                deferredIntoSession={detail.deferredIntoSession ?? []}
                availableDeferredCount={detail.availableDeferredCount ?? 0}
                readOnly={classificationReadOnly}
                onChanged={async () => {
                  await loadDetail(selectedId, { soft: true })
                  await loadSessionListPage(sessionListPage)
                }}
              />
            ) : (
              <p className="conc-section-empty">Cargando movimientos diferidos…</p>
            )}
          </section>
        )}

        {activeSection === 'conciliar' && selectedId != null && (
          <section className="conc-section-panel" aria-label="Ejecutar conciliación">
            <header className="conc-section-intro">
              <h2 className="conc-section-intro-title">Conciliar</h2>
              <p className="conc-section-intro-lead">
                Núcleo del proceso: cruza automáticamente los movimientos de banco y empresa por
                fecha e importe según las tolerancias que definas. Los que coinciden se marcan como
                <strong> pares conciliados</strong>; el resto queda como <strong>pendiente</strong> para
                revisar en Filtros o vincular a mano.
              </p>
            </header>
            {detailMatchesSelection && !detailLoading ? (
              <>
                <div
                  className={`conciliar-status-strip conciliar-status-strip--${
                    detail.stats.reconciliationStatus === 'OK'
                      ? 'ok'
                      : detail.stats.reconciliationStatus === 'PENDING_DIFFERENCES'
                        ? 'pending'
                        : 'err'
                  }`}
                  role="status"
                >
                  <div className="conciliar-status-headline">
                    <span className="conciliar-status-label">Estado actual</span>
                    <strong className="conciliar-status-value">
                      {STATUS_LABEL[detail.stats.reconciliationStatus] ??
                        detail.stats.reconciliationStatus}
                    </strong>
                  </div>
                  <dl className="conciliar-kpi-grid">
                    <div className="conciliar-kpi">
                      <dt>Pares conciliados</dt>
                      <dd>{detail.stats.matchedPairs}</dd>
                    </div>
                    <div className="conciliar-kpi">
                      <dt>Pendientes banco</dt>
                      <dd>{detail.stats.unmatchedBankCount}</dd>
                    </div>
                    <div className="conciliar-kpi">
                      <dt>Pendientes empresa</dt>
                      <dd>{detail.stats.unmatchedCompanyCount}</dd>
                    </div>
                    <div className="conciliar-kpi">
                      <dt>Diferencia total</dt>
                      <dd
                        className={
                          Math.abs(detail.stats.differenceTotal) >= 0.005
                            ? 'conciliar-kpi-num conciliar-kpi-num--warn'
                            : 'conciliar-kpi-num'
                        }
                      >
                        {formatAmount(detail.stats.differenceTotal)}
                      </dd>
                    </div>
                  </dl>
                </div>
                {sessionClosed ? (
                  <p className="msg subtle conciliar-run-hint">
                    La sesión está cerrada: la conciliación automática está bloqueada. Podés consultar
                    los resultados y exportar.
                  </p>
                ) : (
                  <p className="conc-section-hint conciliar-run-hint">
                    Ajustá las tolerancias y ejecutá. La <strong>tolerancia de fechas</strong> permite
                    emparejar movimientos con días de diferencia; la <strong>tolerancia de importe</strong>{' '}
                    absorbe diferencias mínimas de redondeo. Podés volver a ejecutar cuantas veces quieras.
                  </p>
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
              </>
            ) : (
              <p className="conc-section-empty">Cargando opciones de conciliación…</p>
            )}
          </section>
        )}

        {activeSection === 'comparar' && detail && !detailLoading && (
          <section className="conc-section-panel" aria-label="Vista comparativa">
            <div className="detail-view-compare-filters" role="group" aria-label="Filtros comparativa">
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
                help={
                  <CompareViewHelpText
                    effectiveSessionAmountTolerance={effectiveSessionAmountTolerance}
                  />
                }
                keyboardHelp={
                  reconcileLocked ? undefined : (
                    <p className="keyboard-hint-popover-body">
                      Clic en los datos de <strong>banco</strong> o <strong>empresa</strong> (fecha,
                      importe, descripción) o en el chip <strong>PB</strong>/<strong>PE</strong>{' '}
                      para seleccionar pendientes. Otro clic quita la selección. Con ambos lados
                      elegidos, <kbd>Enter</kbd> abre la confirmación (1:1 o grupo N:M); en el modal
                      1:1, <kbd>Enter</kbd> vincula.
                    </p>
                  )
                }
              />
            </div>
            {reconcileLocked ? (
              <p className="ledger-view-readonly-hint">Sesión cerrada: solo consulta.</p>
            ) : null}
            <ComparisonTable
              rows={filteredComparisonRows}
              allRowsCount={comparisonRows.length}
              baselineRowNumbers={comparisonRowNumbers}
              lockedColWidths={compareTableColWidths}
              onLockedColWidthsChange={setCompareTableColWidths}
              selectedId={selectedId}
              sessionId={selectedId}
              canShareInChat={canShareInChat}
              sessionClosed={sessionClosed}
              classificationReadOnly={classificationReadOnly}
              sessionAmountTolerance={effectiveSessionAmountTolerance}
              classificationSuggestions={classificationSuggestions}
              linkMode={compareLinkMode}
              selectedBankIds={compareLinkMode ? compareSelectedBankIds : undefined}
              selectedCompanyIds={compareLinkMode ? compareSelectedCompanyIds : undefined}
              onTogglePending={compareLinkMode ? handleCompareTogglePending : undefined}
              onUnlinkPair={(pairId, matchSource) => void handleUnlinkPair(pairId, matchSource)}
              onUnlinkGroup={
                classificationReadOnly ? undefined : (groupId) => void handleUnlinkGroup(groupId)
              }
              onSetClassification={(side, txId, c) =>
                void handleSetClassification(side, txId, c)
              }
              onSetPairClassification={(pairId, c) =>
                void handleSetPairClassification(pairId, c)
              }
              onSetGroupClassification={(groupId, c) =>
                void handleSetGroupClassification(groupId, c)
              }
              onOpenPendingComments={(t) => setCommentTarget(t)}
              onOpenPendingAttachments={(t) => setAttachmentTarget(t)}
              onInspectCounterpart={(req) => setCounterpartInspect(req)}
              onDeferMovement={
                classificationReadOnly ? undefined : (side, txId) => void handleDeferMovement(side, txId)
              }
            />
            {compareLinkMode && compareHasSelection ? (
              <PendingLinkSelectionPanel
                selectedBank={compareSelectedBank}
                selectedCompany={compareSelectedCompany}
                bankSum={compareBankSum}
                companySum={compareCompanySum}
                delta={compareDelta}
                hasBank={compareHasBank}
                hasCompany={compareHasCompany}
                bothSides={compareBothSides}
                canGroupLink={compareCanGroupLink}
                manualLinkLoading={manualLoading}
                sessionAmountTolerance={effectiveSessionAmountTolerance}
                enterHint
                showSelectionTables
                classificationReadOnly={classificationReadOnly}
                classificationSuggestions={classificationSuggestions}
                classifyLoading={compareClassifyLoading}
                classifyError={compareClassifyError}
                onBulkClassify={(classification) =>
                  handleCompareSelectionBulkClassify(classification)
                }
                onClear={clearCompareLinkSelection}
                onCreateGroup={
                  reconcileLocked
                    ? undefined
                    : (bankIds, companyIds) => handleCreateGroup(bankIds, companyIds)
                }
                onConfirmPairLink={
                  reconcileLocked ? undefined : () => setComparePairLinkOpen(true)
                }
              />
            ) : null}
          </section>
        )}

        {activeSection === 'grupos' && detail && !detailLoading && (
          <section className="conc-section-panel" aria-label="Grupos por rubro">
            <RubroGroupsView
              detail={detail}
              sessionAmountTolerance={effectiveSessionAmountTolerance}
              reconcileLocked={reconcileLocked}
              manualLinkLoading={manualLoading}
              manualLinkError={manualError}
              classificationReadOnly={classificationReadOnly}
              classificationSuggestions={classificationSuggestions}
              onSetClassification={(side, txId, c) => void handleSetClassification(side, txId, c)}
              onSetPairClassification={(pairId, c) => void handleSetPairClassification(pairId, c)}
              onSetGroupClassification={(groupId, c) =>
                void handleSetGroupClassification(groupId, c)
              }
              onManualPair={
                reconcileLocked
                  ? undefined
                  : (bankId, companyId) => void handleManualPairIds(bankId, companyId)
              }
              onCreateGroup={
                reconcileLocked ? undefined : (bankIds, companyIds) => handleCreateGroup(bankIds, companyIds)
              }
              onScrollToComparisonRow={(rowKey) => {
                setActiveSection('comparar')
                setDetailLayout('compare')
                requestAnimationFrame(() => scrollToComparisonRow(rowKey))
              }}
              onUnlinkPair={
                reconcileLocked || classificationReadOnly
                  ? undefined
                  : (pairId, matchSource) => handleUnlinkPair(pairId, matchSource)
              }
              onUnlinkGroup={
                reconcileLocked || classificationReadOnly
                  ? undefined
                  : (groupId) => void handleUnlinkGroup(groupId)
              }
            />
          </section>
        )}

        {activeSection === 'ledger' && detail && !detailLoading && (
          <section className="conc-section-panel" aria-label="Vista paralela banco y empresa">
            <SubsectionTitleRow
              help={<LedgerViewHelpText />}
              helpAriaLabel="Ayuda sobre la vista paralela"
              helpDialogLabel="Ayuda — vista paralela"
              keyboardHelp={
                detail.bankTransactions.length > 0 || detail.companyTransactions.length > 0 ? (
                  <LedgerKeyboardHelpText linkMode={!reconcileLocked} />
                ) : undefined
              }
              keyboardHelpAriaLabel="Atajos de teclado en vista paralela"
              keyboardHelpDialogLabel="Atajos — vista paralela"
            >
              Vista paralela
            </SubsectionTitleRow>
            <p className="conc-section-hint ledger-view-intro">
              Todos los movimientos importados, <strong>banco a la izquierda</strong> y{' '}
              <strong>empresa a la derecha</strong>, cada uno con scroll propio.
            </p>
            <FullLedgerView
              detail={detail}
              sessionAmountTolerance={effectiveSessionAmountTolerance}
              reconcileLocked={reconcileLocked}
              manualLinkLoading={manualLoading}
              manualLinkError={manualError}
              classificationReadOnly={classificationReadOnly}
              classificationSuggestions={classificationSuggestions}
              onSetClassification={(side, txId, c) => void handleSetClassification(side, txId, c)}
              onSetPairClassification={(pairId, c) => void handleSetPairClassification(pairId, c)}
              onManualPair={
                reconcileLocked
                  ? undefined
                  : (bankId, companyId) => void handleManualPairIds(bankId, companyId)
              }
              onCreateGroup={
                reconcileLocked ? undefined : (bankIds, companyIds) => handleCreateGroup(bankIds, companyIds)
              }
              onScrollToComparisonRow={(rowKey) => {
                setActiveSection('comparar')
                setDetailLayout('compare')
                requestAnimationFrame(() => scrollToComparisonRow(rowKey))
              }}
              onUnlinkPair={
                reconcileLocked || classificationReadOnly
                  ? undefined
                  : (pairId, matchSource) => handleUnlinkPair(pairId, matchSource)
              }
              onUnlinkGroup={
                reconcileLocked || classificationReadOnly
                  ? undefined
                  : (groupId) => void handleUnlinkGroup(groupId)
              }
            />
          </section>
        )}
        </main>
      </div>
      {activityModalSessionId != null && (
        <SessionActivityModal
          sessionId={activityModalSessionId}
          entries={activityEntries}
          loading={activityLoading}
          error={activityError}
          onClose={closeActivityModal}
        />
      )}
      {balancesModalOpen && detailMatchesSelection && detail && (
        <SessionBalancesModal
          session={detail.session}
          readOnly={sessionClosed}
          onSaved={async () => {
            if (selectedId != null) await loadDetail(selectedId, { soft: true })
          }}
          onClose={() => setBalancesModalOpen(false)}
        />
      )}
      {selectedId != null && (
        <>
          <PendingCommentsModal
            sessionId={selectedId}
            target={commentTarget}
            detail={detail}
            sessionClosed={sessionClosed}
            onClose={() => setCommentTarget(null)}
            onAfterChange={() => {
              if (selectedId != null) void loadDetail(selectedId, { soft: true })
            }}
          />
          <PendingAttachmentsModal
            sessionId={selectedId}
            target={attachmentTarget}
            detail={detail}
            sessionClosed={sessionClosed}
            onClose={() => setAttachmentTarget(null)}
            onAfterChange={() => {
              if (selectedId != null) void loadDetail(selectedId, { soft: true })
            }}
          />
        </>
      )}
      {counterpartInspect != null && counterpartModalPayload != null ? (
        <CounterpartPreviewModal
          mode={counterpartInspect.mode}
          side={counterpartInspect.side}
          mov={counterpartInspect.mov}
          counterpart={counterpartModalPayload.counterpart}
          duplicateSiblings={counterpartModalPayload.duplicateSiblings}
          reconcileLocked={reconcileLocked}
          linkLoading={manualLoading}
          onClose={() => setCounterpartInspect(null)}
          onScrollToRow={scrollToComparisonRow}
          onLink={
            reconcileLocked
              ? undefined
              : (bankId, companyId) =>
                  void handleManualPairIds(bankId, companyId, { closeModal: true })
          }
        />
      ) : null}
      {comparePairLinkOpen && comparePairPrompt ? (
        <RubroLinkConfirmModal
          prompt={comparePairPrompt}
          loading={manualLoading}
          error={manualError}
          onCancel={() => setComparePairLinkOpen(false)}
          onConfirm={() =>
            void handleManualPairIds(comparePairPrompt.bankId, comparePairPrompt.companyId)
          }
        />
      ) : null}
    </div>
  )
}

