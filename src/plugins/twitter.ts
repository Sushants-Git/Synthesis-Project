import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

/** GET /api/twitter/<path>?<params>
 *  Routes through Vite dev proxy → api.twitter.com.
 *  Authorization header is injected server-side in vite.config.ts.
 */
async function twitterGet(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL('/api/twitter' + path, window.location.origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const resp = await fetch(url.toString())

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
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 432 384"><path fill="#000000" d="M383 105v11q0 45-16.5 88.5t-47 79.5t-79 58.5T134 365q-73 0-134-39q10 1 21 1q61 0 109-37q-29-1-51.5-18T48 229q8 2 16 2q12 0 23-4q-30-6-50-30t-20-55v-1q19 10 40 11q-39-27-39-73q0-24 12-44q33 40 79.5 64T210 126q-2-10-2-20q0-36 25.5-61.5T295 19q38 0 64 27q30-6 56-21q-10 31-39 48q27-3 51-13q-18 26-44 45z"/></svg>',
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
