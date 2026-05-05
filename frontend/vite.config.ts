import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Build para JAR: salida a resources/static del backend (mvn package).
const backendStatic = '../backend/src/main/resources/static'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: backendStatic,
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  /** Mismo proxy que en dev: `vite preview` y pruebas del build necesitan llegar al backend en :8080 */
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
