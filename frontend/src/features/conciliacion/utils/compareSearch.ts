import type { ComparisonRow } from '../types'
import { formatAmount } from './format'
import { parseBalanceInput, parseTransactionId } from './parse'

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
      String(pair.bankTxId),
      String(pair.companyTxId),
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
  const m = row.m
  const parts = [
    String(m.id),
    m.reference,
    m.description,
    formatAmount(m.amount),
  ]
  if (m.accountingAmount != null) parts.push(formatAmount(m.accountingAmount))
  return parts.filter((p) => p != null && String(p).trim() !== '').join(' \u2003 ')
}

/**
 * Coincide con ID exacto (movimiento o par), importe (misma lógica que saldos) o texto en ref/desc/importe formateado.
 * Vacío = no filtra.
 */
export function rowMatchesSearch(row: ComparisonRow, rawQuery: string): boolean {
  const q = rawQuery.trim()
  if (q === '') return true

  const idNum = parseTransactionId(q)
  if (idNum != null) {
    if (row.kind === 'pair') {
      const { pair, bank, company } = row
      if (
        pair.pairId === idNum ||
        pair.bankTxId === idNum ||
        pair.companyTxId === idNum ||
        bank.id === idNum ||
        company.id === idNum
      ) {
        return true
      }
    } else if (row.m.id === idNum) {
      return true
    }
  }

  const parsedAmount = parseBalanceInput(q)
  if (parsedAmount != null) {
    if (amountValuesForRow(row).some((n) => amountsClose(n, parsedAmount))) {
      return true
    }
  }

  const needle = fold(q)
  if (needle.length === 0) return true
  return fold(textHaystackForRow(row)).includes(needle)
}
