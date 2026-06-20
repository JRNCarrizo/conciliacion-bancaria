import { useMemo, useState } from 'react'
import { MovementMiniTable } from './MovementMiniTable'
import { PairPreviewModal } from './PairPreviewModal'
import { RubroLinkConfirmModal, usePendingPairLinkPicker } from './RubroLinkConfirmModal'
import type { SessionDetail } from './types'
import { formatAmount } from './utils/format'
import { resolvePairPreview } from './utils/pairLookup'
import {
  allBankMovementRefs,
  allCompanyMovementRefs,
  ledgerViewSummary,
} from './utils/rubroGroups'

export function FullLedgerView({
  detail,
  reconcileLocked,
  manualLinkLoading,
  manualLinkError,
  onManualPair,
  onUnlinkPair,
}: {
  detail: SessionDetail
  reconcileLocked: boolean
  manualLinkLoading: boolean
  manualLinkError: string | null
  onManualPair?: (bankId: number, companyId: number) => void
  onUnlinkPair?: (
    pairId: number,
    matchSource: 'MANUAL' | 'AUTO',
  ) => void | boolean | Promise<void | boolean>
}) {
  const [viewPairId, setViewPairId] = useState<number | null>(null)

  const bankItems = useMemo(() => allBankMovementRefs(detail), [detail])
  const companyItems = useMemo(() => allCompanyMovementRefs(detail), [detail])
  const summary = useMemo(() => ledgerViewSummary(detail), [detail])

  const linkableBank = useMemo(() => bankItems.filter((i) => i.pairId == null), [bankItems])
  const linkableCompany = useMemo(() => companyItems.filter((i) => i.pairId == null), [companyItems])

  const linkMode =
    !reconcileLocked &&
    onManualPair != null &&
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
    selectedBankId,
    selectedCompanyId,
    toggleBank,
    toggleCompany,
    prompt: linkPrompt,
    dismissPrompt: dismissLinkPrompt,
  } = usePendingPairLinkPicker(linkMode, linkableBank, linkableCompany, linkPickerResetKey)

  const pairPreview = useMemo(
    () => (viewPairId != null ? resolvePairPreview(detail, viewPairId) : null),
    [detail, viewPairId],
  )

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

      {linkMode ? (
        <p className="rubro-detail-link-hint ledger-view-link-hint">
          Elegí un <strong>pend.</strong> en cada columna para vincular manualmente. Cada tabla tiene
          scroll independiente.
        </p>
      ) : reconcileLocked ? (
        <p className="ledger-view-readonly-hint">Sesión cerrada: solo consulta.</p>
      ) : null}

      <div className="ledger-view-grid rubro-detail-grid">
        <MovementMiniTable
          side="bank"
          title={`Extracto banco (${bankItems.length})`}
          items={bankItems}
          linkMode={linkMode}
          selectedTxId={selectedBankId}
          onToggleTxId={linkMode ? toggleBank : undefined}
          onViewPair={setViewPairId}
        />
        <MovementMiniTable
          side="company"
          title={`Libro empresa (${companyItems.length})`}
          items={companyItems}
          linkMode={linkMode}
          selectedTxId={selectedCompanyId}
          onToggleTxId={linkMode ? toggleCompany : undefined}
          onViewPair={setViewPairId}
        />
      </div>

      {linkPrompt && onManualPair ? (
        <RubroLinkConfirmModal
          prompt={linkPrompt}
          loading={manualLinkLoading}
          error={manualLinkError}
          onCancel={dismissLinkPrompt}
          onConfirm={() => onManualPair(linkPrompt.bankId, linkPrompt.companyId)}
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
