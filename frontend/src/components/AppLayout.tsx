import { Outlet } from 'react-router-dom'
import { AppNavbar } from './AppNavbar'

export function AppLayout() {
  return (
    <>
      <AppNavbar />
      <Outlet />
    </>
  )
}
