import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { SessionDetail } from './types'
import { ClassificationComboControlled } from './ClassificationCombo'
import { isEnterKey, isTypingTarget } from './keyboardScrollUtils'
import { MovementMiniTable } from './MovementMiniTable'
import { useLedgerKeyboardNav } from './useLedgerKeyboardNav'
import {
  aggregateCrossComparison,
  buildRubroGroups,
  bulkClassificationTargetCount,
  collectBulkClassificationTargets,
  isRubroMovementLinkable,
  crossCompareTableItems,
  mergedBankItems,
  mergedCompanyItems,
  resolvePickedRubroGroups,
  rubroGroupsSummary,
  SIN_DETALLE_LABEL,
  SIN_RUBRO_LABEL,
  type RubroGroupMode,
  type RubroGroupRow,
  type RubroMovementRef,
} from './utils/rubroGroups'
import { PairPreviewModal } from './PairPreviewModal'
import { HelpPopoverButton } from './HelpPopoverButton'
import { PendingLinkSelectionPanel } from './PendingLinkSelectionPanel'
import { RubroLinkConfirmModal } from './RubroLinkConfirmModal'
import { usePendingMultiLinkPicker } from './usePendingMultiLinkPicker'
import { useRubroListKeyboardNav } from './useRubroListKeyboardNav'
import { resolvePairPreview } from './utils/pairLookup'
import { formatAmount } from './utils/format'

/** Anchos de columnas: detalle flexible (%), estado y comparar fijos (rem). */
const RUBRO_SUMMARY_COLS = [
  '2.25rem',
  '24%',
  '7%',
  '11%',
  '7%',
  '11%',
  '10%',
  '5.25rem',
  '5.85rem',
] as const

export type CrossGroupCompareHandle = {
  handleEnterKey: () => void
  scrollIntoView: () => void
  scrollTablesIntoView: () => void
}

const CrossGroupComparePanel = forwardRef<
  CrossGroupCompareHandle,
  {
    bankGroups: RubroGroupRow[]
    companyGroups: RubroGroupRow[]
    tableBankItems: RubroMovementRef[]
    tableCompanyItems: RubroMovementRef[]
    sessionAmountTolerance: number | null | undefined
    reconcileLocked: boolean
    classificationReadOnly: boolean
    classificationSuggestions: readonly string[]
    linkLoading: boolean
    linkError: string | null
    classifyLoading: boolean
    classifyError: string | null
    onClear: () => void
    onManualPair?: (bankId: number, companyId: number) => void
    onCreateGroup?: (bankIds: number[], companyIds: number[]) => void | Promise<void>
    onViewPair?: (pairId: number) => void
    onScrollToGroup?: (groupId: number) => void
    onUnlinkGroup?: (groupId: number) => void
    onBulkClassify: (classification: string) => Promise<void>
    onRemoveBankKey: (groupKey: string) => void
    onRemoveCompanyKey: (groupKey: string) => void
  }
