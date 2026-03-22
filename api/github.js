export const config = { runtime: 'edge' }

export default async function handler(req) {
  const url = new URL(req.url)
  const targetPath = url.pathname.replace(/^\/api\/github/, '')
  const targetUrl = `https://api.github.com${targetPath}${url.search}`

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'can-vvee-app',
  }
  if (process.env.VITE_GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.VITE_GITHUB_TOKEN}`
  }

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
  })

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
