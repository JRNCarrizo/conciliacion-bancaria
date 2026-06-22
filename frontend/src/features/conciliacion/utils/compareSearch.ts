import type { ComparisonRow } from '../types'
import { formatAmount } from './format'
import { parseBalanceInput } from './parse'

function normalizeSearchQuery(raw: string): string {
  return raw
    .trim()
    .replace(/\uFF03/g, '#')
    .replace(/\s+/g, ' ')
}

export type SearchQueryParts = {
  rowNum: number | null
  /** Texto para buscar en ref/desc/importe formateado. */
  textNeedle: string
  /** Consulta explícita de fila (#N / fila N) sin texto adicional. */
  rowOnly: boolean
}

/** Coincide `#12`, `# 12`, `fila 12`, `fila12` (insensible a mayúsculas). */
export function parseRowNumberQuery(raw: string): number | null {
  return parseSearchQueryParts(raw).rowNum
}

/**
 * Separa número de fila (#N / fila N / solo dígitos) del texto para buscar en ref/desc/importe.
 * Con `#12` o `fila 12`, también busca «12» en el resto de columnas (la fila exacta va primero al ordenar).
 */
export function parseSearchQueryParts(raw: string): SearchQueryParts {
  const t = normalizeSearchQuery(raw)
  if (t === '') return { rowNum: null, textNeedle: '', rowOnly: false }

  const hash = /^#\s*(\d+)(?:\s+(.*))?$/.exec(t)
  if (hash) {
    const n = parseInt(hash[1], 10)
    const rest = hash[2]?.trim()
    const rowOnly = !rest
    return {
      rowNum: n > 0 ? n : null,
      textNeedle: rowOnly ? hash[1] : rest,
      rowOnly,
    }
  }

  const fila = /^fila\s*#?\s*(\d+)(?:\s+(.*))?$/i.exec(t)
  if (fila) {
    const n = parseInt(fila[1], 10)
    const rest = fila[2]?.trim()
    const rowOnly = !rest
    return {
      rowNum: n > 0 ? n : null,
      textNeedle: rowOnly ? fila[1] : rest,
      rowOnly,
    }
  }

  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10)
    return { rowNum: n > 0 ? n : null, textNeedle: t, rowOnly: true }
  }

  return { rowNum: null, textNeedle: t, rowOnly: false }
}

export function isExactRowSearchMatch(
  rowNumInBaseline: number | undefined,
  rawQuery: string,
): boolean {
  const { rowNum } = parseSearchQueryParts(rawQuery)
  return rowNum != null && rowMatchesRowNumber(rowNumInBaseline, rowNum)
}

/** Tolerancia en importes para coincidir con la búsqueda (centavos). */
const AMOUNT_TOL = 0.005

function amountsClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOL
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function uniqueFinite(nums: number[]): number[] {
  const seen = new Set<number>()
  for (const n of nums) {
    if (Number.isFinite(n)) seen.add(n)
  }
  return [...seen]
}

function amountValuesForRow(row: ComparisonRow): number[] {
  if (row.kind === 'pair') {
    const { pair, bank, company } = row
    const xs: number[] = [
      pair.bankAmount,
      pair.companyAmount,
      bank.amount,
      company.amount,
    ]
    if (bank.accountingAmount != null) xs.push(bank.accountingAmount)
    if (company.accountingAmount != null) xs.push(company.accountingAmount)
    return uniqueFinite(xs)
  }
  if (row.kind === 'group') {
    const { group, banks, companies } = row
    const xs: number[] = [group.bankSum, group.companySum]
    for (const m of banks) {
      xs.push(m.amount)
      if (m.accountingAmount != null) xs.push(m.accountingAmount)
    }
    for (const m of companies) {
      xs.push(m.amount)
      if (m.accountingAmount != null) xs.push(m.accountingAmount)
    }
    return uniqueFinite(xs)
  }
  const m = row.m
  const xs: number[] = [m.amount]
  if (m.accountingAmount != null) xs.push(m.accountingAmount)
  return uniqueFinite(xs)
}

