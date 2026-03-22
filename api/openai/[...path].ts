export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const targetPath = url.pathname.replace(/^\/api\/openai/, '')
  const targetUrl = `https://api.openai.com${targetPath}${url.search}`

  const headers = new Headers()
  headers.set('Authorization', `Bearer ${process.env.VITE_OPENAI_API_KEY}`)
  headers.set('Content-Type', 'application/json')

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
