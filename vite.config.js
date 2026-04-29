import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    watch: {
      ignored: [
        '**/backend/**',        // 🔥 MAIN FIX
        '**/.wwebjs_auth/**',   // 🔥 whatsapp session folder
        '**/node_modules/**'
      ]
    }
  }
})