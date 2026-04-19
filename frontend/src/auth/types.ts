export type AppRole = 'ADMIN' | 'OPERADOR' | 'CONSULTA'

export type AuthUser = {
  username: string
  role: AppRole
}
