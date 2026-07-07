import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../../api/client'
import { parseError } from './http'

/**
 * Obtiene una URL blob para mostrar en <img> o similar; el fetch incluye Bearer.
 * Revoca el blob al cambiar la ruta o al desmontar.
 */
export function useAuthenticatedBlobUrl(apiPath: string | null | undefined): {
  blobUrl: string | null
  loading: boolean
  error: string | null
} {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!apiPath) {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
      setBlobUrl(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setBlobUrl(null)

    ;(async () => {
      try {
        const r = await apiFetch(apiPath)
        if (cancelled) return
        if (!r.ok) {
          setError(await parseError(r))
          return
        }
        const blob = await r.blob()
        if (cancelled) return
        const u = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(u)
          return
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = u
        setBlobUrl(u)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [apiPath])

  return { blobUrl, loading, error }
}

export async function downloadAuthenticatedFile(apiPath: string, filename: string): Promise<void> {
  const r = await apiFetch(apiPath)
  if (!r.ok) throw new Error(await parseError(r))
  const blob = await r.blob()
  const u = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = u
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(u)
  }
}

/** Abre el archivo en una nueva pestaña (útil para PDF); blob incluye auth vía fetch previo. */
export async function openAuthenticatedFileInNewTab(apiPath: string): Promise<void> {
  const r = await apiFetch(apiPath)
  if (!r.ok) throw new Error(await parseError(r))
  const blob = await r.blob()
  const u = URL.createObjectURL(blob)
  const w = window.open(u, '_blank', 'noopener,noreferrer')
  if (!w) {
    URL.revokeObjectURL(u)
    throw new Error('El navegador bloqueó la ventana emergente.')
  }
  setTimeout(() => URL.revokeObjectURL(u), 300_000)
}
