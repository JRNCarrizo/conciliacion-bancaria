import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ChatDrawer, ChatPanelProvider } from './features/chat'
import { ConciliacionPage } from './features/conciliacion'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { SetupPage } from './pages/SetupPage'
import { UsuariosPage } from './pages/UsuariosPage'

/**
 * Shell de la aplicación. Nuevos módulos: agregar <Route> dentro del layout con <AppLayout />.
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ChatPanelProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route
                path="/conciliacion"
                element={
                  <ProtectedRoute roles={['ADMIN', 'OPERADOR', 'CONSULTA']}>
                    <ConciliacionPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/mensajes" element={<Navigate to="/" replace />} />
              <Route
                path="/usuarios"
                element={
                  <ProtectedRoute roles={['ADMIN']}>
                    <UsuariosPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          <ChatDrawer />
        </ChatPanelProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}
