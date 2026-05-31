import { parseSourceFileList } from './utils/sessionSourceFiles'

function FileNameList({ files, emptyLabel }: { files: string[]; emptyLabel: string }) {
  if (files.length === 0) {
    return <p className="session-source-files-empty">{emptyLabel}</p>
  }
  return (
    <ul className="session-source-files-list">
      {files.map((name, idx) => (
        <li key={`${name}-${idx}`} className="session-source-file-item" title={name}>
          <span className="session-source-file-icon" aria-hidden />
          <span className="session-source-file-name">{name}</span>
        </li>
      ))}
    </ul>
  )
}

/** Archivos importados de banco y empresa — nombres completos con salto de línea. */
export function SessionSourceFiles({
  bankFileName,
  companyFileName,
  variant = 'detail',
}: {
  bankFileName: string | null | undefined
  companyFileName: string | null | undefined
  variant?: 'detail' | 'compact'
}) {
  const bankFiles = parseSourceFileList(bankFileName)
  const companyFiles = parseSourceFileList(companyFileName)

  return (
    <div className={`session-source-files session-source-files--${variant}`}>
      <div className="session-source-files-group">
        <span className="session-source-files-label">Archivo banco</span>
        <FileNameList files={bankFiles} emptyLabel="Sin dato de archivo" />
      </div>
      <div className="session-source-files-group">
        <span className="session-source-files-label">Archivo empresa</span>
        <FileNameList files={companyFiles} emptyLabel="Sin dato de archivo" />
      </div>
    </div>
  )
}
