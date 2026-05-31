export function UnlinkPairButton({
  matchSource,
  onClick,
}: {
  matchSource: 'MANUAL' | 'AUTO'
  onClick: () => void
}) {
  const manual = matchSource === 'MANUAL'
  const label = manual ? 'Quitar' : 'Desvincular'

  return (
    <button
      type="button"
      className={`pair-unlink-btn ${manual ? 'pair-unlink-btn--manual' : 'pair-unlink-btn--auto'}`}
      onClick={onClick}
      title={
        manual
          ? 'Quitar vínculo manual (vuelven a pendientes)'
          : 'Desvincular par automático (vuelven a pendientes)'
      }
      aria-label={label}
    >
      {label}
    </button>
  )
}
