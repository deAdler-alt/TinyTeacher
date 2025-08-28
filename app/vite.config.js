import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TinyTeacher',
        short_name: 'TinyTeacher',
        start_url: '/tinyteacher/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2563eb',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'document' || request.destination === 'script' || request.destination === 'style' || request.destination === 'image' || request.destination === 'font',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'tt-static' }
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith('workers.dev'),
            handler: 'NetworkFirst',
            options: { cacheName: 'tt-proxy' }
          }
        ]
      }
    })
  ],
  base: mode === 'development' ? '/' : '/tinyteacher/'
}))
