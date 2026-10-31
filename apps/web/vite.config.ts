import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: { allow: [repoRoot] },
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/docs': 'http://127.0.0.1:3000',
    },
  },
})
