import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Great American Hearts',
        short_name: 'Trump Hearts',
        description: 'A tremendous multiplayer card game',
        theme_color: '#0A3161',
        background_color: '#0A3161',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon.jpg',
            sizes: '192x192',
            type: 'image/jpeg'
          },
          {
            src: 'icon.jpg',
            sizes: '512x512',
            type: 'image/jpeg'
          }
        ]
      }
    })
  ],
})
