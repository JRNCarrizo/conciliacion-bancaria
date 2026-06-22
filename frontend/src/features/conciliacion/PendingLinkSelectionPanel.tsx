import { useEffect, useMemo, useState } from 'react'
import { ClassificationComboControlled } from './ClassificationCombo'
import { MovementMiniTable } from './MovementMiniTable'
import {
  bulkClassificationTargetCount,
  collectSelectionClassificationTargets,
  type RubroMovementRef,
} from './utils/rubroGroups'
import { formatAmount } from './utils/format'

export function PendingLinkSelectionPanel({
  selectedBank,
  selectedCompany,
  bankSum,
  companySum,
  delta,
  hasBank,
  hasCompany,
  bothSides,
  canGroupLink,
  manualLinkLoading,
  sessionAmountTolerance,
  enterHint = false,
  showSelectionTables = true,
  classificationReadOnly,
  classificationSuggestions,
  classifyLoading = false,
  classifyError = null,
  onBulkClassify,
  onViewPair,
  onClear,
  onCreateGroup,
  onConfirmPairLink,
}: {
  selectedBank: readonly RubroMovementRef[]
  selectedCompany: readonly RubroMovementRef[]
  bankSum: number
  companySum: number
  delta: number
  hasBank: boolean
  hasCompany: boolean
  bothSides: boolean
  canGroupLink: boolean
  manualLinkLoading: boolean
  sessionAmountTolerance?: number | null
  /** Muestra atajo Enter para vínculo 1:1 (vista comparativa). */
  enterHint?: boolean
  /** Tablas banco | empresa con los movimientos elegidos (por defecto activo). */
  showSelectionTables?: boolean
  classificationReadOnly?: boolean
  classificationSuggestions?: readonly string[]
  classifyLoading?: boolean
  classifyError?: string | null
  /** Aplica clasificación a los pendientes seleccionados. */
  onBulkClassify?: (classification: string) => Promise<void>
  onViewPair?: (pairId: number) => void
  onClear: () => void
  onCreateGroup?: (bankIds: number[], companyIds: number[]) => void | Promise<void>
  /** Abre confirmación 1:1 (vínculo par). */
  onConfirmPairLink?: () => void
}) {
  const [classifyDraft, setClassifyDraft] = useState('')

  const classifyTargets = useMemo(
    () => collectSelectionClassificationTargets(selectedBank, selectedCompany),
    [selectedBank, selectedCompany],
  )
  const classifyCount = bulkClassificationTargetCount(classifyTargets)
  const selectionKey = useMemo(
    () =>
      [
        ...classifyTargets.bankPendingIds,
        ...classifyTargets.companyPendingIds,
      ].join(','),
    [classifyTargets.bankPendingIds, classifyTargets.companyPendingIds],
  )

  useEffect(() => {
    setClassifyDraft('')
  }, [selectionKey])

  const canPairLink =
    bothSides &&
    !canGroupLink &&
    selectedBank.length === 1 &&
    selectedCompany.length === 1
  const showGroupAction = canGroupLink && onCreateGroup != null
  const showPairAction = canPairLink && onConfirmPairLink != null
  const showClassify =
    onBulkClassify != null && classificationReadOnly !== true && classifyCount > 0

  const tol =
    sessionAmountTolerance !== undefined && sessionAmountTolerance !== null
      ? Math.max(0, sessionAmountTolerance)
      : 0.02
  const squared = bothSides && Math.abs(delta) <= tol

  async function applyBulkClassification() {
    if (!onBulkClassify || classifyCount === 0) return
    const label = classifyDraft.trim()
    const parts: string[] = []
    if (classifyTargets.bankPendingIds.length > 0) {
      parts.push(`${classifyTargets.bankPendingIds.length} banco`)
    }
    if (classifyTargets.companyPendingIds.length > 0) {
      parts.push(`${classifyTargets.companyPendingIds.length} empresa`)
    }
    const detail = parts.join(', ')
    const msg = label
      ? `¿Asignar clasificación «${label}» a ${classifyCount} movimiento${classifyCount === 1 ? '' : 's'} (${detail})?`
      : `¿Quitar clasificación de ${classifyCount} movimiento${classifyCount === 1 ? '' : 's'} (${detail})?`
    if (!window.confirm(msg)) return
    await onBulkClassify(label)
  }

  return (
    <section className="ledger-selection-panel" aria-label="Vista previa de la selección">
      <header className="ledger-selection-panel-head">
        <h4 className="ledger-selection-panel-title">Vista previa de la selección</h4>
        <button type="button" className="btn-secondary rubro-cross-clear-btn" onClick={onClear}>
          Limpiar
        </button>
      </header>

      <div className="ledger-selection-body">
        {bothSides ? (
          <div className="ledger-selection-metrics rubro-cross-metrics" aria-label="Totales seleccionados">
            <div className="rubro-cross-metric rubro-cross-metric--bank">
              <span className="rubro-cross-metric-label">Σ Banco (sel.)</span>
              <strong>{formatAmount(bankSum)}</strong>
            </div>
            <div className="rubro-cross-metric rubro-cross-metric--company">
              <span className="rubro-cross-metric-label">Σ Empresa (sel.)</span>
              <strong>{formatAmount(companySum)}</strong>
            </div>
            <div className="rubro-cross-metric rubro-cross-metric--delta">
              <span className="rubro-cross-metric-label">Δ (empresa − banco)</span>
              <div className="rubro-cross-metric-delta-row">
                <strong>{formatAmount(delta)}</strong>
                {squared ? (
                  <span className="compare-badge compare-badge--estado rubro-badge--ok">Cuadrado</span>
                ) : (
                  <span className="compare-badge compare-badge--estado rubro-badge--warn">Revisar</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="ledger-selection-hint rubro-cross-pick-hint rubro-cross-preview-hint">
            {hasBank
              ? 'Elegí también uno o más pendientes de empresa. Con Enter confirmás el vínculo.'
              : 'Elegí también uno o más pendientes de banco. Con Enter confirmás el vínculo.'}
          </p>
        )}

        {showClassify ? (
          <div className="rubro-cross-action rubro-cross-action--classify ledger-selection-classify">
            <label className="rubro-cross-classify-caption" htmlFor="ledger-selection-classify-input">
              Clasificación
            </label>
            <div className="rubro-cross-classify-row">
              <div className="clasif-field-wrap rubro-cross-classify-field">
                <ClassificationComboControlled
                  text={classifyDraft}
                  onTextChange={setClassifyDraft}
                  suggestions={classificationSuggestions ?? []}
                  disabled={classifyLoading}
                  placeholder="Ej.: Comisiones"
                  ariaLabel="Clasificación para la selección"
                  inputId="ledger-selection-classify-input"
                />
              </div>
              <button
                type="button"
                className="btn-secondary rubro-cross-classify-btn"
                disabled={classifyLoading}
                onClick={() => void applyBulkClassification()}
              >
                {classifyLoading ? '…' : `Aplicar (${classifyCount})`}
              </button>
            </div>
            {classifyError ? <p className="msg err rubro-cross-classify-err">{classifyError}</p> : null}
          </div>
        ) : null}

        {!showSelectionTables ? (
          <div className="ledger-selection-chips">
            {hasBank ? (
              <span className="ledger-selection-chip">
                Banco: {selectedBank.length} mov.
              </span>
            ) : (
              <span className="ledger-selection-chip ledger-selection-chip--muted">Banco: ninguno</span>
            )}
            {hasCompany ? (
              <span className="ledger-selection-chip">
                Empresa: {selectedCompany.length} mov.
              </span>
            ) : (
              <span className="ledger-selection-chip ledger-selection-chip--muted">Empresa: ninguno</span>
            )}
          </div>
        ) : (
          <div
            className="ledger-selection-preview-tables rubro-detail-grid rubro-detail-grid--panels"
            aria-label="Movimientos seleccionados"
          >
            <MovementMiniTable
              side="bank"
              title="Banco seleccionado"
              items={[...selectedBank]}
              onViewPair={onViewPair}
              panelLayout
              visibleRows={5}
              adaptiveHeight
              hideLinkHint
            />
            <MovementMiniTable
              side="company"
              title="Empresa seleccionada"
              items={[...selectedCompany]}
              onViewPair={onViewPair}
              panelLayout
              visibleRows={5}
              adaptiveHeight
              hideLinkHint
            />
          </div>
        )}

        <footer className="ledger-selection-actions">
          {showGroupAction || showPairAction ? (
            <div className="rubro-cross-group-link-bar">
              <p className="rubro-cross-group-link-lead">
                {showGroupAction
                  ? 'Podés conciliar todos los pendientes seleccionados como un solo grupo (N:M).'
                  : 'Confirmá el vínculo 1:1 entre los pendientes seleccionados.'}
                {enterHint ? ' Enter también confirma.' : ''}
              </p>
              <button
                type="button"
                className="btn-import rubro-cross-group-link-btn"
                disabled={manualLinkLoading}
                onClick={() => {
                  if (showPairAction) {
                    onConfirmPairLink!()
                    return
                  }
                  const bankIds = selectedBank.map((i) => i.m.id)
                  const companyIds = selectedCompany.map((i) => i.m.id)
                  const msg =
                    `¿Conciliar grupo con ${bankIds.length} mov. banco y ${companyIds.length} mov. empresa?\n` +
                    `Σ banco ${formatAmount(bankSum)} · Σ empresa ${formatAmount(companySum)}`
                  if (!window.confirm(msg)) return
                  void onCreateGroup!(bankIds, companyIds)
                }}
              >
                {manualLinkLoading
                  ? 'Guardando…'
                  : showGroupAction
                    ? `Conciliar grupo (${selectedBank.length} banco · ${selectedCompany.length} empresa)`
                    : 'Conciliar par (1 banco · 1 empresa)'}
              </button>
            </div>
          ) : null}
        </footer>
      </div>
    </section>
  )
}