>(function CrossGroupComparePanel(
  {
    bankGroups,
    companyGroups,
    tableBankItems,
    tableCompanyItems,
    sessionAmountTolerance,
    reconcileLocked,
    classificationReadOnly,
    classificationSuggestions,
    linkLoading,
    linkError,
    classifyLoading,
    classifyError,
    onClear,
    onManualPair,
    onCreateGroup,
    onViewPair,
    onScrollToGroup,
    onUnlinkGroup,
    onBulkClassify,
    onRemoveBankKey,
    onRemoveCompanyKey,
  },
  ref,
) {
  const sectionRef = useRef<HTMLElement>(null)
  const tablesRef = useRef<HTMLDivElement>(null)
  const selectionPreviewRef = useRef<HTMLDivElement>(null)
  const [pairLinkOpen, setPairLinkOpen] = useState(false)
  const hasBank = bankGroups.length > 0
  const hasCompany = companyGroups.length > 0
  const bothSides = hasBank && hasCompany

  const metrics = useMemo(
    () => aggregateCrossComparison(bankGroups, companyGroups, sessionAmountTolerance),
    [bankGroups, companyGroups, sessionAmountTolerance],
  )

  const bankItems = tableBankItems
  const companyItems = tableCompanyItems

  const linkableBank = useMemo(
    () => mergedBankItems(bankGroups).filter(isRubroMovementLinkable),
    [bankGroups],
  )
  const linkableCompany = useMemo(
    () => mergedCompanyItems(companyGroups).filter(isRubroMovementLinkable),
    [companyGroups],
  )

  const classifyTargets = useMemo(
    () => collectBulkClassificationTargets(bankGroups, companyGroups),
    [bankGroups, companyGroups],
  )
  const classifyCount = bulkClassificationTargetCount(classifyTargets)

  const canBulkGroupLink =
    bothSides &&
    !reconcileLocked &&
    onCreateGroup != null &&
    linkableBank.length > 0 &&
    linkableCompany.length > 0 &&
    (linkableBank.length > 1 || linkableCompany.length > 1)

  const linkMode =
    bothSides &&
    !reconcileLocked &&
    (onManualPair != null || onCreateGroup != null) &&
    linkableBank.length > 0 &&
    linkableCompany.length > 0

  const linkPickerResetKey = useMemo(
    () =>
      [
        ...bankGroups.map((g) => g.groupKey),
        ...companyGroups.map((g) => g.groupKey),
        ...linkableBank.map((i) => i.m.id),
        ...linkableCompany.map((i) => i.m.id),
      ].join('|'),
    [bankGroups, companyGroups, linkableBank, linkableCompany],
  )

  const {
    selectedBankIds,
    selectedCompanyIds,
    selectedBank,
    selectedCompany,
    toggleBank,
    toggleCompany,
    clearSelection: clearLinkSelection,
    bankSum: selBankSum,
    companySum: selCompanySum,
    delta: selDelta,
    hasBank: selHasBank,
    hasCompany: selHasCompany,
    bothSides: selBothSides,
    canGroupLink,
    pairPrompt: linkPrompt,
    hasSelection: hasLinkSelection,
  } = usePendingMultiLinkPicker(linkMode, linkableBank, linkableCompany, linkPickerResetKey)

  const [classifyDraft, setClassifyDraft] = useState('')

  const detailKeyboardBlocked = pairLinkOpen

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
    interactionBlocked: detailKeyboardBlocked,
    resetKey: linkPickerResetKey,
  })

  useEffect(() => {
    setPairLinkOpen(false)
  }, [linkPickerResetKey])

  useEffect(() => {
    if (!hasLinkSelection) return
    requestAnimationFrame(() => {
      selectionPreviewRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [hasLinkSelection, selectedBankIds, selectedCompanyIds])

  useEffect(() => {
    if (!linkMode) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Enter' || ev.repeat) return
      if (pairLinkOpen) return
      if (isTypingTarget(ev.target)) return
      if (document.querySelector('.rubro-link-confirm-backdrop')) return
      if (canGroupLink && onCreateGroup && selBothSides) {
        const bankIds = selectedBank.map((i) => i.m.id)
        const companyIds = selectedCompany.map((i) => i.m.id)
        const msg =
          `¿Conciliar grupo con ${bankIds.length} mov. banco y ${companyIds.length} mov. empresa?\n` +
          `Σ banco ${formatAmount(selBankSum)} · Σ empresa ${formatAmount(selCompanySum)}`
        ev.preventDefault()
        if (!window.confirm(msg)) return
        void onCreateGroup(bankIds, companyIds)
        return
      }
      if (linkPrompt && onManualPair) {
        ev.preventDefault()
        setPairLinkOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    linkMode,
    pairLinkOpen,
    canGroupLink,
    onCreateGroup,
    selBothSides,
    selectedBank,
    selectedCompany,
    selBankSum,
    selCompanySum,
    linkPrompt,
    onManualPair,
  ])

  useEffect(() => {
    if (!linkMode) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return
      if (isTypingTarget(ev.target)) return
      if (document.querySelector('.rubro-link-confirm-backdrop')) return
      if (!hasLinkSelection && focusedTxId == null) return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      clearLinkSelection()
      setPairLinkOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [linkMode, hasLinkSelection, focusedTxId, clearLinkSelection])

  const runBulkGroupLinkConfirm = useCallback(() => {
    if (!canBulkGroupLink || !onCreateGroup) return
    const bankIds = linkableBank.map((i) => i.m.id)
    const companyIds = linkableCompany.map((i) => i.m.id)
    const msg =
      `¿Conciliar grupo con ${bankIds.length} mov. banco y ${companyIds.length} mov. empresa?\n` +
      `Σ banco ${formatAmount(metrics.bankSum)} · Σ empresa ${formatAmount(metrics.companySum)}`
    if (!window.confirm(msg)) return
    void onCreateGroup(bankIds, companyIds)
  }, [canBulkGroupLink, onCreateGroup, linkableBank, linkableCompany, metrics.bankSum, metrics.companySum])

  useImperativeHandle(
    ref,
    () => ({
      scrollIntoView() {
        sectionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      },
      scrollTablesIntoView() {
        tablesRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      },
      handleEnterKey() {
        if (pairLinkOpen) return
        if (canGroupLink && onCreateGroup && selBothSides) {
          const bankIds = selectedBank.map((i) => i.m.id)
          const companyIds = selectedCompany.map((i) => i.m.id)
          const msg =
            `¿Conciliar grupo con ${bankIds.length} mov. banco y ${companyIds.length} mov. empresa?\n` +
            `Σ banco ${formatAmount(selBankSum)} · Σ empresa ${formatAmount(selCompanySum)}`
          if (!window.confirm(msg)) return
          void onCreateGroup(bankIds, companyIds)
          return
        }
        if (canBulkGroupLink) {
          runBulkGroupLinkConfirm()
          return
        }
        if (linkPrompt && onManualPair) {
          setPairLinkOpen(true)
        }
      },
    }),
    [
      pairLinkOpen,
      canGroupLink,
      canBulkGroupLink,
      onCreateGroup,
      selBothSides,
      selectedBank,
      selectedCompany,
      selBankSum,
      selCompanySum,
      linkPrompt,
      onManualPair,
      runBulkGroupLinkConfirm,
    ],
  )

  const panelTitle = bothSides
    ? `Comparación cruzada (${bankGroups.length} banco · ${companyGroups.length} empresa)`
    : hasBank
      ? `Vista previa — ${bankGroups.length} grupo${bankGroups.length === 1 ? '' : 's'} banco`
      : `Vista previa — ${companyGroups.length} grupo${companyGroups.length === 1 ? '' : 's'} empresa`

  async function applyBulkClassification() {
    const label = classifyDraft.trim()
    const parts: string[] = []
    if (classifyTargets.bankPendingIds.length > 0) {
      parts.push(`${classifyTargets.bankPendingIds.length} banco`)
    }
    if (classifyTargets.companyPendingIds.length > 0) {
      parts.push(`${classifyTargets.companyPendingIds.length} empresa`)
    }
    if (classifyTargets.pairIds.length > 0) {
      parts.push(`${classifyTargets.pairIds.length} par${classifyTargets.pairIds.length === 1 ? '' : 'es'}`)
    }
    const detail = parts.join(', ')
    const msg = label
      ? `¿Asignar clasificación «${label}» a ${classifyCount} movimiento${classifyCount === 1 ? '' : 's'} (${detail})?`
      : `¿Quitar clasificación de ${classifyCount} movimiento${classifyCount === 1 ? '' : 's'} (${detail})?`
    if (!window.confirm(msg)) return
    await onBulkClassify(label)
  }

  return (
    <>
      <section ref={sectionRef} className="rubro-cross-compare" aria-label="Comparación entre grupos elegidos">
      <header className="rubro-cross-compare-head">
        <div className="rubro-cross-head-main">
          <h4>{panelTitle}</h4>
          {!bothSides ? (
            <p className="rubro-cross-head-hint">
              {hasBank
                ? 'Elegí grupos de empresa para comparar sumas y vincular.'
                : 'Elegí grupos de banco para comparar sumas y vincular.'}
            </p>
          ) : null}
        </div>
        <button type="button" className="btn-secondary rubro-cross-clear" onClick={onClear}>
          Quitar selección
        </button>
      </header>

      {(hasBank || hasCompany) && (
        <div className="rubro-cross-pick-chips" aria-label="Grupos en comparación">
          {bankGroups.map((g) => (
            <span key={`b-${g.groupKey}`} className="rubro-cross-pick-chip rubro-cross-pick-chip--bank">
              <span className="rubro-cross-pick-chip-label">Banco · {g.rubro}</span>
              <button
                type="button"
                className="rubro-cross-pick-chip-remove"
                aria-label={`Quitar ${g.rubro} del lado banco`}
                onClick={() => onRemoveBankKey(g.groupKey)}
              >
                ×
              </button>
            </span>
          ))}
          {companyGroups.map((g) => (
            <span key={`c-${g.groupKey}`} className="rubro-cross-pick-chip rubro-cross-pick-chip--company">
              <span className="rubro-cross-pick-chip-label">Empresa · {g.rubro}</span>
              <button
                type="button"
                className="rubro-cross-pick-chip-remove"
                aria-label={`Quitar ${g.rubro} del lado empresa`}
                onClick={() => onRemoveCompanyKey(g.groupKey)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="rubro-cross-movements-label">Movimientos</p>

      {bankItems.length > 0 || companyItems.length > 0 ? (
        <div className="keyboard-hint-anchor keyboard-hint-anchor--inline">
          <HelpPopoverButton
            variant="keyboard"
            ariaLabel="Atajos de teclado en comparación de rubros"
            dialogLabel="Atajos — comparación entre rubros"
          >
            <p className="keyboard-hint-popover-body">
              <kbd>↑</kbd> <kbd>↓</kbd> filas · <kbd>←</kbd> <kbd>→</kbd> lado ·{' '}
              {linkMode ? (
                <>
                  <kbd>Espacio</kbd> pend. · <kbd>Enter</kbd> vincular ·
                </>
              ) : null}{' '}
              <kbd>Esc</kbd> limpia selección
            </p>
          </HelpPopoverButton>
        </div>
      ) : (
        <p className="rubro-cross-preview-hint">
          No hay movimientos en los rubros marcados. Probá otro grupo o quitá filtros.
        </p>
      )}

      {!(linkMode && hasLinkSelection) ? (
        <div className="rubro-cross-dashboard">
          <div className="rubro-cross-metrics">
            {hasBank ? (
              <div className="rubro-cross-metric rubro-cross-metric--bank">
                <span className="rubro-cross-metric-label">Σ Banco</span>
                <strong>{formatAmount(metrics.bankSum)}</strong>
                <span className="rubro-cross-metric-sub">
                  {metrics.bankCount} mov. · {bankGroups.length} grp.
                </span>
              </div>
            ) : null}
            {hasCompany ? (
              <div className="rubro-cross-metric rubro-cross-metric--company">
                <span className="rubro-cross-metric-label">Σ Empresa</span>
                <strong>{formatAmount(metrics.companySum)}</strong>
                <span className="rubro-cross-metric-sub">
                  {metrics.companyCount} mov. · {companyGroups.length} grp.
                </span>
              </div>
            ) : null}
            {bothSides ? (
              <div className="rubro-cross-metric rubro-cross-metric--delta">
                <span className="rubro-cross-metric-label">Δ</span>
                <div className="rubro-cross-metric-delta-row">
                  <strong>{formatAmount(metrics.delta)}</strong>
                  {metrics.squared ? (
                    <span className="compare-badge compare-badge--estado rubro-badge--ok">Cuadrado</span>
                  ) : (
                    <span className="compare-badge compare-badge--estado rubro-badge--warn">Revisar</span>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {(canBulkGroupLink || (!classificationReadOnly && classifyCount > 0)) && (
            <div className="rubro-cross-actions">
              {canBulkGroupLink ? (
                <div className="rubro-cross-action rubro-cross-action--link">
                  <button
                    type="button"
                    className="btn-import rubro-cross-group-link-btn"
                    disabled={linkLoading}
                    onClick={runBulkGroupLinkConfirm}
                  >
                    {linkLoading
                      ? 'Guardando…'
                      : `Conciliar todo N:M (${linkableBank.length}·${linkableCompany.length})`}
                  </button>
                  {linkError ? <p className="msg err rubro-cross-group-link-err">{linkError}</p> : null}
                </div>
              ) : null}

              {!classificationReadOnly && classifyCount > 0 ? (
                <div className="rubro-cross-action rubro-cross-action--classify">
                  <label className="rubro-cross-classify-caption" htmlFor="rubro-cross-classify-input">
                    Clasificación
                  </label>
                  <div className="rubro-cross-classify-row">
                    <div className="clasif-field-wrap rubro-cross-classify-field">
                      <ClassificationComboControlled
                        text={classifyDraft}
                        onTextChange={setClassifyDraft}
                        suggestions={classificationSuggestions}
                        disabled={classifyLoading}
                        placeholder="Ej.: Comisiones"
                        ariaLabel="Clasificación para la selección"
                        inputId="rubro-cross-classify-input"
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
            </div>
          )}
        </div>
      ) : null}

      <div
        ref={tablesRef}
        className="rubro-cross-tables rubro-detail-grid"
        onMouseLeave={handleGridMouseLeave}
      >
        <MovementMiniTable
          side="bank"
          title={`Banco (${bankItems.length})`}
          items={bankItems}
          linkMode={linkMode}
          selectedTxIds={linkMode ? selectedBankIds : undefined}
          onToggleTxId={linkMode ? toggleBank : undefined}
          onViewPair={onViewPair}
          onScrollToGroup={onScrollToGroup}
          onUnlinkGroup={onUnlinkGroup}
          tableWrapRef={bankWrapRef}
          visibleRows={10}
          adaptiveHeight
          hideLinkHint
          keyboardNav={{
            focusedTxId,
            tableActive: focusedSide === 'bank',
          }}
          onTableMouseEnter={() => handleTableMouseEnter('bank')}
        />
        <MovementMiniTable
          side="company"
          title={`Empresa (${companyItems.length})`}
          items={companyItems}
          linkMode={linkMode}
          selectedTxIds={linkMode ? selectedCompanyIds : undefined}
          onToggleTxId={linkMode ? toggleCompany : undefined}
          onViewPair={onViewPair}
          onScrollToGroup={onScrollToGroup}
          onUnlinkGroup={onUnlinkGroup}
          tableWrapRef={companyWrapRef}
          visibleRows={10}
          adaptiveHeight
          hideLinkHint
          keyboardNav={{
            focusedTxId,
            tableActive: focusedSide === 'company',
          }}
          onTableMouseEnter={() => handleTableMouseEnter('company')}
        />
      </div>
    </section>

      {linkMode && hasLinkSelection ? (
        <div ref={selectionPreviewRef} className="ledger-selection-preview-anchor">
          <PendingLinkSelectionPanel
            selectedBank={selectedBank}
            selectedCompany={selectedCompany}
            bankSum={selBankSum}
            companySum={selCompanySum}
            delta={selDelta}
            hasBank={selHasBank}
            hasCompany={selHasCompany}
            bothSides={selBothSides}
            canGroupLink={canGroupLink}
            manualLinkLoading={linkLoading}
            sessionAmountTolerance={sessionAmountTolerance}
            enterHint
            onViewPair={onViewPair}
            onClear={clearLinkSelection}
            onCreateGroup={onCreateGroup}
            onConfirmPairLink={onManualPair ? () => setPairLinkOpen(true) : undefined}
          />
        </div>
      ) : null}

      {pairLinkOpen && linkPrompt && onManualPair ? (
        <RubroLinkConfirmModal
          prompt={linkPrompt}
          loading={linkLoading}
          error={linkError}
          onCancel={() => setPairLinkOpen(false)}
          onConfirm={() => {
            onManualPair(linkPrompt.bankId, linkPrompt.companyId)
            setPairLinkOpen(false)
          }}
        />
      ) : null}
    </>
  )
})

function RubroExpandedBottomPanel({
  group,
  sessionAmountTolerance,
  manualLinkLoading,
  onCreateGroup,
  onViewPair,
  onScrollToGroup,
  onUnlinkGroup,
  detailKeyboardActive,
  onExitDetailKeyboard,
  onExitDetailAtEnd,
  linkMode,
  selectedBankIds,
  selectedCompanyIds,
  selectedBank,
  selectedCompany,
  toggleBank,
  toggleCompany,
  detailPairLinkOpen,
  bankSum,
  companySum,
  delta,
  hasBank,
  hasCompany,
  bothSides,
  canGroupLink,
  hasSelection,
  onClearSelection,
  onConfirmPairLink,
  panelRef,
}: {
  group: RubroGroupRow
  sessionAmountTolerance?: number | null
  manualLinkLoading: boolean
  onCreateGroup?: (bankIds: number[], companyIds: number[]) => void | Promise<void>
  onConfirmPairLink?: () => void
  onViewPair?: (pairId: number) => void
  onScrollToGroup?: (groupId: number) => void
  onUnlinkGroup?: (groupId: number) => void
  detailKeyboardActive: boolean
  onExitDetailKeyboard: () => void
  onExitDetailAtEnd: () => void
  linkMode: boolean
  selectedBankIds?: Set<number>
  selectedCompanyIds?: Set<number>
  selectedBank: readonly RubroMovementRef[]
  selectedCompany: readonly RubroMovementRef[]
  toggleBank?: (id: number) => void
  toggleCompany?: (id: number) => void
  detailPairLinkOpen: boolean
  bankSum: number
  companySum: number
  delta: number
  hasBank: boolean
  hasCompany: boolean
  bothSides: boolean
  canGroupLink: boolean
  hasSelection: boolean
  onClearSelection: () => void
  panelRef?: RefObject<HTMLDivElement | null>
}) {
  const linkPickerResetKey = useMemo(
    () =>
      [
        group.groupKey,
        ...group.bankItems.map((i) => i.m.id),
        ...group.companyItems.map((i) => i.m.id),
      ].join('|'),
    [group.groupKey, group.bankItems, group.companyItems],
  )

  const {
    bankWrapRef,
    companyWrapRef,
    focusedTxId,
    focusedSide,
    handleTableMouseEnter,
    handleGridMouseLeave,
  } = useLedgerKeyboardNav({
    enabled: group.bankItems.length > 0 || group.companyItems.length > 0,
    bankItems: group.bankItems,
    companyItems: group.companyItems,
    linkMode,
    toggleBank: toggleBank ?? (() => {}),
    toggleCompany: toggleCompany ?? (() => {}),
    interactionBlocked: detailPairLinkOpen,
    resetKey: linkPickerResetKey,
    forcedActive: detailKeyboardActive,
    onExitUp: onExitDetailKeyboard,
    onExitDownAtEnd: onExitDetailAtEnd,
  })

  return (
    <div ref={panelRef} className="rubro-expanded-bottom-wrap">
      <section
        className="rubro-expanded-bottom-panel rubro-cross-compare"
        aria-label={`Detalle del grupo ${group.rubro}`}
      >
      <header className="rubro-cross-compare-head">
        <div className="rubro-cross-head-main">
          <h4>{group.rubro}</h4>
          <p className="rubro-cross-head-hint">
            {group.bankCount} mov. banco · {group.companyCount} mov. empresa · Δ{' '}
            {formatAmount(group.delta)}
          </p>
        </div>
        {group.bankItems.length > 0 || group.companyItems.length > 0 ? (
          <HelpPopoverButton
            variant="keyboard"
            ariaLabel="Atajos de teclado en detalle del rubro"
            dialogLabel="Atajos — detalle del rubro"
          >
            {linkMode ? (
              <p className="keyboard-hint-popover-body">
                <kbd>↑</kbd> <kbd>↓</kbd> recorren filas · <kbd>←</kbd> <kbd>→</kbd> cambian de tabla ·{' '}
                <kbd>↑</kbd> en la primera fila vuelve al rubro · <kbd>Espacio</kbd> selecciona
                pendientes · <kbd>Enter</kbd> confirma vínculo o grupo · <kbd>Esc</kbd> limpia selección.
              </p>
            ) : (
              <p className="keyboard-hint-popover-body">
                <kbd>↑</kbd> <kbd>↓</kbd> recorren filas · <kbd>←</kbd> <kbd>→</kbd> pasan al otro lado ·{' '}
                <kbd>↑</kbd> en la primera fila vuelve al rubro.
              </p>
            )}
          </HelpPopoverButton>
        ) : null}
      </header>

      <div className="rubro-cross-tables rubro-detail-grid" onMouseLeave={handleGridMouseLeave}>
        <MovementMiniTable
          side="bank"
          title={`Banco (${group.bankCount})`}
          items={group.bankItems}
          linkMode={linkMode}
          selectedTxIds={linkMode ? selectedBankIds : undefined}
          onToggleTxId={linkMode ? toggleBank : undefined}
          onViewPair={onViewPair}
          onScrollToGroup={onScrollToGroup}
          onUnlinkGroup={onUnlinkGroup}
          tableWrapRef={bankWrapRef}
          visibleRows={10}
          adaptiveHeight
          hideLinkHint
          keyboardNav={{
            focusedTxId,
            tableActive: focusedSide === 'bank',
          }}
          onTableMouseEnter={() => handleTableMouseEnter('bank')}
        />
        <MovementMiniTable
          side="company"
          title={`Empresa (${group.companyCount})`}
          items={group.companyItems}
          linkMode={linkMode}
          selectedTxIds={linkMode ? selectedCompanyIds : undefined}
          onToggleTxId={linkMode ? toggleCompany : undefined}
          onViewPair={onViewPair}
          onScrollToGroup={onScrollToGroup}
          onUnlinkGroup={onUnlinkGroup}
          tableWrapRef={companyWrapRef}
          visibleRows={10}
          adaptiveHeight
          hideLinkHint
          keyboardNav={{
            focusedTxId,
            tableActive: focusedSide === 'company',
          }}
          onTableMouseEnter={() => handleTableMouseEnter('company')}
        />
      </div>
      </section>

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
          enterHint
          onViewPair={onViewPair}
          onClear={onClearSelection}
          onCreateGroup={onCreateGroup}
          onConfirmPairLink={onConfirmPairLink}
        />
      ) : null}
    </div>
  )
}

export function RubroGroupsView({
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
  sessionAmountTolerance: number | null | undefined
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
  const [groupMode, setGroupMode] = useState<RubroGroupMode>('classification')
  const [viewPairId, setViewPairId] = useState<number | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [expandedDetailPairLinkOpen, setExpandedDetailPairLinkOpen] = useState(false)
  const [hideEmpty, setHideEmpty] = useState(false)
  const [onlyMismatch, setOnlyMismatch] = useState(false)
  const [pickBankKeys, setPickBankKeys] = useState<Set<string>>(() => new Set())
  const [pickCompanyKeys, setPickCompanyKeys] = useState<Set<string>>(() => new Set())
  const [classifyLoading, setClassifyLoading] = useState(false)
  const [classifyError, setClassifyError] = useState<string | null>(null)
  const crossCompareRef = useRef<CrossGroupCompareHandle>(null)
  const expandedBottomRef = useRef<HTMLDivElement>(null)

  const handleScrollToGroup = useCallback(
    (groupId: number) => {
      onScrollToComparisonRow?.(`group-${groupId}`)
    },
    [onScrollToComparisonRow],
  )

  const groups = useMemo(
    () => buildRubroGroups(detail, sessionAmountTolerance, groupMode),
    [detail, sessionAmountTolerance, groupMode],
  )

  const groupsByKey = useMemo(() => new Map(groups.map((g) => [g.groupKey, g])), [groups])

  const expandedGroup = useMemo(
    () => (expandedKey != null ? (groupsByKey.get(expandedKey) ?? null) : null),
    [expandedKey, groupsByKey],
  )

  const expandedLinkableBank = useMemo(
    () => (expandedGroup?.bankItems.filter(isRubroMovementLinkable) ?? []),
    [expandedGroup],
  )
  const expandedLinkableCompany = useMemo(
    () => (expandedGroup?.companyItems.filter(isRubroMovementLinkable) ?? []),
    [expandedGroup],
  )

  const expandedLinkMode =
    expandedGroup != null &&
    !reconcileLocked &&
    (onManualPair != null || onCreateGroup != null) &&
    expandedLinkableBank.length > 0 &&
    expandedLinkableCompany.length > 0

  const expandedLinkPickerResetKey = useMemo(
    () =>
      expandedGroup == null
        ? ''
        : [
            expandedGroup.groupKey,
            ...expandedLinkableBank.map((i) => i.m.id),
            ...expandedLinkableCompany.map((i) => i.m.id),
          ].join('|'),
    [expandedGroup, expandedLinkableBank, expandedLinkableCompany],
  )

  const {
    selectedBankIds: expandedSelectedBankIds,
    selectedCompanyIds: expandedSelectedCompanyIds,
    selectedBank: expandedSelectedBank,
    selectedCompany: expandedSelectedCompany,
    toggleBank: expandedToggleBank,
    toggleCompany: expandedToggleCompany,
    clearSelection: clearExpandedLinkSelection,
    bankSum: expandedBankSum,
    companySum: expandedCompanySum,
    delta: expandedDelta,
    hasBank: expandedHasBank,
    hasCompany: expandedHasCompany,
    bothSides: expandedBothSides,
    canGroupLink: expandedCanGroupLink,
    pairPrompt: expandedPairPrompt,
    hasSelection: expandedHasLinkSelection,
  } = usePendingMultiLinkPicker(
    expandedLinkMode,
    expandedLinkableBank,
    expandedLinkableCompany,
    expandedLinkPickerResetKey,
  )

  useEffect(() => {
    setExpandedDetailPairLinkOpen(false)
  }, [expandedLinkPickerResetKey, expandedKey])

  useEffect(() => {
    if (!expandedLinkMode) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return
      if (isTypingTarget(ev.target)) return
      if (document.querySelector('.rubro-link-confirm-backdrop')) return
      if (!expandedHasLinkSelection) return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      clearExpandedLinkSelection()
      setExpandedDetailPairLinkOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expandedLinkMode, expandedHasLinkSelection, clearExpandedLinkSelection])

  const pickedBankGroups = useMemo(
    () =>
      [...pickBankKeys]
        .map((k) => groupsByKey.get(k))
        .filter((g): g is RubroGroupRow => g != null),
    [pickBankKeys, groupsByKey],
  )
  const pickedCompanyGroups = useMemo(
    () =>
      [...pickCompanyKeys]
        .map((k) => groupsByKey.get(k))
        .filter((g): g is RubroGroupRow => g != null),
    [pickCompanyKeys, groupsByKey],
  )
  const crossPreviewGroups = useMemo(
    () => resolvePickedRubroGroups(groups, pickBankKeys, pickCompanyKeys),
    [groups, pickBankKeys, pickCompanyKeys],
  )

  const crossTableItems = useMemo(
    () => crossCompareTableItems(crossPreviewGroups),
    [crossPreviewGroups],
  )

  const hasComparePicks = pickBankKeys.size > 0 || pickCompanyKeys.size > 0

  useEffect(() => {
    if (pickBankKeys.size === 0 && pickCompanyKeys.size === 0) return
    requestAnimationFrame(() => {
      crossCompareRef.current?.scrollTablesIntoView()
    })
  }, [pickBankKeys, pickCompanyKeys, crossPreviewGroups.length])

  useEffect(() => {
    setExpandedKey(null)
    setPickBankKeys(new Set())
    setPickCompanyKeys(new Set())
    setClassifyError(null)
  }, [groupMode])

  useEffect(() => {
    setPickBankKeys((prev) => {
      const next = new Set([...prev].filter((k) => groupsByKey.has(k)))
      return next.size === prev.size ? prev : next
    })
  }, [groupsByKey])

  useEffect(() => {
    setPickCompanyKeys((prev) => {
      const next = new Set([...prev].filter((k) => groupsByKey.has(k)))
      return next.size === prev.size ? prev : next
    })
  }, [groupsByKey])

  const emptyLabel = groupMode === 'classification' ? SIN_RUBRO_LABEL : SIN_DETALLE_LABEL
  const groupColumnTitle = groupMode === 'classification' ? 'Rubro (clasif.)' : 'Detalle / referencia'

  const filtered = useMemo(() => {
    return groups.filter((g) => {
      if (hideEmpty && g.isSinRubro) return false
      if (onlyMismatch && g.squared) return false
      return true
    })
  }, [groups, hideEmpty, onlyMismatch])

  /** Altura de la lista: crece con las filas visibles (máx. 10), sin hueco vacío si hay pocas. */
  const listVisibleRows = useMemo(() => {
    const n = filtered.length === 0 ? 1 : filtered.length
    return Math.min(10, n)
  }, [filtered.length])

  const rubroListWrapStyle = useMemo(
    () => ({ '--rubro-list-visible-rows': listVisibleRows }) as CSSProperties,
    [listVisibleRows],
  )

  const summary = useMemo(() => rubroGroupsSummary(groups), [groups])

  const pairPreview = useMemo(
    () => (viewPairId != null ? resolvePairPreview(detail, viewPairId) : null),
    [detail, viewPairId],
  )

  const rubroListResetKey = useMemo(
    () =>
      [detail.session.id, groupMode, hideEmpty ? '1' : '0', onlyMismatch ? '1' : '0'].join('|'),
    [detail.session.id, groupMode, hideEmpty, onlyMismatch],
  )

  const [innerNavGroupKey, setInnerNavGroupKey] = useState<string | null>(null)

  useEffect(() => {
    if (!expandedLinkMode || innerNavGroupKey == null) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Enter' || ev.repeat) return
      if (expandedDetailPairLinkOpen) return
      if (isTypingTarget(ev.target)) return
      if (document.querySelector('.rubro-link-confirm-backdrop')) return
      if (expandedCanGroupLink && onCreateGroup && expandedBothSides) {
        const bankIds = expandedSelectedBank.map((i) => i.m.id)
        const companyIds = expandedSelectedCompany.map((i) => i.m.id)
        const msg =
          `¿Conciliar grupo con ${bankIds.length} mov. banco y ${companyIds.length} mov. empresa?\n` +
          `Σ banco ${formatAmount(expandedBankSum)} · Σ empresa ${formatAmount(expandedCompanySum)}`
        ev.preventDefault()
        ev.stopImmediatePropagation()
        if (!window.confirm(msg)) return
        void onCreateGroup(bankIds, companyIds)
        return
      }
      if (expandedPairPrompt && onManualPair) {
        ev.preventDefault()
        ev.stopImmediatePropagation()
        setExpandedDetailPairLinkOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    expandedLinkMode,
    innerNavGroupKey,
    expandedDetailPairLinkOpen,
    expandedCanGroupLink,
    onCreateGroup,
    expandedBothSides,
    expandedSelectedBank,
    expandedSelectedCompany,
    expandedBankSum,
    expandedCompanySum,
    expandedPairPrompt,
    onManualPair,
  ])

  const keyboardBlocked = pairPreview != null

  const toggleBankKey = useCallback((groupKey: string) => {
    setExpandedKey(null)
    setInnerNavGroupKey(null)
    setPickBankKeys((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }, [])

  const toggleCompanyKey = useCallback((groupKey: string) => {
    setExpandedKey(null)
    setInnerNavGroupKey(null)
    setPickCompanyKeys((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }, [])

  useEffect(() => {
    setInnerNavGroupKey(null)
  }, [expandedKey])

  const {
    tableWrapRef: rubroTableWrapRef,
    focusedGroupKey,
    listKeyboardActive,
    handleTableMouseEnter,
    focusNextRubro,
  } = useRubroListKeyboardNav({
    enabled: filtered.length > 0,
    filtered,
    expandedKey,
    setExpandedKey,
    toggleBankKey,
    toggleCompanyKey,
    interactionBlocked: keyboardBlocked,
    resetKey: rubroListResetKey,
    innerNavGroupKey,
    onEnterInnerNav: setInnerNavGroupKey,
  })

  useEffect(() => {
    if (!expandedHasLinkSelection) return
    requestAnimationFrame(() => {
      expandedBottomRef.current
        ?.querySelector('.ledger-selection-panel')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [expandedHasLinkSelection, expandedSelectedBankIds, expandedSelectedCompanyIds])

  useEffect(() => {
    if (expandedKey == null) return
    const panel = expandedBottomRef.current
    if (!panel) return
    requestAnimationFrame(() => {
      panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [expandedKey])

  useEffect(() => {
    if (innerNavGroupKey != null && innerNavGroupKey !== focusedGroupKey) {
      setInnerNavGroupKey(null)
    }
  }, [focusedGroupKey, innerNavGroupKey])

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (!isEnterKey(ev) || ev.repeat || ev.ctrlKey || ev.shiftKey) return
      if (isTypingTarget(ev.target)) return
      if (keyboardBlocked || document.querySelector('.rubro-link-confirm-backdrop')) return
      const hasPicks = pickBankKeys.size > 0 || pickCompanyKeys.size > 0
      if (!listKeyboardActive && !hasPicks) return
      if (!hasPicks) return
      ev.preventDefault()
      crossCompareRef.current?.scrollIntoView()
      crossCompareRef.current?.handleEnterKey()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboardBlocked, listKeyboardActive, pickBankKeys, pickCompanyKeys])

  const clearAllRubroSelection = useCallback(() => {
    setPickBankKeys(new Set())
    setPickCompanyKeys(new Set())
    setClassifyError(null)
    setExpandedKey(null)
  }, [])

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return
      if (isTypingTarget(ev.target)) return
      if (document.querySelector('.rubro-link-confirm-backdrop')) return
      if (pairPreview) return
      const hasPicks = pickBankKeys.size > 0 || pickCompanyKeys.size > 0
      if (innerNavGroupKey != null) {
        ev.preventDefault()
        setInnerNavGroupKey(null)
        return
      }
      if (!hasPicks && expandedKey == null && !listKeyboardActive && innerNavGroupKey == null) return
      ev.preventDefault()
      clearAllRubroSelection()
      setInnerNavGroupKey(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pairPreview, pickBankKeys, pickCompanyKeys, expandedKey, listKeyboardActive, innerNavGroupKey, clearAllRubroSelection])

  function clearCrossPick() {
    setPickBankKeys(new Set())
    setPickCompanyKeys(new Set())
    setClassifyError(null)
  }

  async function handleBulkClassify(classification: string) {
    setClassifyLoading(true)
    setClassifyError(null)
    try {
      const targets = collectBulkClassificationTargets(pickedBankGroups, pickedCompanyGroups)
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

  const handleViewPair = (pairId: number) => setViewPairId(pairId)

  return (
    <div className="rubro-view">
      <div className="rubro-view-mode-wrap detail-view-toggle-wrap">
        <span className="detail-view-toggle-label">Agrupar por</span>
        <div className="detail-view-toggle rubro-view-mode-toggle" role="tablist" aria-label="Criterio de agrupación">
          <button
            type="button"
            role="tab"
            aria-selected={groupMode === 'specification'}
            className="detail-view-tab detail-view-tab--specification"
            onClick={() => setGroupMode('specification')}
          >
            Mismo detalle en registro
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={groupMode === 'classification'}
            className="detail-view-tab detail-view-tab--classification"
            onClick={() => setGroupMode('classification')}
          >
            Por clasificación (rubro)
          </button>
        </div>
      </div>

      <div className="rubro-view-toolbar" role="group" aria-label="Filtros vista por rubro">
        <label className="rubro-view-check">
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(ev) => setHideEmpty(ev.target.checked)}
          />
          Ocultar {emptyLabel}
        </label>
        <label className="rubro-view-check">
          <input
            type="checkbox"
            checked={onlyMismatch}
            onChange={(ev) => setOnlyMismatch(ev.target.checked)}
          />
          Solo grupos con diferencia
        </label>
      </div>

      <p className="rubro-view-summary" aria-live="polite">
        {summary.totalRubros} grupo{summary.totalRubros === 1 ? '' : 's'}: {summary.squared} cuadrado
        {summary.squared === 1 ? '' : 's'}, {summary.mismatch} con diferencia.{' '}
        {summary.sinRubroBank > 0 || summary.sinRubroCompany > 0 ? (
          <>
            {emptyLabel}: {summary.sinRubroBank} banco / {summary.sinRubroCompany} empresa.
          </>
        ) : null}
      </p>

      <div className="keyboard-hint-anchor keyboard-hint-anchor--rubro-list">
        <HelpPopoverButton
          variant="keyboard"
          ariaLabel="Atajos de teclado en vista por rubro"
          dialogLabel="Atajos — vista por rubro"
        >
          <p className="keyboard-hint-popover-body">
            Lista: <kbd>↑</kbd> <kbd>↓</kbd> recorren rubros · <kbd>Espacio</kbd> marca banco ·{' '}
            <kbd>Shift</kbd>+<kbd>Espacio</kbd> marca empresa · <kbd>Ctrl</kbd>+<kbd>Enter</kbd>{' '}
            despliega movimientos abajo · <kbd>↓</kbd> entra en movimientos del panel ·{' '}
            <kbd>Enter</kbd> confirma en la comparación · <kbd>Esc</kbd> limpia marcas y movimientos
            desplegados (el foco queda en la lista).
          </p>
        </HelpPopoverButton>
      </div>

      <div
        ref={rubroTableWrapRef}
        className="table-wrap rubro-table-wrap table-wrap--scrollY rubro-table-wrap--keynav rubro-table-wrap--list-10"
        style={rubroListWrapStyle}
        tabIndex={-1}
        onMouseEnter={handleTableMouseEnter}
        onFocus={handleTableMouseEnter}
      >
        <table className="data-table rubro-summary-table">
          <colgroup>
            {RUBRO_SUMMARY_COLS.map((width, i) => (
              <col key={i} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="rubro-th-expand" aria-label="Expandir" />
              <th>{groupColumnTitle}</th>
              <th className="rubro-th-num">
                <span className="rubro-th-label"># Banco</span>
              </th>
              <th className="rubro-th-amount">
                <span className="rubro-th-label">Σ Banco</span>
              </th>
              <th className="rubro-th-num">
                <span className="rubro-th-label"># Empresa</span>
              </th>
              <th className="rubro-th-amount">
                <span className="rubro-th-label">Σ Empresa</span>
              </th>
              <th className="rubro-th-amount" title="Empresa − banco">
                Δ
              </th>
              <th className="rubro-th-estado">Estado</th>
              <th className="rubro-th-pick">Comparar</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="compare-empty">
                  {groupMode === 'classification'
                    ? 'No hay grupos con estos filtros. Asigná clasificación en Comparativa o quitá filtros.'
                    : 'No hay grupos con estos filtros. Probá «Por clasificación» o quitá filtros.'}
                </td>
              </tr>
            ) : (
              filtered.map((g) => {
                const open = expandedKey === g.groupKey
                const bankPicked = pickBankKeys.has(g.groupKey)
                const companyPicked = pickCompanyKeys.has(g.groupKey)
                const rowClassName = [
                  'rubro-summary-row',
                  g.isSinRubro ? 'rubro-summary-row--sin' : '',
                  open ? 'rubro-summary-row--open' : '',
                  bankPicked ? 'rubro-summary-row--picked-bank' : '',
                  companyPicked ? 'rubro-summary-row--picked-company' : '',
                  focusedGroupKey === g.groupKey ? 'rubro-summary-row--keyboard-focus' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <Fragment key={g.groupKey}>
                    <tr className={rowClassName} data-group-key={g.groupKey}>
                      <td>
                        <button
                          type="button"
                          className="rubro-expand-btn"
                          aria-expanded={open}
                          aria-label={
                            open ? `Ocultar detalle de ${g.rubro}` : `Ver movimientos de ${g.rubro}`
                          }
                          onClick={() => {
                            if (!open) {
                              setPickBankKeys(new Set())
                              setPickCompanyKeys(new Set())
                            }
                            setExpandedKey(open ? null : g.groupKey)
                          }}
                        >
                          {open ? '▼' : '▶'}
                        </button>
                      </td>
                      <td className="rubro-name-cell">
                        <strong>{g.rubro}</strong>
                      </td>
                      <td className="rubro-td-num">{g.bankCount}</td>
                      <td className="rubro-td-amount">{formatAmount(g.bankSum)}</td>
                      <td className="rubro-td-num">{g.companyCount}</td>
                      <td className="rubro-td-amount">{formatAmount(g.companySum)}</td>
                      <td className="rubro-td-amount rubro-td-delta">{formatAmount(g.delta)}</td>
                      <td className="rubro-td-estado">
                        {g.isSinRubro ? (
                          <span className="compare-badge compare-badge--estado rubro-badge--sin">
                            {groupMode === 'classification' ? 'Etiquetar' : 'Sin texto'}
                          </span>
                        ) : g.squared ? (
                          <span className="compare-badge compare-badge--estado rubro-badge--ok">
                            Cuadrado
                          </span>
                        ) : (
                          <span className="compare-badge compare-badge--estado rubro-badge--warn">
                            Revisar
                          </span>
                        )}
                      </td>
                      <td className="rubro-td-pick">
                        <div className="rubro-pick-btns">
                          {g.bankCount > 0 ? (
                            <button
                              type="button"
                              className={
                                bankPicked
                                  ? 'rubro-pick-btn rubro-pick-btn--bank rubro-pick-btn--active'
                                  : 'rubro-pick-btn rubro-pick-btn--bank'
                              }
                              onClick={() => toggleBankKey(g.groupKey)}
                              title="Agregar o quitar este grupo del lado banco en la comparación"
                              aria-pressed={bankPicked}
                            >
                              Banco
                            </button>
                          ) : null}
                          {g.companyCount > 0 ? (
                            <button
                              type="button"
                              className={
                                companyPicked
                                  ? 'rubro-pick-btn rubro-pick-btn--company rubro-pick-btn--active'
                                  : 'rubro-pick-btn rubro-pick-btn--company'
                              }
                              onClick={() => toggleCompanyKey(g.groupKey)}
                              title="Agregar o quitar este grupo del lado empresa en la comparación"
                              aria-pressed={companyPicked}
                            >
                              Empresa
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {hasComparePicks && (
        <CrossGroupComparePanel
          ref={crossCompareRef}
          bankGroups={pickedBankGroups}
          companyGroups={pickedCompanyGroups}
          tableBankItems={crossTableItems.bankItems}
          tableCompanyItems={crossTableItems.companyItems}
          sessionAmountTolerance={sessionAmountTolerance}
          reconcileLocked={reconcileLocked}
          classificationReadOnly={classificationReadOnly}
          classificationSuggestions={classificationSuggestions}
          linkLoading={manualLinkLoading}
          linkError={manualLinkError}
          classifyLoading={classifyLoading}
          classifyError={classifyError}
          onClear={clearCrossPick}
          onManualPair={onManualPair}
          onCreateGroup={onCreateGroup}
          onViewPair={handleViewPair}
          onScrollToGroup={handleScrollToGroup}
          onUnlinkGroup={onUnlinkGroup}
          onBulkClassify={handleBulkClassify}
          onRemoveBankKey={toggleBankKey}
          onRemoveCompanyKey={toggleCompanyKey}
        />
      )}

      {expandedGroup ? (
        <RubroExpandedBottomPanel
          panelRef={expandedBottomRef}
          group={expandedGroup}
          sessionAmountTolerance={sessionAmountTolerance}
          manualLinkLoading={manualLinkLoading}
          onCreateGroup={onCreateGroup}
          onViewPair={handleViewPair}
          onScrollToGroup={handleScrollToGroup}
          onUnlinkGroup={onUnlinkGroup}
          detailKeyboardActive={innerNavGroupKey === expandedGroup.groupKey}
          onExitDetailKeyboard={() => setInnerNavGroupKey(null)}
          onExitDetailAtEnd={() => {
            setInnerNavGroupKey(null)
            focusNextRubro()
          }}
          linkMode={expandedLinkMode}
          selectedBankIds={expandedSelectedBankIds}
          selectedCompanyIds={expandedSelectedCompanyIds}
          selectedBank={expandedSelectedBank}
          selectedCompany={expandedSelectedCompany}
          toggleBank={expandedToggleBank}
          toggleCompany={expandedToggleCompany}
          detailPairLinkOpen={expandedDetailPairLinkOpen}
          bankSum={expandedBankSum}
          companySum={expandedCompanySum}
          delta={expandedDelta}
          hasBank={expandedHasBank}
          hasCompany={expandedHasCompany}
          bothSides={expandedBothSides}
          canGroupLink={expandedCanGroupLink}
          hasSelection={expandedHasLinkSelection}
          onClearSelection={clearExpandedLinkSelection}
          onConfirmPairLink={
            onManualPair ? () => setExpandedDetailPairLinkOpen(true) : undefined
          }
        />
      ) : null}

      {manualLinkError && expandedGroup && expandedLinkMode && expandedHasLinkSelection ? (
        <p className="msg err rubro-expanded-link-err">{manualLinkError}</p>
      ) : null}

      {expandedDetailPairLinkOpen && expandedPairPrompt && onManualPair ? (
        <RubroLinkConfirmModal
          prompt={expandedPairPrompt}
          loading={manualLinkLoading}
          error={manualLinkError}
          onCancel={() => setExpandedDetailPairLinkOpen(false)}
          onConfirm={() => {
            onManualPair(expandedPairPrompt.bankId, expandedPairPrompt.companyId)
            setExpandedDetailPairLinkOpen(false)
          }}
        />
      ) : null}

      {pairPreview ? (
        <PairPreviewModal
          data={pairPreview}
          onClose={() => setViewPairId(null)}
          onScrollToRow={onScrollToComparisonRow}
          canUnlink={onUnlinkPair != null}
          onUnlinkPair={onUnlinkPair}
        />
      ) : null}
    </div>
  )
}
