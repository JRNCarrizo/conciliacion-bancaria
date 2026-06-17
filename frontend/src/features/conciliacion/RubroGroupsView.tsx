import { Fragment, useEffect, useMemo, useState } from 'react'
import type { SessionDetail } from './types'
import { ClassificationComboControlled } from './ClassificationCombo'
import {
  aggregateCrossComparison,
  buildRubroGroups,
  bulkClassificationTargetCount,
  collectBulkClassificationTargets,
  mergedBankItems,
  mergedCompanyItems,
  rubroGroupsSummary,
  SIN_DETALLE_LABEL,
  SIN_RUBRO_LABEL,
  type RubroGroupMode,
  type RubroGroupRow,
} from './utils/rubroGroups'
import { PairPreviewModal } from './PairPreviewModal'
import { RubroLinkConfirmModal, usePendingPairLinkPicker } from './RubroLinkConfirmModal'
import { movementSummaryLine } from './utils/counterpartUtils'
import { resolvePairPreview } from './utils/pairLookup'
import { formatAmount, formatDisplayDate } from './utils/format'

function MovementMiniTable({
  title,
  items,
  linkMode,
  selectedTxId,
  onToggleTxId,
  onViewPair,
}: {
  title: string
  items: RubroGroupRow['bankItems']
  linkMode?: boolean
  selectedTxId?: number | null
  /** Clic en pend.: alterna selección (mismo id → deselecciona). */
  onToggleTxId?: (id: number) => void
  /** Clic en par: ver el otro lado del emparejamiento. */
  onViewPair?: (pairId: number) => void
}) {
  if (items.length === 0) {
    return (
      <div className="rubro-detail-side">
        <h4 className="rubro-detail-side-title">{title}</h4>
        <p className="rubro-detail-empty">Sin movimientos en este grupo.</p>
      </div>
    )
  }
  return (
    <div className="rubro-detail-side">
      <h4 className="rubro-detail-side-title">{title}</h4>
      {linkMode ? (
        <p className="rubro-detail-link-hint">
          Tocá <strong>pend.</strong> para elegir el movimiento; otro clic en el mismo lo quita.
        </p>
      ) : null}
      <div className="table-wrap rubro-detail-table-wrap">
        <table className="data-table rubro-detail-table">
          <colgroup>
            <col className="rubro-detail-col-id" />
            <col className="rubro-detail-col-date" />
            <col className="rubro-detail-col-amount" />
            <col className="rubro-detail-col-desc" />
          </colgroup>
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Importe</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ m, pairId }) => {
              const pending = pairId == null
              const canToggle = linkMode && pending && onToggleTxId != null
              const selected = selectedTxId === m.id
              return (
                <tr
                  key={m.id}
                  className={selected ? 'rubro-detail-row--selected' : undefined}
                >
                  <td className="rubro-detail-id-td">
                    <span className="rubro-detail-id-cell">
                      <span className="rubro-detail-id-num">{m.id}</span>
                    {pairId != null ? (
                      <button
                        type="button"
                        className="rubro-detail-pair-btn"
                        title="Ver el movimiento emparejado en el otro lado"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          onViewPair?.(pairId)
                        }}
                      >
                        par
                      </button>
                    ) : pending ? (
                      linkMode && onToggleTxId != null ? (
                        <button
                          type="button"
                          className={
                            selected
                              ? 'rubro-detail-pending-btn rubro-detail-pending-btn--active'
                              : 'rubro-detail-pending-btn'
                          }
                          disabled={!canToggle}
                          aria-pressed={selected}
                          title={
                            selected
                              ? 'Quitar selección para vincular'
                              : 'Seleccionar para vincular con el otro lado'
                          }
                          onClick={(ev) => {
                            ev.stopPropagation()
                            if (canToggle) onToggleTxId(m.id)
                          }}
                        >
                          pend.
                        </button>
                      ) : (
                        <span className="rubro-detail-pending-badge" title="Pendiente de conciliar">
                          pend.
                        </span>
                      )
                    ) : null}
                    </span>
                  </td>
                  <td className="cell-date-nowrap">{formatDisplayDate(m.txDate)}</td>
                  <td>{formatAmount(m.amount)}</td>
                  <td className="cell-desc">{movementSummaryLine(m)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CrossGroupComparePanel({
  bankGroups,
  companyGroups,
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
  onViewPair,
  onBulkClassify,
  onRemoveBankKey,
  onRemoveCompanyKey,
}: {
  bankGroups: RubroGroupRow[]
  companyGroups: RubroGroupRow[]
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
  onViewPair?: (pairId: number) => void
  onBulkClassify: (classification: string) => Promise<void>
  onRemoveBankKey: (groupKey: string) => void
  onRemoveCompanyKey: (groupKey: string) => void
}) {
  const hasBank = bankGroups.length > 0
  const hasCompany = companyGroups.length > 0
  const bothSides = hasBank && hasCompany

  const metrics = useMemo(
    () => aggregateCrossComparison(bankGroups, companyGroups, sessionAmountTolerance),
    [bankGroups, companyGroups, sessionAmountTolerance],
  )

  const bankItems = useMemo(() => mergedBankItems(bankGroups), [bankGroups])
  const companyItems = useMemo(() => mergedCompanyItems(companyGroups), [companyGroups])

  const linkableBank = useMemo(() => bankItems.filter((i) => i.pairId == null), [bankItems])
  const linkableCompany = useMemo(() => companyItems.filter((i) => i.pairId == null), [companyItems])

  const classifyTargets = useMemo(
    () => collectBulkClassificationTargets(bankGroups, companyGroups),
    [bankGroups, companyGroups],
  )
  const classifyCount = bulkClassificationTargetCount(classifyTargets)

  const linkMode = bothSides && !reconcileLocked && onManualPair != null

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
    selectedBankId,
    selectedCompanyId,
    toggleBank,
    toggleCompany,
    prompt: linkPrompt,
    dismissPrompt: dismissLinkPrompt,
  } = usePendingPairLinkPicker(linkMode, linkableBank, linkableCompany, linkPickerResetKey)

  const [classifyDraft, setClassifyDraft] = useState('')

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
    <section className="rubro-cross-compare" aria-label="Comparación entre grupos elegidos">
      <header className="rubro-cross-compare-head">
        <h4>{panelTitle}</h4>
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

      {!bothSides ? (
        <p className="rubro-cross-pick-hint rubro-cross-preview-hint">
          {hasBank
            ? 'Elegí también uno o más grupos de empresa en la tabla para ver el Δ entre sumas y vincular pendientes.'
            : 'Elegí también uno o más grupos de banco en la tabla para ver el Δ entre sumas y vincular pendientes.'}
        </p>
      ) : null}

      <div className="rubro-cross-metrics">
        {hasBank ? (
          <div className="rubro-cross-metric">
            <span className="rubro-cross-metric-label">Σ Banco</span>
            <strong>{formatAmount(metrics.bankSum)}</strong>
            <span className="rubro-cross-metric-sub">
              {metrics.bankCount} mov. · {bankGroups.length} grupo{bankGroups.length === 1 ? '' : 's'}
            </span>
          </div>
        ) : null}
        {hasCompany ? (
          <div className="rubro-cross-metric">
            <span className="rubro-cross-metric-label">Σ Empresa</span>
            <strong>{formatAmount(metrics.companySum)}</strong>
            <span className="rubro-cross-metric-sub">
              {metrics.companyCount} mov. · {companyGroups.length} grupo
              {companyGroups.length === 1 ? '' : 's'}
            </span>
          </div>
        ) : null}
        {bothSides ? (
          <div className="rubro-cross-metric rubro-cross-metric--delta">
            <span className="rubro-cross-metric-label">Δ (empresa − banco)</span>
            <strong>{formatAmount(metrics.delta)}</strong>
            {metrics.squared ? (
              <span className="compare-badge compare-badge--estado rubro-badge--ok">Cuadrado</span>
            ) : (
              <span className="compare-badge compare-badge--estado rubro-badge--warn">Revisar</span>
            )}
          </div>
        ) : null}
      </div>

      {!classificationReadOnly && classifyCount > 0 ? (
        <div className="rubro-cross-classify-bar">
          <p className="rubro-cross-classify-caption" id="rubro-cross-classify-caption">
            Clasificación (misma en banco y empresa)
          </p>
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
              aria-describedby="rubro-cross-classify-caption"
              onClick={() => void applyBulkClassification()}
            >
              {classifyLoading
                ? 'Aplicando…'
                : `Aplicar a ${classifyCount} mov.${classifyCount === 1 ? '' : 's'}`}
            </button>
          </div>
          {classifyError ? <p className="msg err rubro-cross-classify-err">{classifyError}</p> : null}
        </div>
      ) : null}

      <div className={`rubro-detail-grid ${bothSides ? '' : 'rubro-detail-grid--single'}`}>
        {hasBank ? (
          <MovementMiniTable
            title={`Detalle banco (${bankGroups.length} grupo${bankGroups.length === 1 ? '' : 's'})`}
            items={bankItems}
            linkMode={linkMode}
            selectedTxId={selectedBankId}
            onToggleTxId={linkMode ? toggleBank : undefined}
            onViewPair={onViewPair}
          />
        ) : null}
        {hasCompany ? (
          <MovementMiniTable
            title={`Detalle empresa (${companyGroups.length} grupo${companyGroups.length === 1 ? '' : 's'})`}
            items={companyItems}
            linkMode={linkMode}
            selectedTxId={selectedCompanyId}
            onToggleTxId={linkMode ? toggleCompany : undefined}
            onViewPair={onViewPair}
          />
        ) : null}
      </div>

      {linkPrompt && onManualPair ? (
        <RubroLinkConfirmModal
          prompt={linkPrompt}
          loading={linkLoading}
          error={linkError}
          onCancel={dismissLinkPrompt}
          onConfirm={() => onManualPair(linkPrompt.bankId, linkPrompt.companyId)}
        />
      ) : null}
    </section>
  )
}

