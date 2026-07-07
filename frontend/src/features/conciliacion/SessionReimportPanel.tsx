import { useId, useRef, useState } from 'react'
import { apiFetch } from '../../api/client'
import { parseError } from './api/http'
import type {
  ImportBankLayoutExcel,
  ImportCompanyLayoutExcel,
  ReimportPreview,
  ReimportResult,
} from './types'
import { bankLayoutExcelToApi, companyLayoutExcelToApi } from './utils/importLayoutExcel'

type ReimportSide = 'bank' | 'company'

type Props = {
  sessionId: number
  side: ReimportSide
  readOnly: boolean
  useCustomImportLayout: boolean
  bankLayoutExcel: ImportBankLayoutExcel
  companyLayoutExcel: ImportCompanyLayoutExcel
  onApplied: () => void | Promise<void>
}

const SIDE_LABEL: Record<ReimportSide, string> = {
  bank: 'Banco',
  company: 'Empresa',
}

function IconUpload() {
  return (
    <svg className="session-reimport-btn-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M9 16h6v-6h4l-8-8-8 8h4v6zm-4 2h14v2H5v-2z"
      />
    </svg>
  )
}

function IconPreview() {
  return (
    <svg className="session-reimport-btn-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
      />
    </svg>
  )
}

function IconSpinner() {
  return (
    <svg
      className="session-reimport-btn-icon session-reimport-btn-icon--spin"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8zm0 16a8 8 0 0 1-8-8H2a10 10 0 0 0 10 10v-2zm0-14a6 6 0 0 1 6 6h2a8 8 0 0 0-8-8v2z"
        opacity="0.35"
      />
      <path
        fill="currentColor"
        d="M12 4V2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8z"
      />
    </svg>
  )
}

function PreviewStats({ preview }: { preview: ReimportPreview }) {
  const items = [
    { key: 'unchanged', label: 'Sin cambio', value: preview.unchangedCount, tone: 'neutral' as const },
    { key: 'added', label: 'Nuevas', value: preview.addedCount, tone: 'add' as const },
    { key: 'updated', label: 'Corregidas', value: preview.updatedCount, tone: 'edit' as const },
    { key: 'removed', label: 'Eliminadas', value: preview.removedCount, tone: 'remove' as const },
    {
      key: 'unlink',
      label: 'Pares a desvincular',
      value: preview.pairsToUnlinkCount,
      tone: 'warn' as const,
    },
  ]
  const hasChanges =
    preview.addedCount > 0 ||
    preview.updatedCount > 0 ||
    preview.removedCount > 0 ||
    preview.pairsToUnlinkCount > 0

  return (
    <div className="session-reimport-preview" role="region" aria-label="Vista previa de cambios">
      <p className="session-reimport-preview-title">Vista previa</p>
      <div className="session-reimport-stats">
        {items.map((item) => (
          <div
            key={item.key}
            className={`session-reimport-stat session-reimport-stat--${item.tone}`}
          >
            <span className="session-reimport-stat-value">{item.value}</span>
            <span className="session-reimport-stat-label">{item.label}</span>
          </div>
        ))}
      </div>
      {!hasChanges && (
        <p className="session-reimport-preview-note">
          El archivo coincide con lo cargado; podés aplicar para actualizar solo el nombre registrado.
        </p>
      )}
    </div>
  )
}

