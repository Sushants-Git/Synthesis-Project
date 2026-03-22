import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

const BEARER = import.meta.env.VITE_TWITTER_BEARER_TOKEN as string | undefined

/** GET /api/twitter/<path>?<params> via Vite proxy → api.twitter.com */
async function twitterGet(path: string, params: Record<string, string>): Promise<unknown> {
  if (!BEARER) throw new Error('VITE_TWITTER_BEARER_TOKEN not set in .env')

  const url = new URL('/api/twitter' + path, window.location.origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${BEARER}` },
  })

  const text = await resp.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { throw new Error(`Twitter non-JSON response: ${text.slice(0, 200)}`) }

  if (!resp.ok) {
    const err = (json as { detail?: string; title?: string })
    throw new Error(`Twitter ${resp.status}: ${err.detail ?? err.title ?? text.slice(0, 200)}`)
  }
  return json
}

export const TwitterPlugin: Plugin = {
  id: 'twitter',
  name: 'Twitter / X',
  description: 'Search Twitter/X for users by topic, look up handles',
  aiDescription:
    'Twitter/X plugin. Actions: ' +
    'search_users (find Twitter users by topic — e.g. "ZK builders", "Solidity devs" — returns ranked handles + follower counts), ' +
    'verify_handle (look up a handle and return name, bio, follower count). ' +
    'Use search_users when the user wants to find someone by expertise rather than address.',
  icon: '🐦',
  color: 'light-blue',
  category: 'hard',
  capabilities: [
    {
      action: 'search_users',
      label: 'Search Twitter Users',
      description: 'Find Twitter users matching a topic or criteria',
      params: [
        { key: 'query', label: 'Topic / Criteria', placeholder: 'ZK builder', inputType: 'text', required: true },
        { key: 'limit', label: 'Max results', placeholder: '5', inputType: 'text', required: false },
      ],
      outputs: ['twitter_results', 'top_handle', 'handles_json'],
    },
    {
      action: 'verify_handle',
      label: 'Lookup Handle',
      description: 'Get profile info for a Twitter handle',
      params: [
        { key: 'handle', label: 'Twitter Handle', placeholder: '@vitalikbuterin', inputType: 'text', required: true },
      ],
      outputs: ['verified_handle', 'display_name', 'followers', 'bio'],
    },
    {
      action: 'user_approval',
      label: 'User Picks',
      description: 'Show results and let user pick one to proceed',
      params: [],
      outputs: ['selected_handle'],
      requiresApproval: true,
    },
  ],

  async execute(action, params, ctx: ExecutionContext): Promise<PluginResult> {
    switch (action) {
      case 'search_users': {
        const query = params.query ?? ctx.inputs.query ?? ctx.resolved.query
        if (!query) return { status: 'error', error: 'Search query required' }
        const limit = Math.min(parseInt(params.limit ?? ctx.inputs.limit ?? '5', 10), 10)

        let data: {
          data?: Array<{ id: string; author_id?: string }>
          includes?: { users?: Array<{ id: string; username: string; name: string; public_metrics?: { followers_count: number }; description?: string }> }
        }

        try {
          // Search recent tweets by topic, expand author info
          data = await twitterGet('/2/tweets/search/recent', {
            query: query + ' -is:retweet lang:en',
            max_results: '10',
            expansions: 'author_id',
            'user.fields': 'name,username,public_metrics,description',
            'tweet.fields': 'author_id',
          }) as typeof data
        } catch (e) {
          return { status: 'error', error: e instanceof Error ? e.message : String(e) }
        }

        const users = data.includes?.users ?? []
        // Deduplicate and sort by followers
        const seen = new Set<string>()
        const unique = users
          .filter((u) => { if (seen.has(u.id)) return false; seen.add(u.id); return true })
          .sort((a, b) => (b.public_metrics?.followers_count ?? 0) - (a.public_metrics?.followers_count ?? 0))
          .slice(0, limit)

        if (unique.length === 0) {
          return { status: 'done', outputs: { twitter_results: 'No results found', top_handle: '', handles_json: '[]' }, display: `No results for "${query}"` }
        }

        const lines = unique.map((u) => {
          const followers = u.public_metrics?.followers_count ?? 0
          const bio = u.description ? ` — ${u.description.slice(0, 60)}` : ''
          return `@${u.username} (${u.name}, ${followers.toLocaleString()} followers${bio})`
        })

        const topHandle = `@${unique[0].username}`
        const handlesJson = JSON.stringify(unique.map((u) => `@${u.username}`))

        return {
          status: 'done',
          outputs: {
            twitter_results: lines.join('\n'),
            top_handle: topHandle,
            handles_json: handlesJson,
          },
          display: `Found ${unique.length} users for "${query}" — top: ${topHandle}`,
        }
      }

      case 'verify_handle': {
        const raw = params.handle ?? ctx.inputs.handle ?? ctx.resolved.handle ?? ctx.resolved.top_handle
        if (!raw) return { status: 'error', error: 'Handle required' }
        const handle = raw.replace(/^@/, '')

        let data: {
          data?: { id: string; username: string; name: string; description?: string; public_metrics?: { followers_count: number } }
          errors?: Array<{ detail: string }>
        }

        try {
          data = await twitterGet(`/2/users/by/username/${handle}`, {
            'user.fields': 'public_metrics,description',
          }) as typeof data
        } catch (e) {
          return { status: 'error', error: e instanceof Error ? e.message : String(e) }
        }

        if (!data.data) {
          const detail = data.errors?.[0]?.detail ?? `@${handle} not found`
          return { status: 'error', error: detail }
        }

        const u = data.data
        const followers = u.public_metrics?.followers_count ?? 0
        return {
          status: 'done',
          outputs: {
            verified_handle: `@${u.username}`,
            display_name: u.name,
            followers: String(followers),
            bio: u.description ?? '',
          },
          display: `@${u.username} — ${u.name} (${followers.toLocaleString()} followers)`,
        }
      }

      case 'user_approval':
        return {
          status: 'waiting',
          display: ctx.resolved.twitter_results
            ? `Pick from:\n${ctx.resolved.twitter_results}`
            : 'Waiting for selection…',
        }

      default:
        return { status: 'error', error: `Unknown action: ${action}` }
    }
  },
}
