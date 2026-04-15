export const SESSION_HISTORY_PAGE_SIZE = 4

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

export const CLASSIFICATION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sin clasificar' },
  { value: 'COMISION', label: 'Comisión bancaria' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'DEPOSITO_TRANSITO', label: 'Depósito en tránsito' },
  { value: 'ERROR', label: 'Error' },
  { value: 'OTRO', label: 'Otro' },
]