export function SessionReimportPanel({
  sessionId,
  side,
  readOnly,
  useCustomImportLayout,
  bankLayoutExcel,
  companyLayoutExcel,
  onApplied,
}: Props) {
  const inputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ReimportPreview | null>(null)
  const [result, setResult] = useState<ReimportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runReimport(previewMode: boolean) {
    if (!file) {
      setError('Seleccioná un archivo Excel (.xls o .xlsx).')
      return
    }
    setLoading(true)
    setError(null)
    if (previewMode) {
      setResult(null)
    }
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (useCustomImportLayout) {
        const layout =
          side === 'bank'
            ? { bank: bankLayoutExcelToApi(bankLayoutExcel) }
            : { company: companyLayoutExcelToApi(companyLayoutExcel) }
        fd.append('layout', JSON.stringify(layout))
      }
      const r = await apiFetch(
        `/api/v1/conciliacion/sessions/${sessionId}/reimport?side=${side}&preview=${previewMode}`,
        { method: 'POST', body: fd },
      )
      if (!r.ok) throw new Error(await parseError(r))
      if (previewMode) {
        setPreview((await r.json()) as ReimportPreview)
      } else {
        const applied = (await r.json()) as ReimportResult
        setResult(applied)
        setPreview(null)
        setFile(null)
        await onApplied()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleApply() {
    const msg = preview
      ? `¿Aplicar cambios en ${SIDE_LABEL[side].toLowerCase()}?\n\n` +
        `Sin cambio: ${preview.unchangedCount}\n` +
        `Nuevas filas: ${preview.addedCount}\n` +
        `Corregidas: ${preview.updatedCount}\n` +
        `Eliminadas: ${preview.removedCount}\n` +
        `Pares a desvincular: ${preview.pairsToUnlinkCount}`
      : '¿Aplicar la reimportación?'
    if (!window.confirm(msg)) return
    await runReimport(false)
  }

  function clearFile() {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  if (readOnly) {
    return null
  }

  const previewLoading = loading && preview === null && file !== null
  const applyLoading = loading && preview !== null

  return (
    <article className={`session-reimport-panel session-reimport-panel--${side}`}>
      <header className="session-reimport-head">
        <div className="session-reimport-head-top">
          <span className="session-reimport-side-badge">{SIDE_LABEL[side]}</span>
          <h4 className="session-reimport-title">Actualizar archivo</h4>
        </div>
        <p className="session-reimport-hint">
          Subí el Excel <strong>completo</strong> de este lado. Las filas iguales no se duplican; las
          nuevas van al final.
        </p>
      </header>

      <div className="session-reimport-file-zone">
        <input
          id={inputId}
          ref={fileInputRef}
          className="session-reimport-file-input-hidden"
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={loading}
          onChange={(ev) => {
            const f = ev.target.files?.[0] ?? null
            setFile(f)
            setPreview(null)
            setResult(null)
            setError(null)
          }}
        />
        <div className="session-reimport-file-toolbar">
          <button
            type="button"
            className="session-reimport-file-pick-btn"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
          >
            <IconUpload />
            <span>{file ? 'Cambiar archivo' : 'Elegir archivo Excel'}</span>
          </button>
          {file && (
            <button
              type="button"
              className="session-reimport-file-clear"
              disabled={loading}
              onClick={clearFile}
            >
              Quitar
            </button>
          )}
        </div>
        {file ? (
          <div className="session-reimport-file-picked" title={file.name}>
            <span className="session-reimport-file-sheet-icon" aria-hidden />
            <span className="session-reimport-file-picked-name">{file.name}</span>
          </div>
        ) : (
          <p className="session-reimport-file-placeholder">
            Formatos aceptados: <strong>.xls</strong> y <strong>.xlsx</strong>
          </p>
        )}
      </div>

      <div className="session-reimport-steps" aria-hidden>
        <span className={file ? 'session-reimport-step session-reimport-step--done' : 'session-reimport-step'}>
          1 · Elegir
        </span>
        <span
          className={
            preview
              ? 'session-reimport-step session-reimport-step--done'
              : file
                ? 'session-reimport-step session-reimport-step--active'
                : 'session-reimport-step'
          }
        >
          2 · Previsualizar
        </span>
        <span
          className={
            preview
              ? 'session-reimport-step session-reimport-step--active'
              : 'session-reimport-step'
          }
        >
          3 · Aplicar
        </span>
      </div>

      <div className="session-reimport-actions">
        <button
          type="button"
          className="session-reimport-btn-preview"
          disabled={loading || !file}
          onClick={() => void runReimport(true)}
        >
          {previewLoading ? <IconSpinner /> : <IconPreview />}
          <span>{previewLoading ? 'Analizando…' : 'Vista previa'}</span>
        </button>
        <button
          type="button"
          className="btn-import session-reimport-btn-apply"
          disabled={loading || !preview}
          onClick={() => void handleApply()}
        >
          {applyLoading ? 'Aplicando…' : 'Aplicar cambios'}
        </button>
      </div>

      {preview && <PreviewStats preview={preview} />}

      {result && (
        <div className="session-reimport-success" role="status">
          <span className="session-reimport-success-title">Archivo actualizado</span>
          <span className="session-reimport-success-detail">
            +{result.addedCount} nuevas · ~{result.updatedCount} corregidas · −{result.removedCount}{' '}
            eliminadas
            {result.pairsUnlinkedCount > 0
              ? ` · ${result.pairsUnlinkedCount} par(es) desvinculado(s)`
              : ''}
          </span>
        </div>
      )}

      {error && (
        <p className="msg err session-reimport-error" role="alert">
          {error}
        </p>
      )}
    </article>
  )
}
