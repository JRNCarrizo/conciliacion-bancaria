/** Formulario: filas como número en Excel (1 = primera); columnas como letra(s) A, B, AA… */
export type ImportBankLayoutExcel = {
  sheetNumber: number
  titleRowNumber: number
  firstDataRowNumber: number
  colDate: string
  colReference: string
  colDescription: string
  colAmount: string
  skipHeaderValidation: boolean
}

export type ImportCompanyLayoutExcel = {
  sheetNumber: number
  titleRowNumber: number
  firstDataRowNumber: number
  colFechaContable: string
  colTipo: string
  colNumero: string
  colFechaBanco: string
  colDebe: string
  colHaber: string
  colObservacion: string
  skipHeaderValidation: boolean
}

/** Índices 0-based enviados al API en `layout` (se derivan desde Import*Excel en la UI). */
export type ImportBankLayoutInput = {
  sheetIndex: number
  headerRowIndex: number
  firstDataRowIndex: number
  colDate: number
  colReference: number
  colDescription: number
  colAmount: number
  skipHeaderValidation: boolean
}

export type ImportCompanyLayoutInput = {
  sheetIndex: number
  headerRowIndex: number
  firstDataRowIndex: number
  colFechaContable: number
  colTipo: number
  colNumero: number
  colFechaBanco: number
  colDebe: number
  colHaber: number
  colObservacion: number
  skipHeaderValidation: boolean
}

export type ImportResult = {
  sessionId: number
  bankRows: number
  companyRows: number
  sourceBankFileName: string
  sourceCompanyFileName: string
}

export type SessionSummary = {
  id: number
  createdAt: string
  sourceBankFileName: string | null
  sourceCompanyFileName: string | null
  status: string
  bankRowCount: number
  companyRowCount: number
  matchedPairs: number
}

export type PageSessions = {
  content: SessionSummary[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export type MovimientoDto = {
  id: number
  txDate: string
  amount: number
  description: string | null
  reference: string | null
  pendingClassification?: string | null
  /** Solo empresa: haber − debe (libro). Banco: null. */
  accountingAmount?: number | null
  /** Misma fecha + importe que otro movimiento en el mismo archivo. */
  duplicateInFile?: boolean
  /** Pendiente: candidato sugerido en el otro lado (fuzzy). */
  fuzzyCounterpartId?: number | null
  fuzzyHint?: string | null
  /** Mensajes archivados en la conversación del pendiente. */
  commentCount?: number
  /** Archivos adjuntos (comprobantes) en el pendiente. */
  attachmentCount?: number
}

export type MovementAttachmentDto = {
  id: number
  originalFilename: string
  contentType: string | null
  sizeBytes: number
  createdAt: string
  /** Usuario autenticado que subió el archivo (null en registros antiguos). */
  createdByUsername?: string | null
}

/** Comentarios: un movimiento o conversación banco + empresa en un par. */
export type PendingThreadTarget =
  | { kind: 'single'; side: 'bank' | 'company'; txId: number }
  | { kind: 'pair'; pairId: number }

/** Adjuntos: pendiente por movimiento, o un solo conjunto por par conciliado. */
export type PendingAttachmentTarget =
  | { kind: 'single'; side: 'bank' | 'company'; txId: number }
  | { kind: 'pair'; pairId: number }

export type PendingCommentDto = {
  id: number
  body: string
  createdAt: string
  /** Usuario autenticado que escribió el mensaje (null en registros antiguos). */
  createdByUsername?: string | null
}

/**
 * EXACT · importes iguales (± redondeo).
 * AMOUNT_ADJUST · importes distintos pero |Δ| ≤ tolerancia de la última conciliación (el matcher permitió el par).
 * AMOUNT_GAP · |Δ| por encima de esa tolerancia (brecha real; p. ej. vínculo manual o datos incoherentes).
 */
export type PairKind = 'EXACT' | 'AMOUNT_ADJUST' | 'AMOUNT_GAP' | 'OPPOSITE_SIGN'

export type ParDto = {
  pairId: number
  matchSource: string
  bankTxId: number
  companyTxId: number
  bankAmount: number
  companyAmount: number
  bankDate: string
  companyDate: string
  /** Una sola clasificación por fila de par (persistida en el par, no duplicada en movimientos). */
  classification?: string | null
  /** Comentarios del par (un solo hilo por fila conciliada). */
  pairCommentCount?: number
  /** Derivado: brecha de importe o signo opuesto en el par. */
  pairKind?: PairKind
  /** Comprobantes asociados a la operación (par), no por movimiento. */
  pairAttachmentCount?: number
}

export type ConciliacionStatsDto = {
  bankRowCount: number
  companyRowCount: number
  matchedPairs: number
  unmatchedBankCount: number
  unmatchedCompanyCount: number
  sumBank: number
  sumCompany: number
  differenceTotal: number
  sumReconciledBank: number
  sumReconciledCompany: number
  sumPendingBank: number
  sumPendingCompany: number
  pctRowsReconciledBank: number
  pctRowsReconciledCompany: number
  reconciledPairDelta: number
  pendingNetDifference: number
  pairAmountMismatch: boolean
  differenceDecompositionOk: boolean
  reconciliationStatus: string
  reconciliationStatusDetail: string
  differenceExplanation: string[]
  adjustedBalanceFromBank: number | null
  adjustedVsCompanyClosing: number | null
  closingBalancesForCrossCheck: boolean
  sumCompanyAccounting: number
  pairsExactAmountCount: number
  pairsWithAmountGapCount: number
  pairsOppositeSignCount: number
  auditCierreCuadrado: boolean
}

/** Solo los dos saldos finales para el panel de auditoría */
export type SessionClosingInfo = {
  closingBankBalance: number | null
  closingCompanyBalance: number | null
}

export type SessionDetail = {
  session: {
    id: number
    createdAt: string
    sourceBankFileName: string | null
    sourceCompanyFileName: string | null
    status: string
    openingBankBalance: number | null
    closingBankBalance: number | null
    openingCompanyBalance: number | null
    closingCompanyBalance: number | null
    /** Última tolerancia de importe usada al conciliar; la UI «EXACT vs Δ» la usa como umbral. */
    amountTolerance?: number | null
    dateToleranceDays?: number | null
  }
  bankTransactions: MovimientoDto[]
  companyTransactions: MovimientoDto[]
  unmatchedBankTransactions: MovimientoDto[]
  unmatchedCompanyTransactions: MovimientoDto[]
  pairs: ParDto[]
  stats: ConciliacionStatsDto
}

export type ConciliacionRunResult = {
  sessionId: number
  pairsCreated: number
  unmatchedBank: number
  unmatchedCompany: number
  dateToleranceDays: number
  amountTolerance: number
}

export type ComparisonRow =
  | {
      key: string
      kind: 'pair'
      pair: ParDto
      bank: MovimientoDto
      company: MovimientoDto
    }
  | { key: string; kind: 'unmatchedBank'; m: MovimientoDto }
  | { key: string; kind: 'unmatchedCompany'; m: MovimientoDto }

export type CompareFilterKind =
  | 'all'
  | 'auto'
  | 'manual'
  | 'pend-bank'
  | 'pend-company'
  | 'amount-gap'
  | 'opposite-sign'
  | 'fuzzy'
  | 'duplicate'
