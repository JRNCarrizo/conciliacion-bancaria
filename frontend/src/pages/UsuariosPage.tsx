import { Link } from 'react-router-dom'
import './home.css'

/** Placeholder hasta definir login y ABM de usuarios. */
export function UsuariosPage() {
  return (
    <div className="home-app">
      <header className="app-header">
        <p className="subtitle usuarios-back-wrap">
          <Link to="/" className="usuarios-back-link">
            ← Volver al inicio
          </Link>
        </p>
        <h1>Gestión de usuarios</h1>
        <p className="subtitle">
          Esta sección está reservada para cuentas, roles y autenticación cuando indiques los requisitos.
        </p>
      </header>

      <main className="home-main home-main--single">
        <div className="home-module-card usuarios-placeholder">
          <h2>En construcción</h2>
          <p>
            Todavía no hay pantallas aquí. Cuando quieras, podemos definir login (por ejemplo usuario y
            contraseña, recuperación de clave, etc.) y el modelo de usuarios en el backend.
          </p>
        </div>
      </main>
    </div>
  )
}
