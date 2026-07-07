import { useEffect, useMemo, useState } from 'react'
import type { PendingPairLinkPrompt } from './RubroLinkConfirmModal'
import type { RubroMovementRef } from './utils/rubroGroups'
import { coerceAmount } from './utils/effectivePairKind'

export function usePendingMultiLinkPicker(
  enabled: boolean,
  linkableBank: readonly RubroMovementRef[],
  linkableCompany: readonly RubroMovementRef[],
  resetKey: string,
) {
  const [selectedBankIds, setSelectedBankIds] = useState<Set<number>>(() => new Set())
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<number>>(() => new Set())
  const [promptDismissed, setPromptDismissed] = useState(false)

  useEffect(() => {
    setSelectedBankIds(new Set())
    setSelectedCompanyIds(new Set())
    setPromptDismissed(false)
  }, [resetKey])

  function toggleBank(id: number) {
    setPromptDismissed(false)
    setSelectedBankIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleCompany(id: number) {
    setPromptDismissed(false)
    setSelectedCompanyIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedBankIds(new Set())
    setSelectedCompanyIds(new Set())
    setPromptDismissed(false)
  }

  function dismissPrompt() {
    setPromptDismissed(true)
  }

  const selectedBank = useMemo(
    () => linkableBank.filter((i) => selectedBankIds.has(i.m.id)),
    [linkableBank, selectedBankIds],
  )
  const selectedCompany = useMemo(
    () => linkableCompany.filter((i) => selectedCompanyIds.has(i.m.id)),
    [linkableCompany, selectedCompanyIds],
  )

  const bankSum = useMemo(
    () => selectedBank.reduce((s, i) => s + coerceAmount(i.m.amount), 0),
    [selectedBank],
  )
  const companySum = useMemo(
    () => selectedCompany.reduce((s, i) => s + coerceAmount(i.m.amount), 0),
    [selectedCompany],
  )
  const delta = companySum - bankSum
  const hasBank = selectedBank.length > 0
  const hasCompany = selectedCompany.length > 0
  const bothSides = hasBank && hasCompany

  const canGroupLink =
    enabled &&
    bothSides &&
    (selectedBank.length > 1 || selectedCompany.length > 1)

  const pairPrompt = useMemo((): PendingPairLinkPrompt | null => {
    if (!enabled || promptDismissed || canGroupLink) return null
    if (selectedBank.length !== 1 || selectedCompany.length !== 1) return null
    const bank = selectedBank[0]!
    const company = selectedCompany[0]!
    return {
      bankId: bank.m.id,
      companyId: company.m.id,
      bank: bank.m,
      company: company.m,
    }
  }, [enabled, promptDismissed, canGroupLink, selectedBank, selectedCompany])

  const hasSelection = hasBank || hasCompany

  return {
    selectedBankIds,
    selectedCompanyIds,
    selectedBank,
    selectedCompany,
    toggleBank,
    toggleCompany,
    clearSelection,
    bankSum,
    companySum,
    delta,
    hasBank,
    hasCompany,
    bothSides,
    canGroupLink,
    pairPrompt,
    dismissPrompt,
    hasSelection,
  }
}
