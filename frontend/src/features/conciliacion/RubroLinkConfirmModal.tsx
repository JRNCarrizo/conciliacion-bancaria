import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MovimientoDto } from './types'
import type { RubroMovementRef } from './utils/rubroGroups'
import { movementSummaryLine } from './utils/counterpartUtils'
import { formatAmount, formatDisplayDate } from './utils/format'

export type PendingPairLinkPrompt = {
  bankId: number
  companyId: number
  bank: MovimientoDto
  company: MovimientoDto
}

export function usePendingPairLinkPicker(
  linkMode: boolean,
  linkableBank: readonly RubroMovementRef[],
  linkableCompany: readonly RubroMovementRef[],
  resetKey: string,
) {
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null)
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)
  const [promptDismissed, setPromptDismissed] = useState(false)

  useEffect(() => {
    setSelectedBankId(linkableBank.length === 1 ? linkableBank[0].m.id : null)
    setSelectedCompanyId(linkableCompany.length === 1 ? linkableCompany[0].m.id : null)
    setPromptDismissed(false)
  }, [resetKey, linkableBank, linkableCompany])

  const prompt = useMemo((): PendingPairLinkPrompt | null => {
    if (!linkMode || promptDismissed || selectedBankId == null || selectedCompanyId == null) {
      return null
    }
    const bankRef = linkableBank.find((i) => i.m.id === selectedBankId)
    const companyRef = linkableCompany.find((i) => i.m.id === selectedCompanyId)
    if (!bankRef || !companyRef) return null
    return {
      bankId: selectedBankId,
      companyId: selectedCompanyId,
      bank: bankRef.m,
      company: companyRef.m,
    }
  }, [linkMode, promptDismissed, selectedBankId, selectedCompanyId, linkableBank, linkableCompany])

  function toggleBank(id: number) {
    setPromptDismissed(false)
    setSelectedBankId((prev) => (prev === id ? null : id))
  }

  function toggleCompany(id: number) {
    setPromptDismissed(false)
    setSelectedCompanyId((prev) => (prev === id ? null : id))
  }

  function dismissPrompt() {
    setPromptDismissed(true)
  }

  return {
    selectedBankId,
    selectedCompanyId,
    toggleBank,
    toggleCompany,
    prompt,
    dismissPrompt,
  }
}

function MovementLine({ m }: { m: MovimientoDto }) {
  return (
    <p className="rubro-link-confirm-line">
      <strong>ID {m.id}</strong> · {formatDisplayDate(m.txDate)} · {formatAmount(m.amount)}
      <br />
      <span className="rubro-link-confirm-desc">{movementSummaryLine(m)}</span>
    </p>
  )
}

export function RubroLinkConfirmModal({
  prompt,
  loading,
  error,
  onConfirm,
  onCancel,
}: {
  prompt: PendingPairLinkPrompt
  loading: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !loading) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, onCancel])

  return createPortal(
    <div
      className="comment-modal-backdrop rubro-link-confirm-backdrop"
      role="presentation"
      onClick={() => {
        if (!loading) onCancel()
      }}
    >
      <div
        className="comment-modal rubro-link-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rubro-link-confirm-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="comment-modal-head">
          <h3 id="rubro-link-confirm-title">¿Vincular estos movimientos?</h3>
          <button
            type="button"
            className="comment-modal-close"
            onClick={onCancel}
            disabled={loading}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>
        <div className="rubro-link-confirm-body">
          <div className="rubro-link-confirm-side">
            <span className="rubro-link-confirm-side-label">Banco</span>
            <MovementLine m={prompt.bank} />
          </div>
          <div className="rubro-link-confirm-side">
            <span className="rubro-link-confirm-side-label">Empresa</span>
            <MovementLine m={prompt.company} />
          </div>
        </div>
        {error ? <p className="msg err rubro-link-confirm-err">{error}</p> : null}
        <footer className="counterpart-modal-actions rubro-link-confirm-actions">
          <button type="button" className="btn-secondary" disabled={loading} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn-import" disabled={loading} onClick={onConfirm}>
            {loading ? 'Vinculando…' : 'Vincular'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