function textHaystackForRow(row: ComparisonRow): string {
  if (row.kind === 'pair') {
    const { bank, company, pair } = row
    const parts = [
      String(pair.pairId),
      bank.reference,
      bank.description,
      company.reference,
      company.description,
      formatAmount(bank.amount),
      formatAmount(company.amount),
    ]
    if (company.accountingAmount != null) {
      parts.push(formatAmount(company.accountingAmount))
    }
    return parts.filter((p) => p != null && String(p).trim() !== '').join(' \u2003 ')
  }
  if (row.kind === 'group') {
    const { group, banks, companies } = row
    const parts = [
      String(group.groupId),
      formatAmount(group.bankSum),
      formatAmount(group.companySum),
    ]
    for (const m of [...banks, ...companies]) {
      parts.push(m.reference, m.description, formatAmount(m.amount))
    }
    return parts.filter((p) => p != null && String(p).trim() !== '').join(' \u2003 ')
  }
  const m = row.m
  const parts = [m.reference, m.description, formatAmount(m.amount)]
  if (m.accountingAmount != null) parts.push(formatAmount(m.accountingAmount))
  return parts.filter((p) => p != null && String(p).trim() !== '').join(' \u2003 ')
}

function rowMatchesRowNumber(rowNumInBaseline: number | undefined, queryRowNum: number): boolean {
  return rowNumInBaseline != null && rowNumInBaseline === queryRowNum
}

function rowMatchesAmount(row: ComparisonRow, amount: number): boolean {
  return amountValuesForRow(row).some((n) => amountsClose(n, amount))
}

function rowMatchesText(row: ComparisonRow, needle: string): boolean {
  if (needle.length === 0) return false
  return fold(textHaystackForRow(row)).includes(needle)
}

/** Menor valor = mayor prioridad al ordenar resultados de búsqueda. */
export const SEARCH_MATCH_ROW = 0
export const SEARCH_MATCH_AMOUNT = 1
export const SEARCH_MATCH_TEXT = 2

/**
 * Prioridad de coincidencia: número de fila (#N) → importe → texto (ref/desc).
 * null si la fila no coincide con la consulta.
 */
export function searchMatchPriority(
  row: ComparisonRow,
  rawQuery: string,
  rowNumInBaseline?: number,
): number | null {
  const q = normalizeSearchQuery(rawQuery)
  if (q === '') return null

  const { rowNum, textNeedle, rowOnly } = parseSearchQueryParts(q)
  let best: number | null = null

  if (rowNum != null && rowMatchesRowNumber(rowNumInBaseline, rowNum)) {
    best = SEARCH_MATCH_ROW
  }

  const amountSource = rowOnly ? '' : textNeedle && textNeedle !== String(rowNum) ? textNeedle : q
  const parsedAmount = parseBalanceInput(amountSource)
  if (parsedAmount != null && rowMatchesAmount(row, parsedAmount)) {
    best = best === null ? SEARCH_MATCH_AMOUNT : Math.min(best, SEARCH_MATCH_AMOUNT)
  }

  const needle = fold(textNeedle)
  if (needle.length > 0 && rowMatchesText(row, needle)) {
    const textRank = SEARCH_MATCH_TEXT
    best = best === null ? textRank : Math.min(best, textRank)
  }

  return best
}

/** Orden: fila exacta (#N) → prioridad de match → número de fila base. */
export function compareSearchRowOrder(
  a: ComparisonRow,
  b: ComparisonRow,
  rawQuery: string,
  rowNumA: number | undefined,
  rowNumB: number | undefined,
): number {
  const q = normalizeSearchQuery(rawQuery)
  const aExact = isExactRowSearchMatch(rowNumA, q)
  const bExact = isExactRowSearchMatch(rowNumB, q)
  if (aExact !== bExact) return aExact ? -1 : 1

  const pa = searchMatchPriority(a, q, rowNumA) ?? 99
  const pb = searchMatchPriority(b, q, rowNumB) ?? 99
  if (pa !== pb) return pa - pb
  return (rowNumA ?? 0) - (rowNumB ?? 0)
}

function normClassification(s: string | null | undefined): string {
  return (s ?? '').trim()
}

/** Filtro por clasificación exacta (tras trim). Vacío = no filtra. */
export function rowMatchesClassification(row: ComparisonRow, raw: string): boolean {
  const sel = raw.trim()
  if (sel === '') return true
  if (row.kind === 'pair') {
    return normClassification(row.pair.classification) === sel
  }
  if (row.kind === 'group') {
    return normClassification(row.group.classification) === sel
  }
  return normClassification(row.m.pendingClassification) === sel
}

export function rowMatchesSearch(
  row: ComparisonRow,
  rawQuery: string,
  rowNumInBaseline?: number,
): boolean {
  const q = rawQuery.trim()
  if (q === '') return true
  return searchMatchPriority(row, rawQuery, rowNumInBaseline) != null
}
