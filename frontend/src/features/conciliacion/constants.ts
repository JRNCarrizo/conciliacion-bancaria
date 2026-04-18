import type {
  ImportBankLayoutExcel,
  ImportCompanyLayoutExcel,
  ImportBankLayoutInput,
  ImportCompanyLayoutInput,
} from './types'

export const SESSION_HISTORY_PAGE_SIZE = 4

/** Valores por defecto del import (mismo criterio que el backend sin `layout`). Filas = nº en Excel. */
export const DEFAULT_IMPORT_BANK_LAYOUT_EXCEL: ImportBankLayoutExcel = {
  sheetNumber: 1,
  titleRowNumber: 8,
  firstDataRowNumber: 9,
  colDate: 'A',
  colReference: 'D',
  colDescription: 'F',
  colAmount: 'G',
  skipHeaderValidation: false,
}

export const DEFAULT_IMPORT_COMPANY_LAYOUT_EXCEL: ImportCompanyLayoutExcel = {
  sheetNumber: 1,
  titleRowNumber: 3,
  firstDataRowNumber: 4,
  colFechaContable: 'A',
  colTipo: 'C',
  colNumero: 'D',
  colFechaBanco: 'E',
  colDebe: 'F',
  colHaber: 'G',
  colObservacion: 'J',
  skipHeaderValidation: false,
}

/** Equivalente API (índices); útil si hace falta alinear con tests o documentación técnica. */
export const DEFAULT_IMPORT_BANK_LAYOUT: ImportBankLayoutInput = {
  sheetIndex: 0,
  headerRowIndex: 7,
  firstDataRowIndex: 8,
  colDate: 0,
  colReference: 3,
  colDescription: 5,
  colAmount: 6,
  skipHeaderValidation: false,
}

export const DEFAULT_IMPORT_COMPANY_LAYOUT: ImportCompanyLayoutInput = {
  sheetIndex: 0,
  headerRowIndex: 2,
  firstDataRowIndex: 3,
  colFechaContable: 0,
  colTipo: 2,
  colNumero: 3,
  colFechaBanco: 4,
  colDebe: 5,
  colHaber: 6,
  colObservacion: 9,
  skipHeaderValidation: false,
}

export const STATUS_LABEL: Record<string, string> = {
  OK: 'Conciliación coherente',
  PENDING_DIFFERENCES: 'Diferencias pendientes',
  PAIR_AMOUNT_MISMATCH: 'Importes distintos en algún par',
  PAIR_SIGN_MISMATCH: 'Par con signos opuestos (no válido)',
  STRUCTURAL_ERROR: 'Inconsistencia en el desglose',
  BALANCE_CROSS_CHECK_FAIL: 'Saldos declarados no cierran',
}

export const SESSION_STATUS_LABEL: Record<string, string> = {
  IMPORTED: 'Importada',
  RECONCILED: 'Conciliada',
  CLOSED: 'Cerrada',
}
