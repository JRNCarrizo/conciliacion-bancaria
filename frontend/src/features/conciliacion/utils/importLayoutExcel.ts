import type {
  ImportBankLayoutInput,
  ImportBankLayoutExcel,
  ImportCompanyLayoutExcel,
  ImportCompanyLayoutInput,
} from '../types'

/** Número de fila como en Excel (1 = primera fila) → índice interno del import. */
export function excelRowNumberToIndex(excelRow: number): number {
  if (!Number.isFinite(excelRow) || excelRow < 1) {
    throw new Error('Usá el número de fila que muestra Excel (1 = primera fila).')
  }
  return Math.floor(excelRow) - 1
}

/** Letra(s) de columna estilo Excel (A, B, …, Z, AA…) → índice 0-based para el servidor. */
export function parseExcelColumnLetters(raw: string): number {
  const s = raw.trim().toUpperCase().replace(/[^A-Z]/g, '')
  if (!s) {
    throw new Error('Indicá la letra de columna (ej. A, B, AA).')
  }
  let result = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) - 64
    if (c < 1 || c > 26) {
      throw new Error(`Columna inválida: ${raw.trim()}`)
    }
    result = result * 26 + c
  }
  return result - 1
}

export function normalizeColumnLettersInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
}

export function bankLayoutExcelToApi(e: ImportBankLayoutExcel): ImportBankLayoutInput {
  return {
    sheetIndex: Math.max(0, Math.floor(e.sheetNumber) - 1),
    headerRowIndex: excelRowNumberToIndex(e.titleRowNumber),
    firstDataRowIndex: excelRowNumberToIndex(e.firstDataRowNumber),
    colDate: parseExcelColumnLetters(e.colDate),
    colReference: parseExcelColumnLetters(e.colReference),
    colDescription: parseExcelColumnLetters(e.colDescription),
    colAmount: parseExcelColumnLetters(e.colAmount),
    skipHeaderValidation: e.skipHeaderValidation,
  }
}

export function companyLayoutExcelToApi(e: ImportCompanyLayoutExcel): ImportCompanyLayoutInput {
  return {
    sheetIndex: Math.max(0, Math.floor(e.sheetNumber) - 1),
    headerRowIndex: excelRowNumberToIndex(e.titleRowNumber),
    firstDataRowIndex: excelRowNumberToIndex(e.firstDataRowNumber),
    colFechaContable: parseExcelColumnLetters(e.colFechaContable),
    colTipo: parseExcelColumnLetters(e.colTipo),
    colNumero: parseExcelColumnLetters(e.colNumero),
    colFechaBanco: parseExcelColumnLetters(e.colFechaBanco),
    colDebe: parseExcelColumnLetters(e.colDebe),
    colHaber: parseExcelColumnLetters(e.colHaber),
    colObservacion: parseExcelColumnLetters(e.colObservacion),
    skipHeaderValidation: e.skipHeaderValidation,
  }
}
