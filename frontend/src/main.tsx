import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { syncAuthWithServerInstance } from './auth/serverInstance'
import './index.css'
import App from './App.tsx'

void syncAuthWithServerInstance().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
