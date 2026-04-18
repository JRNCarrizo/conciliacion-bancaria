import { Link } from 'react-router-dom'
import './home.css'

export function HomePage() {
  return (
    <div className="home-app">
      <header className="app-header">
        <h1>Sistema de conciliación</h1>
        <p className="subtitle">Elegí un módulo para continuar</p>
      </header>

      <main className="home-main">
        <Link to="/conciliacion" className="home-module-card">
          <h2>Conciliación bancaria</h2>
          <p>
            Importación de extractos y libro, sesiones, conciliación automática y manual, exportación
            y cierre.
          </p>
        </Link>

        <Link to="/usuarios" className="home-module-card home-module-card--secondary">
          <span className="home-module-badge">Próximamente</span>
          <h2>Gestión de usuarios</h2>
          <p>Administración de cuentas y permisos. El acceso con login se agregará en una próxima etapa.</p>
        </Link>
      </main>
    </div>
  )
}
