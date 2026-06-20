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
      className={
        expanded
          ? 'session-deferred-item session-deferred-item--open'
          : 'session-deferred-item session-deferred-item--compact'
      }
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

function DeferredPanelDisclosure({
  id,
  title,
  count,
  badgeActive,
  meta,
  hint,
  children,
}: {
  id: string
  title: string
  count: number
  badgeActive?: boolean
  meta?: string | null
  hint?: string
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const badgeLabel = count === 1 ? '1 mov.' : `${count} mov.`

  return (
    <div
      className={
        expanded
          ? 'session-deferred-subpanel conc-panel-disclosure conc-panel-disclosure--open'
          : 'session-deferred-subpanel conc-panel-disclosure conc-panel-disclosure--collapsed'
      }
    >
      <button
        type="button"
        id={id}
        aria-expanded={expanded}
        className="conc-panel-disclosure-summary session-deferred-subpanel-summary"
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="conc-panel-disclosure-title">{title}</span>
        <span
          className={
            badgeActive
              ? 'conc-panel-disclosure-badge conc-panel-disclosure-badge--active'
              : 'conc-panel-disclosure-badge conc-panel-disclosure-badge--neutral'
          }
        >
          {badgeLabel}
        </span>
        {!expanded && meta ? <span className="conc-panel-disclosure-meta">{meta}</span> : null}
      </button>
      {expanded ? (
        <div className="conc-panel-disclosure-body session-deferred-subpanel-body">
          {hint ? <p className="session-deferred-panel-lead">{hint}</p> : null}
          {children}
        </div>
      ) : null}
    </div>
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
    return parts.length > 0 ? parts.join(' · ') : 'Expandí para ver el detalle'
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

  if (totalMovements <= 0) {
    return null
  }

  const hasPendingWork = pendingIncorporateCount > 0 || sentPendingFromHere.length > 0

  const sectionBadge =
    totalMovements === 1 ? '1 movimiento' : `${totalMovements} movimientos`

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

  return (
    <section
      className={
        sectionExpanded
          ? 'session-deferred-disclosure conc-panel-disclosure conc-panel-disclosure--open'
          : 'session-deferred-disclosure conc-panel-disclosure conc-panel-disclosure--collapsed'
      }
      aria-labelledby="session-deferred-title"
    >
      <button
        type="button"
        id="session-deferred-title"
        aria-expanded={sectionExpanded}
        className="conc-panel-disclosure-summary"
        onClick={() => setSectionExpanded((open) => !open)}
      >
        <span className="conc-panel-disclosure-title">Diferidos entre conciliaciones</span>
        <span
          className={
            hasPendingWork
              ? 'conc-panel-disclosure-badge conc-panel-disclosure-badge--active'
              : 'conc-panel-disclosure-badge conc-panel-disclosure-badge--neutral'
          }
        >
          {sectionBadge}
        </span>
        {!sectionExpanded ? (
          <span className="conc-panel-disclosure-meta">{sectionMeta}</span>
        ) : null}
      </button>

      {sectionExpanded ? (
        <div className="conc-panel-disclosure-body session-deferred-disclosure-body">
          {hasIncorporatePanel ? (
            <DeferredPanelDisclosure
              id="session-deferred-incorporate"
              title="Para incorporar"
              count={pendingIncorporateCount}
              badgeActive={pendingIncorporateCount > 0}
              meta={incorporatePeek}
              hint="Movimientos guardados en sesiones anteriores. Seleccioná cuáles agregar a esta sesión."
            >
              {availableLoading ? <p className="subtle">Cargando diferidos…</p> : null}
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
                      className="btn-import"
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
            </DeferredPanelDisclosure>
          ) : null}

          {deferredIntoSession.length > 0 ? (
            <DeferredPanelDisclosure
              id="session-deferred-into"
              title="Incorporados en esta sesión"
              count={deferredIntoSession.length}
              meta={intoPeek}
              hint="Traídos desde diferidos anteriores. En la tabla aparecen con Dif←; filtrá con «Incorporado dif.»."
            >
              <ul className="session-deferred-list">
                {deferredIntoSession.map((d) => (
                  <DeferredRow key={d.id} d={d} readOnly={readOnly} />
                ))}
              </ul>
            </DeferredPanelDisclosure>
          ) : null}

          {sentPendingFromHere.length > 0 ? (
            <DeferredPanelDisclosure
              id="session-deferred-sent"
              title="Enviados a otra conciliación"
              count={sentPendingFromHere.length}
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
            </DeferredPanelDisclosure>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
