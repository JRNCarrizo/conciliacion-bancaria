type SessionNaming = {
  id: number
  createdAt: string
  displayName?: string | null
}

/** Título principal: nombre custom o fallback «Sesión #N · mes año». */
export function formatSessionDisplayName(session: SessionNaming): string {
  const custom = session.displayName?.trim()
  if (custom) return custom
  const d = new Date(session.createdAt)
  if (Number.isNaN(d.getTime())) return `Sesión #${session.id}`
  const monthYear = d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
  return `Sesión #${session.id} · ${monthYear}`
}

/** Subtítulo con fecha de importación e ID interno. */
export function formatSessionListSubtitle(session: SessionNaming): string {
  const d = new Date(session.createdAt)
  const when = Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `Importada ${when} · #${session.id}`
}
