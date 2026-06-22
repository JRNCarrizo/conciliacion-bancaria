import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { isEnterKey, isTypingTarget, scrollTableRowIntoView } from './keyboardScrollUtils'
import type { RubroGroupRow } from './utils/rubroGroups'

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return Math.max(0, Math.min(index, length - 1))
}

function groupHasMovementRows(group: RubroGroupRow): boolean {
  return group.bankItems.length > 0 || group.companyItems.length > 0
}

export function useRubroListKeyboardNav({
  enabled,
  filtered,
  expandedKey,
  setExpandedKey,
  toggleBankKey,
  toggleCompanyKey,
  interactionBlocked,
  resetKey,
  innerNavGroupKey,
  onEnterInnerNav,
}: {
  enabled: boolean
  filtered: readonly RubroGroupRow[]
  expandedKey: string | null
  setExpandedKey: Dispatch<SetStateAction<string | null>>
  toggleBankKey: (groupKey: string) => void
  toggleCompanyKey: (groupKey: string) => void
  interactionBlocked: boolean
  resetKey: string
  innerNavGroupKey: string | null
  onEnterInnerNav: (groupKey: string) => void
}) {
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const [navIndex, setNavIndex] = useState<number | null>(null)
  const [active, setActive] = useState(false)

  const clearKeyboardFocus = useCallback(() => {
    setNavIndex(null)
    setActive(false)
  }, [])

  const focusNextRubro = useCallback(() => {
    setNavIndex((prev) => (prev == null ? null : clampIndex(prev + 1, filtered.length)))
  }, [filtered.length])

  const focusPrevRubro = useCallback(() => {
    setNavIndex((prev) => (prev == null ? null : clampIndex(prev - 1, filtered.length)))
  }, [filtered.length])

  useEffect(() => {
    setNavIndex(null)
    setActive(false)
  }, [resetKey])

  useEffect(() => {
    if (navIndex == null || !active) return
    setNavIndex((prev) => (prev == null ? null : clampIndex(prev, filtered.length)))
  }, [filtered.length, navIndex, active])

  const focusedGroupKey =
    active && navIndex != null && filtered[navIndex] ? filtered[navIndex].groupKey : null

  useLayoutEffect(() => {
    if (!focusedGroupKey || !active || innerNavGroupKey === focusedGroupKey) return
    const wrap = tableWrapRef.current
    if (!wrap) return
    const row = wrap.querySelector(
      `tr.rubro-summary-row[data-group-key="${CSS.escape(focusedGroupKey)}"]`,
    )
    if (row instanceof HTMLElement) {
      scrollTableRowIntoView(wrap, row)
    }
  }, [focusedGroupKey, active, navIndex, innerNavGroupKey])

  const handleTableMouseEnter = useCallback(() => {
    setActive(true)
    setNavIndex((prev) => {
      if (filtered.length === 0) return null
      return prev == null ? 0 : clampIndex(prev, filtered.length)
    })
    tableWrapRef.current?.focus({ preventScroll: true })
  }, [filtered.length])

  useEffect(() => {
    if (!enabled || !active || interactionBlocked || filtered.length === 0) return

    function onKey(ev: KeyboardEvent) {
      if (isTypingTarget(ev.target)) return

      const arrow =
        ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' || ev.key === 'ArrowRight'

      if (innerNavGroupKey) {
        if (arrow || ev.key === ' ') return
      }

      if (navIndex == null) {
        if (arrow) {
          ev.preventDefault()
          setNavIndex(0)
        }
        return
      }

      const group = filtered[navIndex]
      if (!group) return

      if (ev.ctrlKey && isEnterKey(ev)) {
        ev.preventDefault()
        setExpandedKey((prev) => (prev === group.groupKey ? null : group.groupKey))
        return
      }

      if (ev.key === 'ArrowDown') {
        ev.preventDefault()
        if (
          expandedKey === group.groupKey &&
          groupHasMovementRows(group) &&
          innerNavGroupKey !== group.groupKey
        ) {
          onEnterInnerNav(group.groupKey)
          return
        }
        focusNextRubro()
        return
      }
      if (ev.key === 'ArrowUp') {
        ev.preventDefault()
        focusPrevRubro()
        return
      }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault()
        return
      }

      if (ev.key === ' ' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault()
        if (ev.shiftKey) {
          if (group.companyCount > 0) toggleCompanyKey(group.groupKey)
        } else if (group.bankCount > 0) {
          toggleBankKey(group.groupKey)
        } else if (group.companyCount > 0) {
          toggleCompanyKey(group.groupKey)
        }
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    enabled,
    active,
    interactionBlocked,
    filtered,
    navIndex,
    expandedKey,
    innerNavGroupKey,
    setExpandedKey,
    toggleBankKey,
    toggleCompanyKey,
    onEnterInnerNav,
    focusNextRubro,
    focusPrevRubro,
  ])

  return {
    tableWrapRef,
    focusedGroupKey,
    listKeyboardActive: active,
    handleTableMouseEnter,
    clearKeyboardFocus,
    focusNextRubro,
    focusPrevRubro,
  }
}