function RubroExpandedGroupDetail({
  group,
  reconcileLocked,
  manualLinkLoading,
  manualLinkError,
  onManualPair,
  onViewPair,
}: {
  group: RubroGroupRow
  reconcileLocked: boolean
  manualLinkLoading: boolean
  manualLinkError: string | null
  onManualPair?: (bankId: number, companyId: number) => void
  onViewPair?: (pairId: number) => void
}) {
  const linkableBank = useMemo(
    () => group.bankItems.filter((i) => i.pairId == null),
    [group.bankItems],
  )
  const linkableCompany = useMemo(
    () => group.companyItems.filter((i) => i.pairId == null),
    [group.companyItems],
  )

  const linkMode =
    !reconcileLocked &&
    onManualPair != null &&
    linkableBank.length > 0 &&
    linkableCompany.length > 0

  const linkPickerResetKey = useMemo(
    () =>
      [group.groupKey, ...linkableBank.map((i) => i.m.id), ...linkableCompany.map((i) => i.m.id)].join(
        '|',
      ),
    [group.groupKey, linkableBank, linkableCompany],
  )

  const {
    selectedBankId,
    selectedCompanyId,
    toggleBank,
    toggleCompany,
    prompt: linkPrompt,
    dismissPrompt: dismissLinkPrompt,
  } = usePendingPairLinkPicker(linkMode, linkableBank, linkableCompany, linkPickerResetKey)

  return (
    <div className="rubro-expanded-group-detail">
      {linkMode ? (
        <p className="rubro-detail-link-hint rubro-expanded-link-hint">
          Tocá <strong>pend.</strong> en banco y empresa; al elegir el segundo se abre la confirmación
          para vincular.
        </p>
      ) : null}
      <div className="rubro-detail-grid">
        <MovementMiniTable
          title="Movimientos banco"
          items={group.bankItems}
          linkMode={linkMode}
          selectedTxId={selectedBankId}
          onToggleTxId={linkMode ? toggleBank : undefined}
          onViewPair={onViewPair}
        />
        <MovementMiniTable
          title="Movimientos empresa"
          items={group.companyItems}
          linkMode={linkMode}
          selectedTxId={selectedCompanyId}
          onToggleTxId={linkMode ? toggleCompany : undefined}
          onViewPair={onViewPair}
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
  onScrollToComparisonRow,
  onUnlinkPair,
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
  onScrollToComparisonRow?: (rowKey: string) => void
  onUnlinkPair?: (
    pairId: number,
    matchSource: 'MANUAL' | 'AUTO',
  ) => void | boolean | Promise<void | boolean>
}) {
  const [groupMode, setGroupMode] = useState<RubroGroupMode>('specification')
  const [viewPairId, setViewPairId] = useState<number | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [hideEmpty, setHideEmpty] = useState(false)
  const [onlyMismatch, setOnlyMismatch] = useState(false)
  const [pickBankKeys, setPickBankKeys] = useState<Set<string>>(() => new Set())
  const [pickCompanyKeys, setPickCompanyKeys] = useState<Set<string>>(() => new Set())
  const [classifyLoading, setClassifyLoading] = useState(false)
  const [classifyError, setClassifyError] = useState<string | null>(null)

  const groups = useMemo(
    () => buildRubroGroups(detail, sessionAmountTolerance, groupMode),
    [detail, sessionAmountTolerance, groupMode],
  )

  const groupsByKey = useMemo(() => new Map(groups.map((g) => [g.groupKey, g])), [groups])

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

  const summary = useMemo(() => rubroGroupsSummary(groups), [groups])

  const pairPreview = useMemo(
    () => (viewPairId != null ? resolvePairPreview(detail, viewPairId) : null),
    [detail, viewPairId],
  )

  function clearCrossPick() {
    setPickBankKeys(new Set())
    setPickCompanyKeys(new Set())
    setClassifyError(null)
  }

  function toggleBankKey(groupKey: string) {
    setPickBankKeys((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  function toggleCompanyKey(groupKey: string) {
    setPickCompanyKeys((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
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
      <div className="rubro-view-mode" role="tablist" aria-label="Criterio de agrupación">
        <button
          type="button"
          role="tab"
          aria-selected={groupMode === 'specification'}
          className={groupMode === 'specification' ? 'session-pill active' : 'session-pill'}
          onClick={() => setGroupMode('specification')}
        >
          Mismo detalle en registro
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={groupMode === 'classification'}
          className={groupMode === 'classification' ? 'session-pill active' : 'session-pill'}
          onClick={() => setGroupMode('classification')}
        >
          Por clasificación (rubro)
        </button>
      </div>

      {pickedBankGroups.length > 0 || pickedCompanyGroups.length > 0 ? (
        <CrossGroupComparePanel
          bankGroups={pickedBankGroups}
          companyGroups={pickedCompanyGroups}
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
          onViewPair={handleViewPair}
          onBulkClassify={handleBulkClassify}
          onRemoveBankKey={toggleBankKey}
          onRemoveCompanyKey={toggleCompanyKey}
        />
      ) : null}

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

      <div className="table-wrap rubro-table-wrap table-wrap--scrollY">
        <table className="data-table rubro-summary-table">
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
              <th>Estado</th>
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
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <Fragment key={g.groupKey}>
                    <tr className={rowClassName}>
                      <td>
                        <button
                          type="button"
                          className="rubro-expand-btn"
                          aria-expanded={open}
                          aria-label={
                            open ? `Ocultar detalle de ${g.rubro}` : `Ver movimientos de ${g.rubro}`
                          }
                          onClick={() => setExpandedKey(open ? null : g.groupKey)}
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
                      <td>
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
                    {open ? (
                      <tr className="rubro-detail-row">
                        <td colSpan={9}>
                          <RubroExpandedGroupDetail
                            group={g}
                            reconcileLocked={reconcileLocked}
                            manualLinkLoading={manualLinkLoading}
                            manualLinkError={manualLinkError}
                            onManualPair={onManualPair}
                            onViewPair={handleViewPair}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

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
