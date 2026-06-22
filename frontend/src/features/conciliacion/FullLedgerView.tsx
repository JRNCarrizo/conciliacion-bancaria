import { useEffect, useMemo, useState } from 'react'
import { MovementMiniTable } from './MovementMiniTable'
import { PairPreviewModal } from './PairPreviewModal'
import { PendingLinkSelectionPanel } from './PendingLinkSelectionPanel'
import { RubroLinkConfirmModal } from './RubroLinkConfirmModal'
import { useLedgerKeyboardNav } from './useLedgerKeyboardNav'
import { usePendingMultiLinkPicker } from './usePendingMultiLinkPicker'
import type { SessionDetail } from './types'
import { formatAmount } from './utils/format'
import { resolvePairPreview } from './utils/pairLookup'
import {
  allBankMovementRefs,
  allCompanyMovementRefs,
  collectSelectionClassificationTargets,
  isRubroMovementLinkable,
  ledgerViewSummary,
} from './utils/rubroGroups'

export function FullLedgerView({
  detail,
  sessionAmountTolerance,
  reconcileLocked,
  manualLinkLoading,
  manualLinkError,
  classificationReadOnly,
  classificationSuggestions,
  onSetClassification,
  onSetPairClassification,
  onManualPair,
  onCreateGroup,
  onScrollToComparisonRow,
  onUnlinkPair,
  onUnlinkGroup,
}: {
  detail: SessionDetail
  sessionAmountTolerance?: number | null
  reconcileLocked: boolean
  manualLinkLoading: boolean
  manualLinkError: string | null
  classificationReadOnly: boolean
  classificationSuggestions: readonly string[]
  onSetClassification: (side: 'bank' | 'company', txId: number, classification: string) => void | Promise<void>
  onSetPairClassification: (pairId: number, classification: string) => void | Promise<void>
  onManualPair?: (bankId: number, companyId: number) => void
  onCreateGroup?: (bankIds: number[], companyIds: number[]) => void | Promise<void>
  onScrollToComparisonRow?: (rowKey: string) => void
  onUnlinkPair?: (
    pairId: number,
    matchSource: 'MANUAL' | 'AUTO',
  ) => void | boolean | Promise<void | boolean>
  onUnlinkGroup?: (groupId: number) => void | Promise<void>
}) {
  const [viewPairId, setViewPairId] = useState<number | null>(null)
  const [ledgerPairLinkOpen, setLedgerPairLinkOpen] = useState(false)
  const [classifyLoading, setClassifyLoading] = useState(false)
  const [classifyError, setClassifyError] = useState<string | null>(null)

  const bankItems = useMemo(() => allBankMovementRefs(detail), [detail])
  const companyItems = useMemo(() => allCompanyMovementRefs(detail), [detail])
  const summary = useMemo(() => ledgerViewSummary(detail), [detail])

  const linkableBank = useMemo(() => bankItems.filter(isRubroMovementLinkable), [bankItems])
  const linkableCompany = useMemo(() => companyItems.filter(isRubroMovementLinkable), [companyItems])

  const linkMode =
    !reconcileLocked &&
    (onManualPair != null || onCreateGroup != null) &&
    linkableBank.length > 0 &&
    linkableCompany.length > 0

  const linkPickerResetKey = useMemo(
    () =>
      [
        detail.session.id,
        ...linkableBank.map((i) => i.m.id),
        ...linkableCompany.map((i) => i.m.id),
      ].join('|'),
    [detail.session.id, linkableBank, linkableCompany],
  )

  const {
    selectedBankIds,
    selectedCompanyIds,
    selectedBank,
    selectedCompany,
    toggleBank,
    toggleCompany,
    clearSelection,
    bankSum,
    companySum,
    delta,
    hasBank,
    hasCompany,
    bothSides,
    canGroupLink,
    pairPrompt,
    hasSelection,
  } = usePendingMultiLinkPicker(linkMode, linkableBank, linkableCompany, linkPickerResetKey)

  const pairPreview = useMemo(
    () => (viewPairId != null ? resolvePairPreview(detail, viewPairId) : null),
    [detail, viewPairId],
  )

  const keyboardBlocked = ledgerPairLinkOpen || pairPreview != null

  const {
    bankWrapRef,
    companyWrapRef,
    focusedTxId,
    focusedSide,
    handleTableMouseEnter,
    handleGridMouseLeave,
  } = useLedgerKeyboardNav({
    enabled: bankItems.length > 0 || companyItems.length > 0,
    bankItems,
    companyItems,
    linkMode,
    toggleBank,
    toggleCompany,
    interactionBlocked: keyboardBlocked,
    resetKey: linkPickerResetKey,
  })

  useEffect(() => {
    setLedgerPairLinkOpen(false)
  }, [linkPickerResetKey])

  useEffect(() => {
    if (!linkMode) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return
      if (
        ev.target instanceof HTMLElement &&
        ev.target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return
      }
      if (document.querySelector('.rubro-link-confirm-backdrop') || pairPreview != null) return
      if (!hasSelection && focusedTxId == null) return
      ev.preventDefault()
      clearSelection()
      setLedgerPairLinkOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [linkMode, hasSelection, focusedTxId, pairPreview, clearSelection])

  useEffect(() => {
    if (!linkMode) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Enter' || ev.repeat) return
      if (ledgerPairLinkOpen || pairPreview != null) return
      if (
        ev.target instanceof HTMLElement &&
        ev.target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return
      }
      if (!bothSides) return
      if (canGroupLink && onCreateGroup) {
        const bankIds = selectedBank.map((i) => i.m.id)
        const companyIds = selectedCompany.map((i) => i.m.id)
        const msg =
          `¿Conciliar grupo con ${bankIds.length} mov. banco y ${companyIds.length} mov. empresa?\n` +
          `Σ banco ${formatAmount(bankSum)} · Σ empresa ${formatAmount(companySum)}`
        ev.preventDefault()
        if (!window.confirm(msg)) return
        void onCreateGroup(bankIds, companyIds)
        return
      }
      if (pairPrompt && onManualPair) {
        ev.preventDefault()
        setLedgerPairLinkOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    linkMode,
    ledgerPairLinkOpen,
    pairPreview,
    bothSides,
    canGroupLink,
    pairPrompt,
    onManualPair,
    onCreateGroup,
    selectedBank,
    selectedCompany,
    bankSum,
    companySum,
  ])

  const handleScrollToGroup = (groupId: number) => {
    onScrollToComparisonRow?.(`group-${groupId}`)
  }

  async function handleSelectionBulkClassify(classification: string) {
    setClassifyLoading(true)
    setClassifyError(null)
    try {
      const targets = collectSelectionClassificationTargets(selectedBank, selectedCompany)
      const payload = classification === '' ? null : classification
      for (const pairId of targets.pairIds) {
        await onSetPairClassification(pairId, payload ?? '')
      }
      for (const txId of targets.bankPendingIds) {
        await onSetClassification('bank', txId, payload ?? '')
      }
      for (const txId of targets.companyPendingIds) {
        await onSetClassification('company', txId, payload ?? '')
      }
    } catch (e) {
      setClassifyError(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setClassifyLoading(false)
    }
  }

  return (
    <div className="ledger-view">
      <div className="ledger-view-metrics" aria-label="Resumen del archivo completo">
        <div className="ledger-view-metric ledger-view-metric--bank">
          <span className="ledger-view-metric-label">Banco</span>
          <strong>{summary.bankCount}</strong>
          <span className="ledger-view-metric-sub">
            {summary.bankMatched} conciliados · {summary.bankPending} pend.
          </span>
          <span className="ledger-view-metric-sum">Σ {formatAmount(summary.bankSum)}</span>
        </div>
        <div className="ledger-view-metric ledger-view-metric--company">
          <span className="ledger-view-metric-label">Empresa</span>
          <strong>{summary.companyCount}</strong>
          <span className="ledger-view-metric-sub">
            {summary.companyMatched} conciliados · {summary.companyPending} pend.
          </span>
          <span className="ledger-view-metric-sum">Σ {formatAmount(summary.companySum)}</span>
        </div>
        <div className="ledger-view-metric ledger-view-metric--delta">
          <span className="ledger-view-metric-label">Δ (empresa − banco)</span>
          <strong>{formatAmount(summary.delta)}</strong>
        </div>
      </div>

      {reconcileLocked ? (
        <p className="ledger-view-readonly-hint">Sesión cerrada: solo consulta.</p>
      ) : null}

      {manualLinkError ? <p className="msg err ledger-view-link-err">{manualLinkError}</p> : null}

      <div
        className="ledger-tables-panel ledger-view-grid rubro-detail-grid rubro-detail-grid--panels"
        onMouseLeave={handleGridMouseLeave}
      >
        <MovementMiniTable
          side="bank"
          title="Extracto banco"
          items={bankItems}
          linkMode={linkMode}
          panelLayout
          adaptiveHeight
          visibleRows={12}
          hideLinkHint
          selectedTxIds={linkMode ? selectedBankIds : undefined}
          onToggleTxId={linkMode ? toggleBank : undefined}
          onViewPair={setViewPairId}
          onScrollToGroup={handleScrollToGroup}
          onUnlinkGroup={onUnlinkGroup}
          tableWrapRef={bankWrapRef}
          keyboardNav={{
            focusedTxId,
            tableActive: focusedSide === 'bank',
          }}
          onTableMouseEnter={() => handleTableMouseEnter('bank')}
        />
        <MovementMiniTable
          side="company"
          title="Libro empresa"
          items={companyItems}
          linkMode={linkMode}
          panelLayout
          adaptiveHeight
          visibleRows={12}
          hideLinkHint
          selectedTxIds={linkMode ? selectedCompanyIds : undefined}
          onToggleTxId={linkMode ? toggleCompany : undefined}
          onViewPair={setViewPairId}
          onScrollToGroup={handleScrollToGroup}
          onUnlinkGroup={onUnlinkGroup}
          tableWrapRef={companyWrapRef}
          keyboardNav={{
            focusedTxId,
            tableActive: focusedSide === 'company',
          }}
          onTableMouseEnter={() => handleTableMouseEnter('company')}
        />
      </div>

      {linkMode && hasSelection ? (
        <PendingLinkSelectionPanel
          selectedBank={selectedBank}
          selectedCompany={selectedCompany}
          bankSum={bankSum}
          companySum={companySum}
          delta={delta}
          hasBank={hasBank}
          hasCompany={hasCompany}
          bothSides={bothSides}
          canGroupLink={canGroupLink}
          manualLinkLoading={manualLinkLoading}
          sessionAmountTolerance={sessionAmountTolerance}
          classificationReadOnly={classificationReadOnly}
          classificationSuggestions={classificationSuggestions}
          classifyLoading={classifyLoading}
          classifyError={classifyError}
          onBulkClassify={handleSelectionBulkClassify}
          enterHint
          showSelectionTables
          onViewPair={setViewPairId}
          onClear={() => {
            clearSelection()
            setClassifyError(null)
          }}
          onCreateGroup={onCreateGroup}
          onConfirmPairLink={onManualPair ? () => setLedgerPairLinkOpen(true) : undefined}
        />
      ) : null}

      {ledgerPairLinkOpen && pairPrompt && onManualPair ? (
        <RubroLinkConfirmModal
          prompt={pairPrompt}
          loading={manualLinkLoading}
          error={manualLinkError}
          onCancel={() => setLedgerPairLinkOpen(false)}
          onConfirm={() => {
            void onManualPair(pairPrompt.bankId, pairPrompt.companyId)
            setLedgerPairLinkOpen(false)
          }}
        />
      ) : null}

      {pairPreview ? (
        <PairPreviewModal
          data={pairPreview}
          onClose={() => setViewPairId(null)}
          canUnlink={onUnlinkPair != null}
          onUnlinkPair={onUnlinkPair}
        />
      ) : null}
    </div>
  )
}
