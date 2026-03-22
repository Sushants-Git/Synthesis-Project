import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

async function twitterGet(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL('/api/twitter' + path, window.location.origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const resp = await fetch(url.toString())
  const text = await resp.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { throw new Error(`Twitter non-JSON: ${text.slice(0, 200)}`) }

  if (!resp.ok) {
    const err = (json as { detail?: string; title?: string })
    throw new Error(`Twitter ${resp.status}: ${err.detail ?? err.title ?? text.slice(0, 200)}`)
  }
  return json
}

export const TwitterPlugin: Plugin = {
  id: 'twitter',
  name: 'Twitter / X',
  description: 'Search Twitter/X for users by topic, look up handles, fetch batch profiles',
  aiDescription:
    'Twitter/X plugin. FIVE DISTINCT ACTIONS — choose carefully: ' +
    'search_users: discovers users by topic query. Use when targets are unknown ("find ZK builders"). Outputs handles[] (all found) and top_handle (single best). ' +
    'get_profiles: fetches profile info (bio, followers) for KNOWN handles. Outputs profiles[] (for GPT) AND handles[] (pass-through for filtering). ' +
    'get_tweets: fetches recent tweets for a SINGLE handle. Outputs tweets[] and tweet_count. ' +
    'get_batch_tweets: fetches recent tweets for MULTIPLE handles at once. Outputs tweets[] prefixed with "@handle: text" — ideal for GPT scoring across a group. Wire: get_profiles:handles→get_batch_tweets:handles (auto-matched). ' +
    'verify_handle: single handle detail lookup. ' +
    'TWEET FETCH PATTERN: get_profiles → get_batch_tweets → chatgpt:process → util:filter. ' +
    'CRITICAL: Twitter handles are NOT ENS names. Never append .eth to a handle.',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 432 384"><path fill="#000000" d="M383 105v11q0 45-16.5 88.5t-47 79.5t-79 58.5T134 365q-73 0-134-39q10 1 21 1q61 0 109-37q-29-1-51.5-18T48 229q8 2 16 2q12 0 23-4q-30-6-50-30t-20-55v-1q19 10 40 11q-39-27-39-73q0-24 12-44q33 40 79.5 64T210 126q-2-10-2-20q0-36 25.5-61.5T295 19q38 0 64 27q30-6 56-21q-10 31-39 48q27-3 51-13q-18 26-44 45z"/></svg>',
  color: 'light-blue',
  category: 'hard',
  capabilities: [
    {
      action: 'search_users',
      label: 'Search Twitter Users',
      description: 'Find Twitter users matching a topic or criteria',
      inputs: [
        { key: 'query', label: 'Topic / Criteria', type: 'string', required: true, placeholder: 'ZK builder' },
        { key: 'limit', label: 'Max results', type: 'string', required: false, placeholder: '5' },
      ],
      outputs: [
        { key: 'handles', label: 'Twitter Handles', type: 'string[]' },
        { key: 'top_handle', label: 'Top Handle', type: 'string' },
      ],
    },
    {
      action: 'verify_handle',
      label: 'Lookup Handle',
      description: 'Get profile info for a Twitter handle',
      inputs: [
        { key: 'handle', label: 'Twitter Handle', type: 'string', required: true, placeholder: '@vitalikbuterin' },
      ],
      outputs: [
        { key: 'handle', label: 'Verified Handle', type: 'string' },
        { key: 'name', label: 'Display Name', type: 'string' },
        { key: 'followers', label: 'Followers', type: 'string' },
        { key: 'bio', label: 'Bio', type: 'string' },
      ],
    },
    {
      action: 'get_profiles',
      label: 'Get Profiles',
      description: 'Batch fetch profile info for a list of Twitter handles',
      inputs: [
        { key: 'handles', label: 'Twitter Handles', type: 'string[]', required: true, placeholder: '@vitalikbuterin, @naval' },
      ],
      outputs: [
        { key: 'profiles', label: 'Profile Strings', type: 'string[]' },
        { key: 'handles', label: 'Handles (pass-through)', type: 'string[]' },
        { key: 'summary', label: 'Summary', type: 'string' },
      ],
    },
    {
      action: 'get_tweets',
      label: 'Get Tweets',
      description: 'Fetch recent tweets for a single Twitter handle',
      inputs: [
        { key: 'handle', label: 'Twitter Handle', type: 'string', required: true, placeholder: '@vitalikbuterin' },
        { key: 'count', label: 'Number of tweets', type: 'string', required: false, placeholder: '10' },
      ],
      outputs: [
        { key: 'tweets', label: 'Tweet Texts', type: 'string[]' },
        { key: 'handle', label: 'Handle', type: 'string' },
        { key: 'tweet_count', label: 'Tweet Count', type: 'string' },
      ],
    },
    {
      action: 'get_batch_tweets',
      label: 'Get Tweets (Batch)',
      description: 'Fetch recent tweets for multiple handles. Each tweet is prefixed with "@handle:" for GPT context.',
      inputs: [
        { key: 'handles', label: 'Twitter Handles', type: 'string[]', required: true },
        { key: 'count', label: 'Tweets per user', type: 'string', required: false, placeholder: '5' },
      ],
      outputs: [
        { key: 'tweets', label: 'All Tweets', type: 'string[]' },
        { key: 'handles', label: 'Handles (pass-through)', type: 'string[]' },
        { key: 'tweet_count', label: 'Total Tweet Count', type: 'string' },
      ],
    },
    {
      action: 'user_approval',
      label: 'User Picks',
      description: 'Show results and let user pick one to proceed',
      inputs: [],
      outputs: [],
      requiresApproval: true,
    },
  ],

  async execute(action, inputs, _ctx: ExecutionContext): Promise<PluginResult> {
    switch (action) {
      case 'search_users': {
        const query = inputs.query as string
        if (!query) return { status: 'error', error: 'Search query required' }
        const limit = Math.min(parseInt((inputs.limit as string) ?? '5', 10), 10)

        let data: {
          data?: Array<{ id: string; author_id?: string }>
          includes?: { users?: Array<{ id: string; username: string; name: string; public_metrics?: { followers_count: number }; description?: string }> }
        }

        try {
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
        const seen = new Set<string>()
        const unique = users
          .filter((u) => { if (seen.has(u.id)) return false; seen.add(u.id); return true })
          .sort((a, b) => (b.public_metrics?.followers_count ?? 0) - (a.public_metrics?.followers_count ?? 0))
          .slice(0, limit)

        if (unique.length === 0) {
          return { status: 'done', outputs: { handles: [], top_handle: '' }, display: `No results for "${query}"` }
        }

        const handles = unique.map((u) => `@${u.username}`)
        const topHandle = handles[0]!

        return {
          status: 'done',
          outputs: { handles, top_handle: topHandle },
          display: `Found ${unique.length} users for "${query}" — top: ${topHandle}`,
        }
      }

      case 'verify_handle': {
        const raw = inputs.handle as string
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
          return { status: 'error', error: data.errors?.[0]?.detail ?? `@${handle} not found` }
        }

        const u = data.data
        const followers = u.public_metrics?.followers_count ?? 0
        return {
          status: 'done',
          outputs: {
            handle: `@${u.username}`,
            name: u.name,
            followers: String(followers),
            bio: u.description ?? '',
          },
          display: `@${u.username} — ${u.name} (${followers.toLocaleString()} followers)`,
        }
      }

      case 'get_profiles': {
        const rawHandles = inputs.handles
        if (!rawHandles || (Array.isArray(rawHandles) && rawHandles.length === 0)) {
          return { status: 'error', error: 'Handles array required' }
        }
        const handleList = (Array.isArray(rawHandles) ? rawHandles : [rawHandles as string])
          .map((h) => h.replace(/^@/, ''))
          .slice(0, 100) // Twitter API limit

        let data: {
          data?: Array<{ id: string; username: string; name: string; description?: string; public_metrics?: { followers_count: number } }>
          errors?: Array<{ detail: string }>
        }

        try {
          data = await twitterGet('/2/users/by', {
            usernames: handleList.join(','),
            'user.fields': 'public_metrics,description',
          }) as typeof data
        } catch (e) {
          return { status: 'error', error: e instanceof Error ? e.message : String(e) }
        }

        const users = data.data ?? []
        if (users.length === 0) {
          return { status: 'done', outputs: { profiles: [], summary: 'No profiles found' }, display: 'No profiles found' }
        }

        const profiles = users.map((u) => {
          const followers = u.public_metrics?.followers_count ?? 0
          const bio = u.description ? ` | Bio: ${u.description.slice(0, 100)}` : ''
          return `@${u.username} (${u.name}) | ${followers.toLocaleString()} followers${bio}`
        })

        // Also pass back the handles in order so they can be used in util:filter:items
        const resolvedHandles = users.map((u) => `@${u.username}`)

        return {
          status: 'done',
          outputs: {
            profiles,
            handles: resolvedHandles,
            summary: `Fetched ${users.length} profiles`,
          },
          display: `Fetched ${users.length} profile${users.length !== 1 ? 's' : ''}`,
        }
      }

      case 'get_tweets': {
        const raw = inputs.handle as string
        if (!raw) return { status: 'error', error: 'Handle required' }
        const handle = raw.replace(/^@/, '')
        const count = Math.min(parseInt((inputs.count as string | undefined) ?? '10', 10), 100)

        // Resolve handle → user ID
        let userData: { data?: { id: string; username: string }; errors?: Array<{ detail: string }> }
        try {
          userData = await twitterGet(`/2/users/by/username/${handle}`, {}) as typeof userData
        } catch (e) {
          return { status: 'error', error: e instanceof Error ? e.message : String(e) }
        }
        if (!userData.data) {
          return { status: 'error', error: userData.errors?.[0]?.detail ?? `@${handle} not found` }
        }

        // Fetch tweets
        let tweetData: { data?: Array<{ id: string; text: string }>; errors?: Array<{ detail: string }> }
        try {
          tweetData = await twitterGet(`/2/users/${userData.data.id}/tweets`, {
            max_results: String(Math.max(5, count)),
            'tweet.fields': 'text',
            exclude: 'retweets,replies',
          }) as typeof tweetData
        } catch (e) {
          return { status: 'error', error: e instanceof Error ? e.message : String(e) }
        }

        const tweets = (tweetData.data ?? []).map((t) => t.text)
        return {
          status: 'done',
          outputs: {
            tweets,
            handle: `@${userData.data.username}`,
            tweet_count: String(tweets.length),
          },
          display: `Fetched ${tweets.length} tweets from @${userData.data.username}`,
        }
      }

      case 'get_batch_tweets': {
        const rawHandles = inputs.handles
        if (!rawHandles || (Array.isArray(rawHandles) && rawHandles.length === 0)) {
          return { status: 'error', error: 'Handles array required' }
        }
        const handleList = (Array.isArray(rawHandles) ? rawHandles : [rawHandles as string])
          .map((h) => h.replace(/^@/, ''))
          .slice(0, 20) // keep it reasonable for API rate limits
        const perUser = Math.min(parseInt((inputs.count as string | undefined) ?? '5', 10), 20)

        // Batch resolve handles → user IDs
        let usersData: { data?: Array<{ id: string; username: string }>; errors?: Array<{ detail: string }> }
        try {
          usersData = await twitterGet('/2/users/by', { usernames: handleList.join(',') }) as typeof usersData
        } catch (e) {
          return { status: 'error', error: e instanceof Error ? e.message : String(e) }
        }

        const users = usersData.data ?? []
        if (users.length === 0) {
          return { status: 'done', outputs: { tweets: [], handles: [], tweet_count: '0' }, display: 'No users found' }
        }

        // Fetch tweets per user (sequential to avoid rate limiting)
        const allTweets: string[] = []
        for (const user of users) {
          try {
            const tweetData = await twitterGet(`/2/users/${user.id}/tweets`, {
              max_results: String(Math.max(5, perUser)),
              'tweet.fields': 'text',
              exclude: 'retweets,replies',
            }) as { data?: Array<{ text: string }> }
            const userTweets = tweetData.data ?? []
            for (const t of userTweets) {
              allTweets.push(`@${user.username}: ${t.text}`)
            }
          } catch {
            // Skip users whose timeline we can't read (protected accounts, etc.)
          }
        }

        const resolvedHandles = users.map((u) => `@${u.username}`)
        return {
          status: 'done',
          outputs: {
            tweets: allTweets,
            handles: resolvedHandles,
            tweet_count: String(allTweets.length),
          },
          display: `Fetched ${allTweets.length} tweets from ${users.length} users`,
        }
      }

      case 'user_approval':
        return { status: 'waiting', display: 'Waiting for user selection…' }

      default:
        return { status: 'error', error: `Unknown action: ${action}` }
    }
  },
}
