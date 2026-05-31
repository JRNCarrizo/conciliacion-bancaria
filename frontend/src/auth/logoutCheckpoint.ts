export type LogoutCheckpointContext = {
  sessionId: number
}

type LogoutCheckpointProvider = () => LogoutCheckpointContext | null

let provider: LogoutCheckpointProvider | null = null

/** Conciliación registra si hay sesión abierta en pantalla al salir del sistema. */
export function registerLogoutCheckpointProvider(fn: LogoutCheckpointProvider): () => void {
  provider = fn
  return () => {
    if (provider === fn) provider = null
  }
}

export function getLogoutCheckpointContext(): LogoutCheckpointContext | null {
  return provider?.() ?? null
}
