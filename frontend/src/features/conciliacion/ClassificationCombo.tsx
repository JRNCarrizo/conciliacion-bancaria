import { useEffect, useId, useMemo, useState } from 'react'

export function ClassificationCombo({
  value,
  suggestions,
  onCommit,
  disabled,
  ariaLabel = 'Clasificación',
  placeholder = 'Sin clasificar',
  commitOnBlur = true,
}: {
  value: string | null | undefined
  suggestions: readonly string[]
  onCommit: (v: string) => void
  disabled?: boolean
  ariaLabel?: string
  placeholder?: string
  /** Si es false, solo actualiza el texto local (útil con botón «Aplicar» aparte). */
  commitOnBlur?: boolean
}) {
  const listIdRaw = useId()
  const listId = `clasif-dl-${listIdRaw.replace(/:/g, '')}`
  const normalized = (value ?? '').trim()
  const [text, setText] = useState(normalized)
  useEffect(() => {
    setText((value ?? '').trim())
  }, [value])

  const filteredOptions = useMemo(() => {
    const pool = [...new Set(suggestions)].sort((a, b) => a.localeCompare(b, 'es'))
    const q = text.trim().toLowerCase()
    if (q.length === 0) {
      return pool.slice(0, 50)
    }
    return pool.filter((s) => s.toLowerCase().includes(q)).slice(0, 50)
  }, [suggestions, text])

  return (
    <>
      <datalist id={listId}>
        {filteredOptions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <input
        type="text"
        className="clasif-input"
        list={listId}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(ev) => setText(ev.target.value)}
        onBlur={(ev) => {
          if (!commitOnBlur) return
          const t = ev.currentTarget.value.trim()
          if (t !== normalized) {
            onCommit(t)
          }
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') {
            ev.currentTarget.blur()
          }
        }}
        aria-label={ariaLabel}
      />
    </>
  )
}

/** Expone el texto actual del combo controlado externamente (p. ej. barra de clasificación masiva). */
export function ClassificationComboControlled({
  text,
  onTextChange,
  suggestions,
  disabled,
  ariaLabel = 'Clasificación',
  placeholder = 'Sin clasificar',
  inputId,
}: {
  text: string
  onTextChange: (v: string) => void
  suggestions: readonly string[]
  disabled?: boolean
  ariaLabel?: string
  placeholder?: string
  inputId?: string
}) {
  const listIdRaw = useId()
  const listId = `clasif-dl-${listIdRaw.replace(/:/g, '')}`

  const filteredOptions = useMemo(() => {
    const pool = [...new Set(suggestions)].sort((a, b) => a.localeCompare(b, 'es'))
    const q = text.trim().toLowerCase()
    if (q.length === 0) {
      return pool.slice(0, 50)
    }
    return pool.filter((s) => s.toLowerCase().includes(q)).slice(0, 50)
  }, [suggestions, text])

  return (
    <>
      <datalist id={listId}>
        {filteredOptions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <input
        id={inputId}
        type="text"
        className="clasif-input"
        list={listId}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(ev) => onTextChange(ev.target.value)}
        aria-label={ariaLabel}
      />
    </>
  )
}
