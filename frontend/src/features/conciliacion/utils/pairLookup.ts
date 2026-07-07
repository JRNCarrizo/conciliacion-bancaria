import type { MovimientoDto, ParDto, SessionDetail } from '../types'
import { coerceAmount } from './effectivePairKind'

export type PairPreviewData = {
  pair: ParDto
  bank: MovimientoDto
  company: MovimientoDto
  delta: number
}

export function resolvePairPreview(detail: SessionDetail, pairId: number): PairPreviewData | null {
  const pair = detail.pairs.find((p) => p.pairId === pairId)
  if (!pair) return null
  const bank = detail.bankTransactions.find((m) => m.id === pair.bankTxId)
  const company = detail.companyTransactions.find((m) => m.id === pair.companyTxId)
  if (!bank || !company) return null
  const delta = coerceAmount(company.amount) - coerceAmount(bank.amount)
  return { pair, bank, company, delta }
}

export function comparisonPairRowKey(pairId: number): string {
  return `pair-${pairId}`
}
