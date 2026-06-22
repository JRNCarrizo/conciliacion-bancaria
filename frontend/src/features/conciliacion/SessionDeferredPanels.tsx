import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  fetchAvailableDeferred,
  incorporateDeferred,
  restoreDeferred,
} from './api/deferred'
import type { DeferredMovement } from './types'
import { formatAmount, formatDisplayDate } from './utils/format'

function movementSummary(d: DeferredMovement): string {
  const ref = [d.reference, d.description].filter(Boolean).join(' · ')
  return ref || '—'
}

function sideLabel(side: DeferredMovement['side']): string {
  return side === 'bank' ? 'Banco' : 'Empresa'
}

function deferredPeekMeta(d: DeferredMovement): string {
  const parts = [d.sourceSessionLabel]
  if (d.sourceSideFileName) parts.push(d.sourceSideFileName)
  if (d.status === 'CONSUMED' && d.consumedSessionLabel) {
    parts.push(`→ ${d.consumedSessionLabel}`)
  }
  return parts.join(' · ')
}

function DeferredInboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 8.5h18L14 3.5H10L3 8.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 13h4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function DeferredRow({
  d,
  selectable,
  selected,
  onToggle,
  onRestore,
  restoreLoading,
  readOnly,
}: {
  d: DeferredMovement
  selectable?: boolean
  selected?: boolean
  onToggle?: () => void
  onRestore?: () => void
  restoreLoading?: boolean
  readOnly?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const summary = movementSummary(d)
  const canExpand = summary !== '—' || deferredPeekMeta(d).length > 0 || Boolean(d.note)

  return (
    <li
      className={[
        'session-deferred-item',
        expanded ? 'session-deferred-item--open' : 'session-deferred-item--compact',
        selectable && selected ? 'session-deferred-item--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {selectable ? (
        <label className="session-deferred-item-check" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggle} disabled={readOnly} />
        </label>
      ) : null}
      <button
        type="button"
        className="session-deferred-item-toggle"
        disabled={!canExpand}
        aria-expanded={canExpand ? expanded : undefined}
        onClick={() => {
          if (canExpand) setExpanded((open) => !open)
        }}
      >
        <span className="session-deferred-item-head">
          <span
            className={
              d.side === 'bank'
                ? 'session-deferred-side session-deferred-side--bank'
                : 'session-deferred-side session-deferred-side--company'
            }
          >
            {sideLabel(d.side)}
          </span>
          <span className="session-deferred-item-date">{formatDisplayDate(d.txDate)}</span>
          <span className="session-deferred-item-amount">{formatAmount(d.amount)}</span>
          {d.status === 'CONSUMED' ? (
            <span className="session-deferred-status session-deferred-status--used">Incorporado</span>
          ) : (
            <span className="session-deferred-status session-deferred-status--avail">Disponible</span>
          )}
          {!expanded && summary !== '—' ? (
            <span className="session-deferred-item-peek">{summary}</span>
          ) : null}
        </span>
        {canExpand ? (
          <span className="session-deferred-item-chevron" aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className="session-deferred-item-detail">
          {summary !== '—' ? <p className="session-deferred-item-desc">{summary}</p> : null}
          <p className="session-deferred-item-meta">
            Origen: {d.sourceSessionLabel}
            {d.sourceSideFileName ? (
              <>
                {' '}
                · {sideLabel(d.side)}: {d.sourceSideFileName}
              </>
            ) : null}
            {d.status === 'CONSUMED' && d.consumedSessionLabel ? (
              <> · Incorporado en: {d.consumedSessionLabel}</>
            ) : null}
            {d.note ? <> · {d.note}</> : null}
          </p>
        </div>
      ) : null}
      {onRestore && d.status === 'AVAILABLE' ? (
        <button
          type="button"
          className="btn-secondary session-deferred-restore-btn"
          disabled={readOnly || restoreLoading}
          onClick={onRestore}
          title="Volver a pendientes de la sesión origen"
        >
          {restoreLoading ? '…' : 'Restaurar'}
        </button>
      ) : null}
    </li>
  )
}

