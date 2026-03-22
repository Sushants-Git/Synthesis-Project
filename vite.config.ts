import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const twitterBearer = env.VITE_TWITTER_BEARER_TOKEN ?? ''
  const openaiKey = env.VITE_OPENAI_API_KEY ?? ''
  const claudeKey = env.VITE_ANTHROPIC_API_KEY ?? ''
  const githubToken = env.VITE_GITHUB_TOKEN ?? ''

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

        // Proxy /api/github/* → https://api.github.com/*
        // Auth header injected server-side (60 req/hr anon → 5000/hr with token)
        '/api/github': {
          target: 'https://api.github.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/github/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (githubToken) proxyReq.setHeader('Authorization', `token ${githubToken}`)
              proxyReq.setHeader('Accept', 'application/vnd.github.v3+json')
              proxyReq.setHeader('User-Agent', 'canvii-app')
            })
          },
        },

        // Proxy /api/openai/* → https://api.openai.com/*
        '/api/openai': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/openai/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${openaiKey}`)
            })
          },
        },

        // Proxy /api/claude/* → https://api.anthropic.com/*
        '/api/claude': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/claude/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('x-api-key', claudeKey)
              proxyReq.setHeader('anthropic-version', '2023-06-01')
            })
          },
        },
      },
    },
  }
})
