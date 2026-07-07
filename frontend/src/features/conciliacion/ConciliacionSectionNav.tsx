import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import './conciliacionSectionNav.css'

export type ConciliacionSectionId =
  | 'sesiones'
  | 'importar'
  | 'sesion'
  | 'cortes'
  | 'archivos'
  | 'diferidos'
  | 'conciliar'
  | 'comparar'
  | 'grupos'
  | 'ledger'

export type ConciliacionNavItem = {
  id: ConciliacionSectionId
  label: string
  icon: ReactNode
  badge?: string
  /** Resalta el badge (p. ej. hay diferidos pendientes de revisar). */
  badgeAttention?: boolean
  /** Aún más visible: requiere acción (p. ej. para incorporar). */
  badgeUrgent?: boolean
}

export type ConciliacionSectionNavHandle = {
  focusActiveItem: () => void
}

type ConciliacionSectionNavProps = {
  items: ConciliacionNavItem[]
  activeId: ConciliacionSectionId
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelect: (id: ConciliacionSectionId) => void
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="conc-nav-chevron">
      {direction === 'left' ? (
        <path
          d="M15 6l-6 6 6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M9 6l6 6-6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

export const ConciliacionSectionNav = forwardRef<
  ConciliacionSectionNavHandle,
  ConciliacionSectionNavProps
>(function ConciliacionSectionNav(
  { items, activeId, collapsed, onToggleCollapsed, onSelect },
  ref,
) {
  const navRef = useRef<HTMLElement>(null)
  const [focusIndex, setFocusIndex] = useState(() =>
    Math.max(0, items.findIndex((item) => item.id === activeId)),
  )

  useEffect(() => {
    const idx = items.findIndex((item) => item.id === activeId)
    if (idx >= 0) setFocusIndex(idx)
  }, [activeId, items])

  const focusItemAt = useCallback(
    (index: number) => {
      if (items.length === 0) return
      const next = ((index % items.length) + items.length) % items.length
      setFocusIndex(next)
      const btn = navRef.current?.querySelector<HTMLButtonElement>(
        `[data-nav-index="${next}"]`,
      )
      btn?.focus()
    },
    [items.length],
  )

  useImperativeHandle(ref, () => ({
    focusActiveItem() {
      const idx = items.findIndex((item) => item.id === activeId)
      focusItemAt(idx >= 0 ? idx : 0)
    },
  }))

  function handleNavKeyDown(ev: React.KeyboardEvent<HTMLElement>) {
    if (items.length === 0) return
    if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      focusItemAt(focusIndex + 1)
      return
    }
    if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      focusItemAt(focusIndex - 1)
      return
    }
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ev.preventDefault()
      onToggleCollapsed()
      return
    }
    if (ev.key === 'Home') {
      ev.preventDefault()
      focusItemAt(0)
      return
    }
    if (ev.key === 'End') {
      ev.preventDefault()
      focusItemAt(items.length - 1)
      return
    }
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      const item = items[focusIndex]
      if (item) onSelect(item.id)
    }
  }

  return (
    <nav
      ref={navRef}
      className={collapsed ? 'conc-nav conc-nav--collapsed' : 'conc-nav'}
      aria-label="Secciones de conciliación"
      onKeyDown={handleNavKeyDown}
    >
      <div className="conc-nav-head">
        {!collapsed ? <span className="conc-nav-head-label">Secciones</span> : null}
        <button
          type="button"
          className="conc-nav-toggle"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expandir menú lateral' : 'Plegar menú lateral'}
          title={collapsed ? 'Expandir menú' : 'Plegar menú'}
        >
          <ChevronIcon direction={collapsed ? 'right' : 'left'} />
        </button>
      </div>

      <div className="conc-nav-scroll">
        <ul className="conc-nav-list" role="list">
          {items.map((item, index) => {
            const active = item.id === activeId
            const showBadge = Boolean(item.badge)
            const badgeClassName = [
              'conc-nav-btn-badge',
              item.badgeAttention ? 'conc-nav-btn-badge--attention' : '',
              item.badgeUrgent ? 'conc-nav-btn-badge--urgent' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <li key={item.id} className="conc-nav-item">
                <button
                  type="button"
                  role="menuitem"
                  data-nav-index={index}
                  className={[
                    active ? 'conc-nav-btn conc-nav-btn--active' : 'conc-nav-btn',
                    showBadge && item.badgeAttention && !active
                      ? 'conc-nav-btn--has-alert'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={active ? 'page' : undefined}
                  title={
                    collapsed
                      ? showBadge
                        ? `${item.label} (${item.badge})`
                        : item.label
                      : undefined
                  }
                  tabIndex={index === focusIndex ? 0 : -1}
                  onFocus={() => setFocusIndex(index)}
                  onClick={() => onSelect(item.id)}
                >
                  <span className="conc-nav-btn-icon" aria-hidden>
                    {item.icon}
                    {showBadge && item.badgeAttention ? (
                      <span className="conc-nav-btn-icon-dot" aria-hidden />
                    ) : null}
                  </span>
                  {!collapsed ? <span className="conc-nav-btn-label">{item.label}</span> : null}
                  {!collapsed && showBadge ? (
                    <span className={badgeClassName}>{item.badge}</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>

        {!collapsed ? (
          <p className="conc-nav-hint">
            <kbd>↑</kbd> <kbd>↓</kbd> navegar · <kbd>Enter</kbd> abrir · <kbd>Esc</kbd> volver al menú
          </p>
        ) : null}
      </div>
    </nav>
  )
})

export function SessionsNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ImportNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3v12M7 8l5-5 5 5M5 21h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SessionNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function CheckpointsNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M4 12h4l2-4 4 8 2-4h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function FilesNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export function DeferredNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M4 8.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 8.5h18L14 3.5H10L3 8.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ReconcileNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M8 5v14l11-7L8 5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SummaryNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M8 15V11M12 15V7M16 15v-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CompareNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M4 6h7v12H4V6ZM13 6h7v12h-7V6Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function GroupsNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3 19c0-2.5 2.7-4 6-4s6 1.5 6 4M14 19c0-1.8 1.6-3 4-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function LedgerNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M15 4v4h4M8 12h8M8 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
