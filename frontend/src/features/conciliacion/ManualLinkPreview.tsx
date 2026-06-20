import type { MovimientoDto, SessionDetail } from './types'
import { coerceAmount } from './utils/effectivePairKind'
import { movementSummaryLine } from './utils/counterpartUtils'
import { formatAmount, formatDisplayDate } from './utils/format'
import { parseTransactionId } from './utils/parse'

function MovementPreviewCard({
  title,
  m,
  pending,
  side,
}: {
  title: string
  m: MovimientoDto
  pending: boolean
  side: 'bank' | 'company'
}) {
  return (
    <div className={`counterpart-card counterpart-card--${side} manual-link-preview-card`}>
      <h4 className="counterpart-card-title">{title}</h4>
      <p
        className={
          pending
            ? 'manual-link-preview-status manual-link-preview-status--pending'
            : 'manual-link-preview-status manual-link-preview-status--paired'
        }
      >
        {pending ? 'Pendiente' : 'Ya conciliado'}
      </p>
      <dl className="counterpart-card-dl">
        <div>
          <dt>ID</dt>
          <dd>{m.id}</dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{formatDisplayDate(m.txDate)}</dd>
        </div>
        <div>
          <dt>Importe</dt>
          <dd>{formatAmount(m.amount)}</dd>
        </div>
        <div className="counterpart-card-dl--wide">
          <dt>Detalle</dt>
          <dd>{movementSummaryLine(m)}</dd>
        </div>
      </dl>
    </div>
  )
}

function MissingPreviewCard({
  title,
  message,
  side,
}: {
  title: string
  message: string
  side: 'bank' | 'company'
}) {
  return (
    <div
      className={`counterpart-card counterpart-card--empty counterpart-card--${side} manual-link-preview-card`}
    >
      <h4 className="counterpart-card-title">{title}</h4>
      <p className="manual-link-preview-missing">{message}</p>
    </div>
  )
}

export function ManualLinkPreview({
  detail,
  bankIdRaw,
  companyIdRaw,
}: {
  detail: SessionDetail
  bankIdRaw: string
  companyIdRaw: string
}) {
  const bankWanted = bankIdRaw.trim() !== ''
  const companyWanted = companyIdRaw.trim() !== ''

  if (!bankWanted && !companyWanted) return null

  const bankId = parseTransactionId(bankIdRaw)
  const companyId = parseTransactionId(companyIdRaw)

  const bankMov =
    bankId != null ? detail.bankTransactions.find((m) => m.id === bankId) : undefined
  const companyMov =
    companyId != null ? detail.companyTransactions.find((m) => m.id === companyId) : undefined

  const bankPending =
    bankId != null && detail.unmatchedBankTransactions.some((m) => m.id === bankId)
  const companyPending =
    companyId != null && detail.unmatchedCompanyTransactions.some((m) => m.id === companyId)

  const delta =
    bankMov != null && companyMov != null
      ? coerceAmount(companyMov.amount) - coerceAmount(bankMov.amount)
      : null

  const bothSides = bankWanted && companyWanted

  return (
    <section className="manual-link-preview" aria-label="Vista previa para vínculo manual">
      <div
        className={
          bothSides
            ? 'counterpart-compare-grid counterpart-compare-grid--split manual-link-preview-grid'
            : 'counterpart-compare-grid manual-link-preview-grid manual-link-preview-grid--single'
        }
      >
        {bankWanted ? (
          bankId == null ? (
            <MissingPreviewCard
              title="Banco"
              message="ID inválido. Usá solo dígitos, sin espacios ni letras."
              side="bank"
            />
          ) : bankMov ? (
            <MovementPreviewCard title="Banco" m={bankMov} pending={bankPending} side="bank" />
          ) : (
            <MissingPreviewCard
              title="Banco"
              message={`No hay movimiento banco con ID ${bankId} en esta sesión.`}
              side="bank"
            />
          )
        ) : null}
        {companyWanted ? (
          companyId == null ? (
            <MissingPreviewCard
              title="Empresa"
              message="ID inválido. Usá solo dígitos, sin espacios ni letras."
              side="company"
            />
          ) : companyMov ? (
            <MovementPreviewCard
              title="Empresa"
              m={companyMov}
              pending={companyPending}
              side="company"
            />
          ) : (
            <MissingPreviewCard
              title="Empresa"
              message={`No hay movimiento empresa con ID ${companyId} en esta sesión.`}
              side="company"
            />
          )
        ) : null}
      </div>
      {delta != null ? (
        <p className="counterpart-delta manual-link-preview-delta">
          Δ (empresa − banco): {formatAmount(delta)}
          {Math.abs(delta) < 1e-9 ? ' · importes iguales' : null}
        </p>
      ) : null}
    </section>
  )
}
