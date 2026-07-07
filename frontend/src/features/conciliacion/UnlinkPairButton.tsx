export function UnlinkPairButton({
  matchSource,
  onClick,
  variant = 'text',
  title,
  ariaLabel,
}: {
  matchSource: 'MANUAL' | 'AUTO'
  onClick: () => void
  /** En tabla comparativa: cruz compacta con tooltip. */
  variant?: 'text' | 'icon'
  title?: string
  ariaLabel?: string
}) {
  const manual = matchSource === 'MANUAL'
  const label = ariaLabel ?? (manual ? 'Quitar' : 'Desvincular')
  const tip =
    title ??
    (manual
      ? 'Quitar vínculo manual (vuelven a pendientes)'
      : 'Desvincular par automático (vuelven a pendientes)')
  const tone = manual ? 'pair-unlink-btn--manual' : 'pair-unlink-btn--auto'

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={`pair-unlink-btn pair-unlink-btn--icon ${tone}`}
        onClick={onClick}
        title={tip}
        aria-label={label}
      >
        ×
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`pair-unlink-btn ${tone}`}
      onClick={onClick}
      title={tip}
      aria-label={label}
    >
      {label}
    </button>
  )
}
