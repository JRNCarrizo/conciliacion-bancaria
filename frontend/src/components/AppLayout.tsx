import { Outlet } from 'react-router-dom'
import { AppNavbar } from './AppNavbar'

export function AppLayout() {
  return (
    <>
      <AppNavbar />
      <main className="app-layout-main">
        <Outlet />
      </main>
    </>
  )
}
