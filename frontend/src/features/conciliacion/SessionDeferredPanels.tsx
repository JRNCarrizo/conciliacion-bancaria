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
  const summary = movementSummary(d)
  const metaRows: { label: string; value: string }[] = [
    { label: 'Origen', value: d.sourceSessionLabel },
  ]
  if (d.sourceSideFileName) {
    metaRows.push({ label: 'Archivo', value: d.sourceSideFileName })
  }
  if (d.status === 'CONSUMED' && d.consumedSessionLabel) {
    metaRows.push({ label: 'Incorporado en', value: d.consumedSessionLabel })
  }
  if (d.note?.trim()) {
    metaRows.push({ label: 'Nota', value: d.note.trim() })
  }

  return (
    <li
      className={[
        'session-deferred-item',
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
      <div className="session-deferred-item-body">
        <div className="session-deferred-item-top">
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
        </div>
        {summary !== '—' ? <p className="session-deferred-item-desc">{summary}</p> : null}
        {metaRows.length > 0 ? (
          <ul className="session-deferred-item-meta-list">
            {metaRows.map((row) => (
              <li key={row.label}>
                <span className="session-deferred-item-meta-label">{row.label}</span>
                <span className="session-deferred-item-meta-value">{row.value}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
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

function DeferredGroupIcon({ tone }: { tone: 'pending' | 'into' | 'sent' }) {
  if (tone === 'pending') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
        <path
          d="M12 3v12m0 0l4-4m-4 4l-4-4M4 19h16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (tone === 'into') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
        <path
          d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path
        d="M12 21V9m0 0l-4 4m4-4l4 4M4 5h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const DEFERRED_GROUP_META: Record<
  'pending' | 'into' | 'sent',
  { eyebrow: string; shortLabel: string }
> = {
  pending: { eyebrow: 'Entrada', shortLabel: 'Traídos de otra sesión' },
  into: { eyebrow: 'En esta sesión', shortLabel: 'Ya incorporados acá' },
  sent: { eyebrow: 'Salida', shortLabel: 'Enviados desde acá' },
}

function DeferredGroup({
  id,
  title,
  count,
  tone,
  hint,
  children,
}: {
  id: string
  title: string
  count: number
  tone: 'pending' | 'into' | 'sent'
  hint?: string
  children: ReactNode
}) {
  const countLabel = count === 1 ? '1 movimiento' : `${count} movimientos`
  const meta = DEFERRED_GROUP_META[tone]

  return (
    <section
      id={id}
      className={`session-deferred-group session-deferred-group--${tone}`}
      aria-labelledby={`${id}-title`}
    >
      <header className="session-deferred-group-head">
        <div className="session-deferred-group-head-main">
          <span className="session-deferred-group-icon" aria-hidden>
            <DeferredGroupIcon tone={tone} />
          </span>
          <div className="session-deferred-group-copy">
            <span className="session-deferred-group-eyebrow">{meta.eyebrow}</span>
            <h3 id={`${id}-title`} className="session-deferred-group-title">
              {title}
            </h3>
            {hint ? <p className="session-deferred-group-hint">{hint}</p> : null}
          </div>
          <span className="session-deferred-group-count" aria-label={countLabel}>
            {count}
          </span>
        </div>
        <p className="session-deferred-group-tagline">{meta.shortLabel}</p>
      </header>
      <div className="session-deferred-group-body">{children}</div>
    </section>
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

  const isEmpty = totalMovements <= 0

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

  if (isEmpty) {
    return (
      <p className="session-deferred-empty-lead">
        En la tabla de filtros, usá el botón <strong>Diferir</strong> en un pendiente para guardarlo
        y conciliarlo en otro período. Acá verás lo que envíes, lo que traigas de sesiones anteriores
        y lo incorporado en esta sesión.
      </p>
    )
  }

  return (
    <div className="session-deferred-root">
      {hasIncorporatePanel ? (
        <DeferredGroup
          id="session-deferred-incorporate"
          title="Para incorporar"
          count={pendingIncorporateCount}
          tone="pending"
          hint="Movimientos de sesiones anteriores. Seleccioná cuáles agregar a esta conciliación."
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
        </DeferredGroup>
      ) : null}

      {deferredIntoSession.length > 0 ? (
        <DeferredGroup
          id="session-deferred-into"
          title="Incorporados en esta sesión"
          count={deferredIntoSession.length}
          tone="into"
          hint="En la tabla aparecen con Dif←; filtrá con «Incorporado dif.»."
        >
          <ul className="session-deferred-list">
            {deferredIntoSession.map((d) => (
              <DeferredRow key={d.id} d={d} readOnly={readOnly} />
            ))}
          </ul>
        </DeferredGroup>
      ) : null}

      {sentPendingFromHere.length > 0 ? (
        <DeferredGroup
          id="session-deferred-sent"
          title="Enviados a otra conciliación"
          count={sentPendingFromHere.length}
          tone="sent"
          hint="Podés restaurarlos a pendientes si la sesión sigue abierta."
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
        </DeferredGroup>
      ) : null}
    </div>
  )
}
