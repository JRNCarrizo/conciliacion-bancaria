import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import './home.css'

export function HomePage() {
  const { user } = useAuth()

  return (
    <div className="home-app">
      <header className="home-page-header">
        <h1 className="home-page-title">Inicio</h1>
        <p className="subtitle">Elegí un módulo para continuar</p>
      </header>

      <main className="home-main">
        <Link to="/conciliacion" className="home-module-card home-module-card--interactive">
          <h2>Conciliación bancaria</h2>
          <p>
            Importación de extractos y libro, sesiones, conciliación automática y manual, exportación
            y cierre.
          </p>
        </Link>

        {user?.role === 'ADMIN' ? (
          <Link to="/usuarios" className="home-module-card home-module-card--secondary home-module-card--interactive">
            <h2>Gestión de usuarios</h2>
            <p>Alta de cuentas y roles (Administrador, Operador, Consulta).</p>
          </Link>
        ) : (
          <div className="home-module-card home-module-card--secondary home-module-card--muted">
            <h2>Gestión de usuarios</h2>
            <p>Solo el administrador puede gestionar usuarios. Iniciá sesión con un perfil administrador.</p>
          </div>
        )}
      </main>
    </div>
  )
}
