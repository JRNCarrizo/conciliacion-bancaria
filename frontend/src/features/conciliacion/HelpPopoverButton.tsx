import { useEffect, useRef, useState, type ReactNode } from 'react'

function InfoCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 16v-1M12 8v4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function KeyboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="3" y="7" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M7 11h.01M10 11h.01M13 11h.01M16 11h.01M7 14h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Icono ⓘ o teclado con panel flotante (no desplaza el layout). */
export function HelpPopoverButton({
  children,
  ariaLabel = 'Ayuda',
  dialogLabel = 'Ayuda',
  variant = 'info',
  className,
}: {
  children: ReactNode
  ariaLabel?: string
  dialogLabel?: string
  /** `keyboard` — atajos de teclado; `info` — ayuda general. */
  variant?: 'info' | 'keyboard'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const isKeyboard = variant === 'keyboard'

  useEffect(() => {
    if (!open) return
    function onPointerDown(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div
      className={['view-help-popover', isKeyboard ? 'view-help-popover--keyboard' : '', className]
        .filter(Boolean)
        .join(' ')}
      ref={rootRef}
    >
      <button
        type="button"
        className={[
          'view-help-popover-toggle',
          isKeyboard ? 'view-help-popover-toggle--keyboard' : '',
          open ? 'view-help-popover-toggle--open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        title={isKeyboard ? 'Atajos de teclado' : 'Ayuda'}
      >
        {isKeyboard ? (
          <KeyboardIcon className="view-help-popover-icon" />
        ) : (
          <InfoCircleIcon className="view-help-popover-icon" />
        )}
      </button>
      {open && (
        <div
          className="view-help-popover-panel hint keyboard-hint-popover-panel"
          role="dialog"
          aria-label={dialogLabel}
        >
          {children}
        </div>
      )}
    </div>
  )
}
