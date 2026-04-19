import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { AppRole } from '../auth/types'

type Props = {
  children: React.ReactNode
  /** Si se indica, solo esos roles pueden entrar */
  roles?: AppRole[]
}

export function ProtectedRoute({ children, roles }: Props) {
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
