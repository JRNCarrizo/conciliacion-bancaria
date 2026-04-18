import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeToggle } from './components/ThemeToggle'
import { ConciliacionPage } from './features/conciliacion'
import { HomePage } from './pages/HomePage'
import { UsuariosPage } from './pages/UsuariosPage'

/**
 * Shell de la aplicación. Nuevos módulos de la plataforma: agregar <Route> aquí
 * (o anidar rutas bajo un layout común).
 */
export default function App() {
  return (
    <BrowserRouter>
      <ThemeToggle />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/conciliacion" element={<ConciliacionPage />} />
        <Route path="/usuarios" element={<UsuariosPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
