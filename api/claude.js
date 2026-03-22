export const config = { runtime: 'edge' }

export default async function handler(req) {
  const url = new URL(req.url)
  const targetPath = url.pathname.replace(/^\/api\/claude/, '')
  const targetUrl = `https://api.anthropic.com${targetPath}${url.search}`

  const response = await fetch(targetUrl, {
    method: req.method,
    headers: {
      'x-api-key': process.env.VITE_ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
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
