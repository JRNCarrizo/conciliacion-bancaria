export type AppRole = 'ADMIN' | 'OPERADOR' | 'CONSULTA'

export type AuthUser = {
  username: string
  role: AppRole
  /** ID numérico en servidor (mensajes, chat). */
  userId: number
}
