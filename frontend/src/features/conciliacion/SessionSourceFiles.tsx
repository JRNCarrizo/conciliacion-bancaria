import type { ImportFileSummary } from './types'
import { parseSourceFileList } from './utils/sessionSourceFiles'

type FileEntry = { fileName: string; rowCount?: number }

function buildFileEntries(
  fileNames: string[],
  summaries: ImportFileSummary[] | null | undefined,
): FileEntry[] {
  if (summaries != null && summaries.length > 0) {
    return summaries.map((s) => ({ fileName: s.fileName, rowCount: s.rowCount }))
  }
  return fileNames.map((fileName) => ({ fileName }))
}

function FileList({ files, emptyLabel }: { files: FileEntry[]; emptyLabel: string }) {
  if (files.length === 0) {
    return <p className="session-source-files-empty">{emptyLabel}</p>
  }
  return (
    <ul className="session-source-files-list">
      {files.map((f, idx) => (
        <li key={`${f.fileName}-${idx}`} className="session-source-file-item" title={f.fileName}>
          <span className="session-source-file-icon" aria-hidden />
          <span className="session-source-file-name">{f.fileName}</span>
          {typeof f.rowCount === 'number' && (
            <span className="session-source-file-count">{f.rowCount} filas</span>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Archivos importados de banco y empresa — nombre y filas por archivo si están guardadas. */
export function SessionSourceFiles({
  bankFileName,
  companyFileName,
  bankFileSummaries,
  companyFileSummaries,
  variant = 'detail',
}: {
  bankFileName: string | null | undefined
  companyFileName: string | null | undefined
  bankFileSummaries?: ImportFileSummary[] | null
  companyFileSummaries?: ImportFileSummary[] | null
  variant?: 'detail' | 'compact'
}) {
  const bankFiles = buildFileEntries(parseSourceFileList(bankFileName), bankFileSummaries)
  const companyFiles = buildFileEntries(parseSourceFileList(companyFileName), companyFileSummaries)

  return (
    <div className={`session-source-files session-source-files--${variant}`}>
      <div className="session-source-files-group">
        <span className="session-source-files-label">Archivo banco</span>
        <FileList files={bankFiles} emptyLabel="Sin dato de archivo" />
      </div>
      <div className="session-source-files-group">
        <span className="session-source-files-label">Archivo empresa</span>
        <FileList files={companyFiles} emptyLabel="Sin dato de archivo" />
      </div>
    </div>
  )
}