function DeferredPanelCard({
  id,
  title,
  count,
  tone,
  badgeActive,
  meta,
  hint,
  children,
}: {
  id: string
  title: string
  count: number
  tone: 'pending' | 'into' | 'sent'
  badgeActive?: boolean
  meta?: string | null
  hint?: string
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const badgeLabel = count === 1 ? '1 mov.' : `${count} mov.`

  return (
    <article
      className={[
        'session-deferred-card',
        `session-deferred-card--${tone}`,
        expanded ? 'session-deferred-card--open' : 'session-deferred-card--collapsed',
      ].join(' ')}
    >
      <button
        type="button"
        id={id}
        aria-expanded={expanded}
        className="session-deferred-card-summary"
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="session-deferred-card-icon" aria-hidden />
        <span className="session-deferred-card-copy">
          <span className="session-deferred-card-title">{title}</span>
          {!expanded && meta ? <span className="session-deferred-card-meta">{meta}</span> : null}
        </span>
        <span
          className={[
            'session-deferred-card-badge',
            badgeActive ? 'session-deferred-card-badge--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {badgeLabel}
        </span>
        <span className="session-deferred-card-chevron" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded ? (
        <div className="session-deferred-card-body">
          {hint ? <p className="session-deferred-panel-lead">{hint}</p> : null}
          {children}
        </div>
      ) : null}
    </article>
  )
}

export function SessionDeferredPanels({
  sessionId,
  deferredFromSession,
  deferredIntoSession,
  availableDeferredCount,
  readOnly,
  onChanged,
}: {
  sessionId: number
  deferredFromSession: DeferredMovement[]
  deferredIntoSession: DeferredMovement[]
  availableDeferredCount: number
  readOnly: boolean
  onChanged: () => void | Promise<void>
}) {
  const [sectionExpanded, setSectionExpanded] = useState(false)
  const [available, setAvailable] = useState<DeferredMovement[]>([])
  const [availableLoading, setAvailableLoading] = useState(false)
  const [availableError, setAvailableError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [incorporateLoading, setIncorporateLoading] = useState(false)
  const [incorporateMsg, setIncorporateMsg] = useState<string | null>(null)
  const [restoreId, setRestoreId] = useState<number | null>(null)

  const loadAvailable = useCallback(async () => {
    setAvailableLoading(true)
    setAvailableError(null)
    try {
      const list = await fetchAvailableDeferred(sessionId)
      setAvailable(list)
      setSelectedIds(new Set(list.map((d) => d.id)))
    } catch (e) {
      setAvailableError(e instanceof Error ? e.message : 'No se pudieron cargar los diferidos.')
      setAvailable([])
      setSelectedIds(new Set())
    } finally {
      setAvailableLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void loadAvailable()
  }, [loadAvailable, sessionId, availableDeferredCount])

  useEffect(() => {
    setSectionExpanded(false)
    setIncorporateMsg(null)
  }, [sessionId])

  const sentPendingFromHere = useMemo(
    () =>
      deferredFromSession.filter(
        (d) => d.sourceSessionId === sessionId && d.status === 'AVAILABLE',
      ),
    [deferredFromSession, sessionId],
  )

  const pendingIncorporateCount =
    !availableLoading || available.length > 0 ? available.length : availableDeferredCount

  const hasIncorporatePanel =
    pendingIncorporateCount > 0 || (availableLoading && availableDeferredCount > 0)

  const totalMovements =
    pendingIncorporateCount + deferredIntoSession.length + sentPendingFromHere.length

  const hasPendingWork = pendingIncorporateCount > 0 || sentPendingFromHere.length > 0
  const isEmpty = totalMovements <= 0

  const sectionMeta = useMemo(() => {
    const parts: string[] = []
    if (pendingIncorporateCount > 0) {
      parts.push(
        pendingIncorporateCount === 1
          ? '1 para incorporar'
          : `${pendingIncorporateCount} para incorporar`,
      )
    }
    if (deferredIntoSession.length > 0) {
      parts.push(
        deferredIntoSession.length === 1
          ? '1 incorporado aquí'
          : `${deferredIntoSession.length} incorporados aquí`,
      )
    }
    if (sentPendingFromHere.length > 0) {
      parts.push(
        sentPendingFromHere.length === 1
          ? '1 enviado pendiente'
          : `${sentPendingFromHere.length} enviados pendientes`,
      )
    }
    return parts.length > 0 ? parts.join(' · ') : null
  }, [pendingIncorporateCount, deferredIntoSession.length, sentPendingFromHere.length])

  async function handleIncorporate() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setIncorporateLoading(true)
    setIncorporateMsg(null)
    try {
      const result = await incorporateDeferred(sessionId, ids)
      const warn = result.warnings.length > 0 ? ` ${result.warnings.join(' ')}` : ''
      setIncorporateMsg(
        result.addedCount > 0
          ? `Se incorporaron ${result.addedCount} movimiento(s).${warn}`
          : `No se incorporó ninguno.${warn}`,
      )
      const incorporatedIds = new Set(result.incorporated.map((d) => d.id))
      setAvailable((prev) => prev.filter((d) => !incorporatedIds.has(d.id)))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of incorporatedIds) next.delete(id)
        return next
      })
      await onChanged()
      await loadAvailable()
    } catch (e) {
      setIncorporateMsg(e instanceof Error ? e.message : 'Error al incorporar.')
    } finally {
      setIncorporateLoading(false)
    }
  }

  async function handleRestore(deferredId: number) {
    if (!window.confirm('¿Restaurar este diferido como pendiente en la sesión origen?')) return
    setRestoreId(deferredId)
    try {
      await restoreDeferred(deferredId)
      await onChanged()
      await loadAvailable()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo restaurar.')
    } finally {
      setRestoreId(null)
    }
  }

  const incorporatePeek =
    available.length > 0
      ? available
          .slice(0, 2)
          .map((d) => `${sideLabel(d.side)} ${formatAmount(d.amount)}`)
          .join(' · ')
      : availableLoading && availableDeferredCount > 0
        ? 'Cargando lista…'
        : null

  const intoPeek =
    deferredIntoSession.length > 0
      ? deferredIntoSession
          .slice(0, 2)
          .map((d) => `${d.sourceSessionLabel} · ${formatAmount(d.amount)}`)
          .join(' · ')
      : null

  const sentPeek =
    sentPendingFromHere.length > 0
      ? sentPendingFromHere
          .slice(0, 2)
          .map((d) => `${formatDisplayDate(d.txDate)} · ${formatAmount(d.amount)}`)
          .join(' · ')
      : null

  const emptyCollapsedHint = 'Usá Diferir en pendientes de la tabla'

  return (
    <section
      className={[
        'session-deferred-hub',
        isEmpty ? 'session-deferred-hub--empty' : '',
        sectionExpanded ? 'session-deferred-hub--open' : 'session-deferred-hub--collapsed',
        !isEmpty && hasPendingWork ? 'session-deferred-hub--attention' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby="session-deferred-title"
    >
      <button
        type="button"
        id="session-deferred-title"
        aria-expanded={sectionExpanded}
        className="session-deferred-hub-header"
        onClick={() => setSectionExpanded((open) => !open)}
      >
        <div className="session-deferred-hub-icon-wrap" aria-hidden>
          <DeferredInboxIcon className="session-deferred-hub-icon" />
        </div>
        <div className="session-deferred-hub-copy">
          <span className="session-deferred-hub-eyebrow">Bolsa de diferidos</span>
          <span className="session-deferred-hub-title">
            {isEmpty ? 'Movimientos para otra conciliación' : 'Diferidos entre conciliaciones'}
          </span>
          {!sectionExpanded ? (
            <span className="session-deferred-hub-lead">
              {isEmpty ? emptyCollapsedHint : sectionMeta ?? 'Expandí para ver el detalle'}
            </span>
          ) : null}
        </div>
        {!isEmpty ? (
          <div className="session-deferred-hub-stats" aria-label="Resumen">
            {hasIncorporatePanel ? (
              <span
                className={[
                  'session-deferred-stat-chip',
                  'session-deferred-stat-chip--pending',
                  pendingIncorporateCount > 0 ? 'session-deferred-stat-chip--hot' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="session-deferred-stat-chip-label">Para incorporar</span>
                <strong>{pendingIncorporateCount}</strong>
              </span>
            ) : null}
            {deferredIntoSession.length > 0 ? (
              <span className="session-deferred-stat-chip session-deferred-stat-chip--into">
                <span className="session-deferred-stat-chip-label">Incorporados</span>
                <strong>{deferredIntoSession.length}</strong>
              </span>
            ) : null}
            {sentPendingFromHere.length > 0 ? (
              <span className="session-deferred-stat-chip session-deferred-stat-chip--sent session-deferred-stat-chip--hot">
                <span className="session-deferred-stat-chip-label">Enviados</span>
                <strong>{sentPendingFromHere.length}</strong>
              </span>
            ) : null}
          </div>
        ) : null}
        <span className="session-deferred-hub-chevron" aria-hidden>
          {sectionExpanded ? '▾' : '▸'}
        </span>
      </button>

      {sectionExpanded ? (
        <div className="session-deferred-hub-body">
          {isEmpty ? (
            <p className="session-deferred-empty-lead">
              En la tabla de filtros, usá el botón <strong>Diferir</strong> en un pendiente para
              guardarlo y conciliarlo en otro período. Acá verás lo que envíes, lo que traigas de
              sesiones anteriores y lo incorporado en esta sesión.
            </p>
          ) : (
            <>
          {pendingIncorporateCount > 0 ? (
            <div className="session-deferred-alert" role="status">
              Tenés <strong>{pendingIncorporateCount}</strong> movimiento
              {pendingIncorporateCount === 1 ? '' : 's'} de sesiones anteriores listo
              {pendingIncorporateCount === 1 ? '' : 's'} para incorporar en esta conciliación.
            </div>
          ) : null}

          {hasIncorporatePanel ? (
            <DeferredPanelCard
              id="session-deferred-incorporate"
              title="Para incorporar"
              count={pendingIncorporateCount}
              tone="pending"
              badgeActive={pendingIncorporateCount > 0}
              meta={incorporatePeek}
              hint="Movimientos guardados en sesiones anteriores. Seleccioná cuáles agregar a esta sesión."
            >
              {availableLoading ? <p className="session-deferred-loading">Cargando diferidos…</p> : null}
              {availableError ? <p className="msg err">{availableError}</p> : null}
              {!availableLoading && available.length > 0 ? (
                <>
                  <ul className="session-deferred-list">
                    {available.map((d) => (
                      <DeferredRow
                        key={d.id}
                        d={d}
                        selectable
                        selected={selectedIds.has(d.id)}
                        readOnly={readOnly || incorporateLoading}
                        onToggle={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(d.id)) next.delete(d.id)
                            else next.add(d.id)
                            return next
                          })
                        }}
                      />
                    ))}
                  </ul>
                  <div className="session-deferred-actions">
                    <button
                      type="button"
                      className="btn-import session-deferred-incorporate-btn"
                      disabled={readOnly || incorporateLoading || selectedIds.size === 0}
                      onClick={() => void handleIncorporate()}
                    >
                      {incorporateLoading
                        ? 'Incorporando…'
                        : `Incorporar seleccionados (${selectedIds.size})`}
                    </button>
                  </div>
                </>
              ) : null}
              {incorporateMsg ? <p className="session-deferred-feedback">{incorporateMsg}</p> : null}
            </DeferredPanelCard>
          ) : null}

          {deferredIntoSession.length > 0 ? (
            <DeferredPanelCard
              id="session-deferred-into"
              title="Incorporados en esta sesión"
              count={deferredIntoSession.length}
              tone="into"
              meta={intoPeek}
              hint="Traídos desde diferidos anteriores. En la tabla aparecen con Dif←; filtrá con «Incorporado dif.»."
            >
              <ul className="session-deferred-list">
                {deferredIntoSession.map((d) => (
                  <DeferredRow key={d.id} d={d} readOnly={readOnly} />
                ))}
              </ul>
            </DeferredPanelCard>
          ) : null}

          {sentPendingFromHere.length > 0 ? (
            <DeferredPanelCard
              id="session-deferred-sent"
              title="Enviados a otra conciliación"
              count={sentPendingFromHere.length}
              tone="sent"
              badgeActive
              meta={sentPeek}
              hint="Diferidos desde esta sesión aún sin incorporar. Podés restaurarlos si la sesión sigue abierta."
            >
              <ul className="session-deferred-list">
                {sentPendingFromHere.map((d) => (
                  <DeferredRow
                    key={d.id}
                    d={d}
                    readOnly={readOnly}
                    restoreLoading={restoreId === d.id}
                    onRestore={
                      d.status === 'AVAILABLE' && !readOnly
                        ? () => void handleRestore(d.id)
                        : undefined
                    }
                  />
                ))}
              </ul>
            </DeferredPanelCard>
          ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
