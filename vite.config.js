import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/presyo-api': {
        target: 'https://presyo.icsc.ngo',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/presyo-api/, '/api'),
      },
    },
  },
})