import type { ComparisonRow, MovimientoDto } from '../types'
import { movementSummaryLine } from './counterpartUtils'
import { formatDisplayDate } from './format'

export type ConciliacionFocusNavState = {
  /** Timestamp en cada clic desde chat; fuerza re-scroll aunque la URL sea igual. */
  conciliacionRefocus?: number
}

export type ConciliacionShareFocus =
  | { kind: 'bank'; txId: number }
  | { kind: 'company'; txId: number }
  | { kind: 'pair'; pairId: number }

export type ConciliacionShareRef = {
  sessionId: number
  focus: ConciliacionShareFocus
  /** Nº de fila visible en la grilla (columna #), 1-based. */
  rowNum?: number
  /** Título corto en tarjeta de chat. */
  label: string
  /** Detalle legible (fechas, importes, descripción; en pares, ambos lados). */
  detail?: string
  openNotes?: boolean
}

const MARKER_PREFIX = '[[cb:v1:'
const MARKER_SUFFIX = ']]'
const MAX_DETAIL_LEN = 280

function toBase64Url(json: string): string {
  const b64 = btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    ),
  )
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const binary = atob(b64 + pad)
  return decodeURIComponent(
    Array.from(binary, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
  )
}

function truncateDetail(text: string): string {
  if (text.length <= MAX_DETAIL_LEN) return text
  return `${text.slice(0, MAX_DETAIL_LEN - 1)}…`
}

function movementLineForShare(m: MovimientoDto, sideLabel?: string): string {
  const core = [
    formatDisplayDate(m.txDate),
    String(m.amount),
    movementSummaryLine(m),
  ].join(' · ')
  return sideLabel ? `${sideLabel}: ${core}` : core
}

function isValidShareRef(parsed: unknown): parsed is ConciliacionShareRef {
  if (!parsed || typeof parsed !== 'object') return false
  const r = parsed as ConciliacionShareRef
  if (typeof r.sessionId !== 'number' || !r.focus || typeof r.label !== 'string') return false
  if (r.rowNum != null && typeof r.rowNum !== 'number') return false
  if (r.detail != null && typeof r.detail !== 'string') return false
  return true
}

export function encodeShareMarker(ref: ConciliacionShareRef): string {
  return `${MARKER_PREFIX}${toBase64Url(JSON.stringify(ref))}${MARKER_SUFFIX}`
}

export function parseShareMarkerFromText(text: string): {
  ref: ConciliacionShareRef | null
  userText: string
} {
  const re = /\[\[cb:v1:([A-Za-z0-9_-]+)\]\]/g
  let ref: ConciliacionShareRef | null = null
  const without = text.replace(re, (_, b64: string) => {
    try {
      const parsed = JSON.parse(fromBase64Url(b64)) as unknown
      if (isValidShareRef(parsed)) {
        ref = parsed
      }
    } catch {
      /* ignore */
    }
    return ''
  })
  return { ref, userText: without.replace(/^\s+/, '').trim() }
}

export function buildConciliacionSharePath(ref: ConciliacionShareRef): string {
  const params = new URLSearchParams()
  params.set('sesion', String(ref.sessionId))
  if (ref.focus.kind === 'bank') params.set('focus', `bank:${ref.focus.txId}`)
  else if (ref.focus.kind === 'company') params.set('focus', `company:${ref.focus.txId}`)
  else params.set('focus', `pair:${ref.focus.pairId}`)
  if (ref.openNotes) params.set('notas', '1')
  return `/conciliacion?${params.toString()}`
}

export function shareRefToRowKey(ref: ConciliacionShareRef): string {
  if (ref.focus.kind === 'bank') return `ub-${ref.focus.txId}`
  if (ref.focus.kind === 'company') return `uc-${ref.focus.txId}`
  return `pair-${ref.focus.pairId}`
}

export function parseFocusFromSearchParam(
  raw: string | null,
): ConciliacionShareFocus | null {
  if (!raw?.trim()) return null
  const m = raw.trim().match(/^(bank|company|pair):(\d+)$/i)
  if (!m) return null
  const id = Number(m[2])
  if (!Number.isFinite(id)) return null
  const kind = m[1].toLowerCase()
  if (kind === 'bank') return { kind: 'bank', txId: id }
  if (kind === 'company') return { kind: 'company', txId: id }
  return { kind: 'pair', pairId: id }
}

export function buildShareRefFromComparisonRow(
  sessionId: number,
  row: ComparisonRow,
  /** Índice visible en la tabla (columna #), 1-based. */
  rowNum: number,
): ConciliacionShareRef | null {
  if (row.kind === 'pair') {
    const { pair, bank, company } = row
    return {
      sessionId,
      focus: { kind: 'pair', pairId: pair.pairId },
      rowNum,
      label: `Fila ${rowNum} · Par conciliado`,
      detail: truncateDetail(
        `${movementLineForShare(bank, 'Banco')}\n${movementLineForShare(company, 'Empresa')}`,
      ),
    }
  }
  if (row.kind === 'unmatchedBank') {
    const { m } = row
    return {
      sessionId,
      focus: { kind: 'bank', txId: m.id },
      rowNum,
      label: `Fila ${rowNum} · Pendiente banco`,
      detail: truncateDetail(movementLineForShare(m)),
    }
  }
  if (row.kind === 'unmatchedCompany') {
    const { m } = row
    return {
      sessionId,
      focus: { kind: 'company', txId: m.id },
      rowNum,
      label: `Fila ${rowNum} · Pendiente empresa`,
      detail: truncateDetail(movementLineForShare(m)),
    }
  }
  return null
}

export function composeChatMessageBody(userText: string, ref: ConciliacionShareRef | null): string {
  const marker = ref ? encodeShareMarker(ref) : ''
  const text = userText.trim()
  if (marker && text) return `${marker}\n\n${text}`
  if (marker) return marker
  return text
}
