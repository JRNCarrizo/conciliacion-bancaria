import { Fragment, useEffect, useMemo, useState } from 'react'
import type { SessionDetail } from './types'
import {
  buildRubroGroups,
  crossGroupComparison,
  rubroGroupsSummary,
  SIN_DETALLE_LABEL,
  SIN_RUBRO_LABEL,
  type RubroGroupMode,
  type RubroGroupRow,
} from './utils/rubroGroups'
import { PairPreviewModal } from './PairPreviewModal'
import { movementSummaryLine } from './utils/counterpartUtils'
import { resolvePairPreview } from './utils/pairLookup'
import { formatAmount, formatDisplayDate, formatToleranceInputDisplay } from './utils/format'

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
                  <td>
                    {m.id}
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
                    ) : linkMode ? (
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
                    ) : null}
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
  bankGroup,
  companyGroup,
  sessionAmountTolerance,
  tolLabel,
  reconcileLocked,
  linkLoading,
  linkError,
  onClear,
  onManualPair,
  onViewPair,
}: {
  bankGroup?: RubroGroupRow
  companyGroup?: RubroGroupRow
  sessionAmountTolerance: number | null | undefined
  tolLabel: string
  reconcileLocked: boolean
  linkLoading: boolean
  linkError: string | null
  onClear: () => void
  onManualPair?: (bankId: number, companyId: number) => void
  onViewPair?: (pairId: number) => void
}) {
  const hasBank = bankGroup != null
  const hasCompany = companyGroup != null
  const bothSides = hasBank && hasCompany

  const comparison = useMemo(() => {
    if (!bothSides || !bankGroup || !companyGroup) return null
    return crossGroupComparison(bankGroup, companyGroup, sessionAmountTolerance)
  }, [bothSides, bankGroup, companyGroup, sessionAmountTolerance])

  const linkableBank = useMemo(
    () => (bankGroup ? bankGroup.bankItems.filter((i) => i.pairId == null) : []),
    [bankGroup],
  )
  const linkableCompany = useMemo(
    () => (companyGroup ? companyGroup.companyItems.filter((i) => i.pairId == null) : []),
    [companyGroup],
  )

  const [selectedBankId, setSelectedBankId] = useState<number | null>(null)
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)

  useEffect(() => {
    setSelectedBankId(linkableBank.length === 1 ? linkableBank[0].m.id : null)
  }, [bankGroup?.groupKey, linkableBank])

  useEffect(() => {
    setSelectedCompanyId(linkableCompany.length === 1 ? linkableCompany[0].m.id : null)
  }, [companyGroup?.groupKey, linkableCompany])

  const canLink =
    !reconcileLocked &&
    onManualPair != null &&
    selectedBankId != null &&
    selectedCompanyId != null &&
    linkableBank.some((i) => i.m.id === selectedBankId) &&
    linkableCompany.some((i) => i.m.id === selectedCompanyId)

  const linkMode = bothSides && !reconcileLocked && onManualPair != null

  const panelTitle = bothSides
    ? 'Comparación cruzada (banco ↔ empresa)'
    : hasBank
      ? 'Vista previa — grupo banco'
      : 'Vista previa — grupo empresa'

  return (
    <section className="rubro-cross-compare" aria-label="Comparación entre grupos elegidos">
      <header className="rubro-cross-compare-head">
        <h4>{panelTitle}</h4>
        <button type="button" className="btn-secondary rubro-cross-clear" onClick={onClear}>
          Quitar selección
        </button>
      </header>

      {!bothSides ? (
        <p className="rubro-cross-pick-hint rubro-cross-preview-hint">
          {hasBank
            ? 'Elegí también un grupo de empresa arriba para ver el Δ entre sumas y vincular pendientes.'
            : 'Elegí también un grupo de banco arriba para ver el Δ entre sumas y vincular pendientes.'}
        </p>
      ) : null}

      <div className="rubro-cross-metrics">
        {hasBank && bankGroup ? (
          <div className="rubro-cross-metric">
            <span className="rubro-cross-metric-label">Σ Banco</span>
            <strong>{formatAmount(bankGroup.bankSum)}</strong>
            <span className="rubro-cross-metric-sub">
              {bankGroup.bankCount} mov. · {bankGroup.rubro}
            </span>
          </div>
        ) : null}
        {hasCompany && companyGroup ? (
          <div className="rubro-cross-metric">
            <span className="rubro-cross-metric-label">Σ Empresa</span>
            <strong>{formatAmount(companyGroup.companySum)}</strong>
            <span className="rubro-cross-metric-sub">
              {companyGroup.companyCount} mov. · {companyGroup.rubro}
            </span>
          </div>
        ) : null}
        {comparison ? (
          <div className="rubro-cross-metric rubro-cross-metric--delta">
            <span className="rubro-cross-metric-label">Δ (empresa − banco)</span>
            <strong>{formatAmount(comparison.delta)}</strong>
            {comparison.squared ? (
              <span className="compare-badge compare-badge--estado rubro-badge--ok">Cuadrado</span>
            ) : (
              <span className="compare-badge compare-badge--estado rubro-badge--warn">Revisar</span>
            )}
          </div>
        ) : null}
      </div>

      <div className={`rubro-detail-grid ${bothSides ? '' : 'rubro-detail-grid--single'}`}>
        {hasBank && bankGroup ? (
          <MovementMiniTable
            title="Detalle banco (grupo elegido)"
            items={bankGroup.bankItems}
            linkMode={linkMode}
            selectedTxId={selectedBankId}
            onToggleTxId={
              linkMode ? (id) => setSelectedBankId((prev) => (prev === id ? null : id)) : undefined
            }
            onViewPair={onViewPair}
          />
        ) : null}
        {hasCompany && companyGroup ? (
          <MovementMiniTable
            title="Detalle empresa (grupo elegido)"
            items={companyGroup.companyItems}
            linkMode={linkMode}
            selectedTxId={selectedCompanyId}
            onToggleTxId={
              linkMode
                ? (id) => setSelectedCompanyId((prev) => (prev === id ? null : id))
                : undefined
            }
            onViewPair={onViewPair}
          />
        ) : null}
      </div>

      {linkMode ? (
        <div className="rubro-cross-link-bar">
          <p className="rubro-cross-link-summary">
            {selectedBankId != null && selectedCompanyId != null ? (
              <>
                Vincular banco <strong>ID {selectedBankId}</strong> con empresa{' '}
                <strong>ID {selectedCompanyId}</strong>
                {linkableBank.length > 1 || linkableCompany.length > 1
                  ? ' (elegiste un par entre los pendientes del grupo)'
                  : null}
              </>
            ) : (
              <>Elegí un movimiento pendiente de cada lado en las tablas de arriba.</>
            )}
          </p>
          <button
            type="button"
            className="btn-import rubro-cross-link-btn"
            disabled={!canLink || linkLoading}
            onClick={() => {
              if (selectedBankId != null && selectedCompanyId != null) {
                onManualPair!(selectedBankId, selectedCompanyId)
              }
            }}
          >
            {linkLoading ? 'Vinculando…' : 'Vincular selección'}
          </button>
          {linkError ? <p className="msg err rubro-cross-link-err">{linkError}</p> : null}
        </div>
      ) : null}

      <p className="hint rubro-cross-foot">
        Cuadrado si |Δ| ≤ {tolLabel}. El vínculo manual es entre dos movimientos pendientes (uno de cada lado);
        los que ya tienen «par» no se pueden elegir.
      </p>
    </section>
  )
}

