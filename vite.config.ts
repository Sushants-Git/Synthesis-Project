import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const twitterBearer = env.VITE_TWITTER_BEARER_TOKEN ?? ''

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Proxy /api/twitter/* → https://api.twitter.com/*
        // Auth header is injected here in Node.js — never sent by the browser
        '/api/twitter': {
          target: 'https://api.twitter.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/twitter/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${twitterBearer}`)
            })
          },
        },
      },
    },
  }
})
