/**
 * Importe desde campo de texto: acepta "1234.56", "1.234,56" (miles con punto, decimal con coma),
 * "27000000", "27.000.000", etc. Si no se puede interpretar, devuelve null (el backend guardará null).
 */
export function parseBalanceInput(raw: string): number | null {
  let t = raw.trim().replace(/\s/g, '').replace(/\u00a0/g, '')
  if (t === '') return null

  const hasComma = t.includes(',')
  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')

  if (hasComma && (!t.includes('.') || lastComma > lastDot)) {
    const intPart = t.slice(0, lastComma).replace(/\./g, '')
    const frac = t.slice(lastComma + 1).replace(/\D/g, '')
    t = frac === '' ? intPart : `${intPart}.${frac}`
  } else if (hasComma && lastDot > lastComma) {
    t = t.replace(/,/g, '')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '')
  } else if (/^\d{1,3}\.\d{3}$/.test(t)) {
    t = t.replace('.', '')
  }

  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** ID de fila en BD: solo dígitos, sin espacios. */
export function parseTransactionId(raw: string): number | null {
  const s = raw.trim()
  if (s === '') {
    return null
  }
  if (!/^\d+$/.test(s)) {
    return null
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}