export function RubroGroupsView({
  detail,
  sessionAmountTolerance,
  reconcileLocked,
  manualLinkLoading,
  manualLinkError,
  onManualPair,
  onScrollToComparisonRow,
}: {
  detail: SessionDetail
  sessionAmountTolerance: number | null | undefined
  reconcileLocked: boolean
  manualLinkLoading: boolean
  manualLinkError: string | null
  onManualPair?: (bankId: number, companyId: number) => void
  onScrollToComparisonRow?: (rowKey: string) => void
}) {
  const [groupMode, setGroupMode] = useState<RubroGroupMode>('specification')
  const [viewPairId, setViewPairId] = useState<number | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [hideEmpty, setHideEmpty] = useState(false)
  const [onlyMismatch, setOnlyMismatch] = useState(false)
  const [pickBankKey, setPickBankKey] = useState<string>('')
  const [pickCompanyKey, setPickCompanyKey] = useState<string>('')

  const groups = useMemo(
    () => buildRubroGroups(detail, sessionAmountTolerance, groupMode),
    [detail, sessionAmountTolerance, groupMode],
  )

  const groupsByKey = useMemo(() => new Map(groups.map((g) => [g.groupKey, g])), [groups])

  const bankGroupOptions = useMemo(
    () => groups.filter((g) => g.bankCount > 0),
    [groups],
  )
  const companyGroupOptions = useMemo(
    () => groups.filter((g) => g.companyCount > 0),
    [groups],
  )

  const pickedBank = pickBankKey ? groupsByKey.get(pickBankKey) : undefined
  const pickedCompany = pickCompanyKey ? groupsByKey.get(pickCompanyKey) : undefined

  useEffect(() => {
    setExpandedKey(null)
    setPickBankKey('')
    setPickCompanyKey('')
  }, [groupMode])

  useEffect(() => {
    if (pickBankKey && !groupsByKey.has(pickBankKey)) setPickBankKey('')
  }, [pickBankKey, groupsByKey])

  useEffect(() => {
    if (pickCompanyKey && !groupsByKey.has(pickCompanyKey)) setPickCompanyKey('')
  }, [pickCompanyKey, groupsByKey])

  const tolLabel =
    sessionAmountTolerance !== undefined && sessionAmountTolerance !== null
      ? formatToleranceInputDisplay(Number(sessionAmountTolerance))
      : '0,02'

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
    setPickBankKey('')
    setPickCompanyKey('')
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

      <p className="hint rubro-view-mode-hint">
        {groupMode === 'specification' ? (
          <>
            Agrupa automáticamente cuando la <strong>descripción</strong> (o la referencia si no hay
            descripción) es la misma en extracto y libro. Si los textos no coinciden, elegí un grupo de
            banco y otro de empresa con <strong>Comparar cruzado</strong> (abajo en la tabla o en el
            panel).
          </>
        ) : (
          <>
            Agrupa por <strong>Clasif.</strong> Cuando el rubro no alcanza, compará libremente un grupo
            banco con un grupo empresa distintos.
          </>
        )}
      </p>

      <div className="rubro-cross-pick" role="group" aria-label="Elegir grupos para comparar">
        <div className="rubro-cross-pick-header">
          <div className="rubro-cross-pick-heading">
            <span className="rubro-cross-pick-kicker">Comparación manual</span>
            <span className="rubro-cross-pick-title">Comparar cruzado</span>
          </div>
          {(pickBankKey || pickCompanyKey) && (
            <button
              type="button"
              className="btn-secondary rubro-cross-pick-clear"
              onClick={clearCrossPick}
            >
              Limpiar selección
            </button>
          )}
        </div>
        <div className="rubro-cross-pick-grid">
          <label className="rubro-cross-pick-field rubro-cross-pick-field--bank">
            <span className="rubro-cross-pick-label">
              <span className="rubro-cross-pick-side" aria-hidden>
                Banco
              </span>
              Grupo del extracto
            </span>
            <span className="rubro-cross-pick-select-wrap">
              <select
                className={
                  pickBankKey
                    ? 'rubro-cross-pick-select rubro-cross-pick-select--filled'
                    : 'rubro-cross-pick-select'
                }
                value={pickBankKey}
                onChange={(ev) => setPickBankKey(ev.target.value)}
                aria-label="Grupo banco a comparar"
              >
                <option value="">Elegí un grupo de banco…</option>
                {bankGroupOptions.map((g) => (
                  <option key={g.groupKey} value={g.groupKey}>
                    {g.rubro} · {g.bankCount} mov. · Σ {formatAmount(g.bankSum)}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <span className="rubro-cross-pick-vs" aria-hidden title="Comparar con">
            ↔
          </span>
          <label className="rubro-cross-pick-field rubro-cross-pick-field--company">
            <span className="rubro-cross-pick-label">
              <span className="rubro-cross-pick-side" aria-hidden>
                Empresa
              </span>
              Grupo del libro
            </span>
            <span className="rubro-cross-pick-select-wrap">
              <select
                className={
                  pickCompanyKey
                    ? 'rubro-cross-pick-select rubro-cross-pick-select--filled'
                    : 'rubro-cross-pick-select'
                }
                value={pickCompanyKey}
                onChange={(ev) => setPickCompanyKey(ev.target.value)}
                aria-label="Grupo empresa a comparar"
              >
                <option value="">Elegí un grupo de empresa…</option>
                {companyGroupOptions.map((g) => (
                  <option key={g.groupKey} value={g.groupKey}>
                    {g.rubro} · {g.companyCount} mov. · Σ {formatAmount(g.companySum)}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>
      </div>

      {pickedBank || pickedCompany ? (
        <CrossGroupComparePanel
          bankGroup={pickedBank}
          companyGroup={pickedCompany}
          sessionAmountTolerance={sessionAmountTolerance}
          tolLabel={tolLabel}
          reconcileLocked={reconcileLocked}
          linkLoading={manualLinkLoading}
          linkError={manualLinkError}
          onClear={clearCrossPick}
          onManualPair={onManualPair}
          onViewPair={handleViewPair}
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
                const bankPicked = pickBankKey === g.groupKey
                const companyPicked = pickCompanyKey === g.groupKey
                return (
                  <Fragment key={g.groupKey}>
                    <tr
                      className={`rubro-summary-row ${g.isSinRubro ? 'rubro-summary-row--sin' : ''} ${open ? 'rubro-summary-row--open' : ''} ${bankPicked || companyPicked ? 'rubro-summary-row--picked' : ''}`}
                    >
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
                              onClick={() => setPickBankKey(g.groupKey)}
                              title="Usar este grupo como lado banco en la comparación cruzada"
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
                              onClick={() => setPickCompanyKey(g.groupKey)}
                              title="Usar este grupo como lado empresa en la comparación cruzada"
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
                          <div className="rubro-detail-grid">
                            <MovementMiniTable
                              title="Movimientos banco"
                              items={g.bankItems}
                              onViewPair={handleViewPair}
                            />
                            <MovementMiniTable
                              title="Movimientos empresa"
                              items={g.companyItems}
                              onViewPair={handleViewPair}
                            />
                          </div>
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

      <p className="hint rubro-view-foot">
        Δ en la tabla = mismo grupo (misma fila). En movimientos ya emparejados, tocá <strong>par</strong>{' '}
        para ver el otro lado. Comparación cruzada: elegís grupos distintos y podés vincular pendientes.
      </p>

      {pairPreview ? (
        <PairPreviewModal
          data={pairPreview}
          onClose={() => setViewPairId(null)}
          onScrollToRow={onScrollToComparisonRow}
        />
      ) : null}
    </div>
  )
}
