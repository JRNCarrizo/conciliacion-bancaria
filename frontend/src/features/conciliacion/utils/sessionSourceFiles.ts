/** Descompone el texto guardado en BD (uno o varios archivos separados por «; »). */
export function parseSourceFileList(raw: string | null | undefined): string[] {
  if (raw == null || String(raw).trim() === '' || String(raw).trim() === '—') return []
  const s = String(raw).trim()
  const multiMatch = /^(\d+)\s+archivos:\s*/i.exec(s)
  const body = multiMatch ? s.slice(multiMatch[0].length) : s
  if (body.includes('; ')) {
    return body
      .split('; ')
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return [body]
}
