import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RubroMovementRef } from './utils/rubroGroups'

export type LedgerNavSide = 'bank' | 'company'

type LedgerNavFocus = {
  side: LedgerNavSide
  index: number
}

function itemsForSide(
  side: LedgerNavSide,
  bankItems: readonly RubroMovementRef[],
  companyItems: readonly RubroMovementRef[],
): readonly RubroMovementRef[] {
  return side === 'bank' ? bankItems : companyItems
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return Math.max(0, Math.min(index, length - 1))
}

function defaultSide(
  bankItems: readonly RubroMovementRef[],
  companyItems: readonly RubroMovementRef[],
): LedgerNavSide | null {
  if (bankItems.length > 0) return 'bank'
  if (companyItems.length > 0) return 'company'
  return null
}

import { isTypingTarget, scrollTableRowIntoView } from './keyboardScrollUtils'

export function useLedgerKeyboardNav({
  enabled,
  bankItems,
  companyItems,
  linkMode,
  toggleBank,
  toggleCompany,
  interactionBlocked,
  resetKey,
  forcedActive = false,
  onExitUp,
  onExitDownAtEnd,
}: {
  enabled: boolean
  bankItems: readonly RubroMovementRef[]
  companyItems: readonly RubroMovementRef[]
  linkMode: boolean
  toggleBank: (id: number) => void
  toggleCompany: (id: number) => void
  interactionBlocked: boolean
  resetKey: string
  /** Teclado activo sin pasar el mouse (p. ej. ↓ desde la fila del rubro expandido). */
  forcedActive?: boolean
  onExitUp?: () => void
  onExitDownAtEnd?: () => void
}) {
  const bankWrapRef = useRef<HTMLDivElement>(null)
  const companyWrapRef = useRef<HTMLDivElement>(null)
  const [nav, setNav] = useState<LedgerNavFocus | null>(null)
  const [mouseActive, setMouseActive] = useState(false)
  const keyboardActive = forcedActive || mouseActive

  const clearKeyboardFocus = useCallback(() => {
    setNav(null)
    setMouseActive(false)
  }, [])

  useEffect(() => {
    setNav(null)
    setMouseActive(false)
  }, [resetKey])

  useEffect(() => {
    if (!forcedActive) return
    const side = defaultSide(bankItems, companyItems)
    if (side == null) return
    setNav({ side, index: 0 })
    const wrap = side === 'bank' ? bankWrapRef.current : companyWrapRef.current
    wrap?.focus({ preventScroll: true })
  }, [forcedActive, bankItems, companyItems])

  useLayoutEffect(() => {
    if (!nav || !keyboardActive) return
    const items = itemsForSide(nav.side, bankItems, companyItems)
    const item = items[nav.index]
    if (!item) return
    const wrap = nav.side === 'bank' ? bankWrapRef.current : companyWrapRef.current
    const row = wrap?.querySelector(`tr[data-tx-id="${item.m.id}"]`)
    if (wrap instanceof HTMLElement && row instanceof HTMLElement) {
      scrollTableRowIntoView(wrap, row)
    }
  }, [nav, keyboardActive, bankItems, companyItems])

  const handleTableMouseEnter = useCallback(
    (side: LedgerNavSide) => {
      setMouseActive(true)
      setNav((prev) => {
        const items = itemsForSide(side, bankItems, companyItems)
        if (items.length === 0) return prev
        const index = prev ? clampIndex(prev.index, items.length) : 0
        return { side, index }
      })
    },
    [bankItems, companyItems],
  )

  const handleGridMouseLeave = useCallback(() => {
    if (!forcedActive) setMouseActive(false)
  }, [forcedActive])

  const activateWithSide = useCallback(
    (side: LedgerNavSide) => {
      const items = itemsForSide(side, bankItems, companyItems)
      if (items.length === 0) return
      setMouseActive(true)
      setNav({ side, index: 0 })
    },
    [bankItems, companyItems],
  )

  useEffect(() => {
    if (!enabled || !keyboardActive || interactionBlocked) return

    function onKey(ev: KeyboardEvent) {
      if (isTypingTarget(ev.target)) return

      const arrow = ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' || ev.key === 'ArrowRight'

      if (!nav) {
        if (!arrow) return
        ev.preventDefault()
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
          if (bankItems.length > 0) activateWithSide('bank')
          else if (companyItems.length > 0) activateWithSide('company')
        } else if (companyItems.length > 0) {
          activateWithSide('company')
        } else if (bankItems.length > 0) {
          activateWithSide('bank')
        }
        return
      }

      const items = itemsForSide(nav.side, bankItems, companyItems)
      if (items.length === 0) return

      if (ev.key === 'ArrowDown') {
        ev.preventDefault()
        if (nav.index >= items.length - 1) {
          onExitDownAtEnd?.()
          return
        }
        setNav({ side: nav.side, index: clampIndex(nav.index + 1, items.length) })
        return
      }
      if (ev.key === 'ArrowUp') {
        ev.preventDefault()
        if (nav.index === 0) {
          onExitUp?.()
          return
        }
        setNav({ side: nav.side, index: clampIndex(nav.index - 1, items.length) })
        return
      }
      if (ev.key === 'ArrowRight' && nav.side === 'bank' && companyItems.length > 0) {
        ev.preventDefault()
        setNav({
          side: 'company',
          index: clampIndex(nav.index, companyItems.length),
        })
        return
      }
      if (ev.key === 'ArrowLeft' && nav.side === 'company' && bankItems.length > 0) {
        ev.preventDefault()
        setNav({
          side: 'bank',
          index: clampIndex(nav.index, bankItems.length),
        })
        return
      }
      if (ev.key === ' ' && linkMode) {
        ev.preventDefault()
        const ref = items[nav.index]
        if (!ref || ref.pairId != null || ref.groupId != null) return
        if (nav.side === 'bank') toggleBank(ref.m.id)
        else toggleCompany(ref.m.id)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    enabled,
    keyboardActive,
    interactionBlocked,
    nav,
    bankItems,
    companyItems,
    linkMode,
    toggleBank,
    toggleCompany,
    activateWithSide,
    onExitUp,
    onExitDownAtEnd,
  ])

  const focusedTxId =
    keyboardActive && nav
      ? itemsForSide(nav.side, bankItems, companyItems)[nav.index]?.m.id ?? null
      : null

  return {
    bankWrapRef,
    companyWrapRef,
    focusedTxId,
    focusedSide: keyboardActive && nav ? nav.side : null,
    handleTableMouseEnter,
    handleGridMouseLeave,
    clearKeyboardFocus,
  }
}
