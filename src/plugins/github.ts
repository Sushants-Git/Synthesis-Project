import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

async function githubGet(path: string): Promise<unknown> {
  const url = '/api/github' + path
  const resp = await fetch(url, { headers: { Accept: 'application/vnd.github.v3+json' } })
  const text = await resp.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { throw new Error(`GitHub non-JSON: ${text.slice(0, 200)}`) }

  if (!resp.ok) {
    const err = json as { message?: string }
    throw new Error(`GitHub ${resp.status}: ${err.message ?? text.slice(0, 200)}`)
  }
  return json
}

export const GitHubPlugin: Plugin = {
  id: 'github',
  name: 'GitHub',
  description: 'Fetch GitHub user profiles, repos, stars, contributors, and activity',
  aiDescription:
    'GitHub plugin — fetch public data from GitHub API. ' +
    'get_user(username*) → profile (GPT-ready summary), username, name, followers, public_repos, bio. ' +
    'get_repos(username*, sort?, limit?) → repos[] (formatted "repo: N stars, language"), repo_names[], total_stars. sort: stars|updated|pushed (default: stars). ' +
    'get_repo_stats(username*, repo*) → stars, forks, watchers, open_issues, language, description. ' +
    'get_contributors(username*, repo*, limit?) → contributors[] (formatted "@user: N commits"), contributor_names[]. ' +
    'Wire to chatgpt:process for scoring/analysis. Wire repos[]→chatgpt:items to score open-source activity. ' +
    'For public goods scoring: get_user → get_repos → chatgpt:process.',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#000000" d="M12 .297c-6.63 0-12 5.373-12 12c0 5.303 3.438 9.8 8.205 11.385c.6.113.82-.258.82-.577c0-.285-.01-1.04-.015-2.04c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729c1.205.084 1.838 1.236 1.838 1.236c1.07 1.835 2.809 1.305 3.495.998c.108-.776.417-1.305.76-1.605c-2.665-.3-5.466-1.332-5.466-5.93c0-1.31.465-2.38 1.235-3.22c-.135-.303-.54-1.523.105-3.176c0 0 1.005-.322 3.3 1.23c.96-.267 1.98-.399 3-.405c1.02.006 2.04.138 3 .405c2.28-1.552 3.285-1.23 3.285-1.23c.645 1.653.24 2.873.12 3.176c.765.84 1.23 1.91 1.23 3.22c0 4.61-2.805 5.625-5.475 5.92c.42.36.81 1.096.81 2.22c0 1.606-.015 2.896-.015 3.286c0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
  color: 'grey',
  prizeTrack: 'Octant: Agents for Public Goods Data Collection',
  capabilities: [
    {
      action: 'get_user',
      label: 'Get User Profile',
      description: 'Fetch a GitHub user\'s profile — followers, repos, bio',
      inputs: [
        { key: 'username', label: 'GitHub Username', type: 'string', required: true, placeholder: 'torvalds' },
      ],
      outputs: [
        { key: 'profile', label: 'Profile Summary', type: 'string' },
        { key: 'username', label: 'Username', type: 'string' },
        { key: 'name', label: 'Display Name', type: 'string' },
        { key: 'followers', label: 'Followers', type: 'string' },
        { key: 'public_repos', label: 'Public Repos', type: 'string' },
        { key: 'bio', label: 'Bio', type: 'string' },
      ],
    },
    {
      action: 'get_repos',
      label: 'Get Repos',
      description: 'List a user\'s public repos sorted by stars',
      inputs: [
        { key: 'username', label: 'GitHub Username', type: 'string', required: true, placeholder: 'torvalds' },
        { key: 'sort', label: 'Sort by', type: 'string', required: false, placeholder: 'stars' },
        { key: 'limit', label: 'Max repos', type: 'string', required: false, placeholder: '10' },
      ],
      outputs: [
        { key: 'repos', label: 'Repo Summaries', type: 'string[]' },
        { key: 'repo_names', label: 'Repo Names', type: 'string[]' },
        { key: 'total_stars', label: 'Total Stars', type: 'string' },
      ],
    },
    {
      action: 'get_repo_stats',
      label: 'Get Repo Stats',
      description: 'Fetch stats for a specific repo — stars, forks, issues',
      inputs: [
        { key: 'username', label: 'GitHub Username', type: 'string', required: true, placeholder: 'torvalds' },
        { key: 'repo', label: 'Repo Name', type: 'string', required: true, placeholder: 'linux' },
      ],
      outputs: [
        { key: 'stars', label: 'Stars', type: 'string' },
        { key: 'forks', label: 'Forks', type: 'string' },
        { key: 'watchers', label: 'Watchers', type: 'string' },
        { key: 'open_issues', label: 'Open Issues', type: 'string' },
        { key: 'language', label: 'Language', type: 'string' },
        { key: 'description', label: 'Description', type: 'string' },
      ],
    },
    {
      action: 'get_contributors',
      label: 'Get Contributors',
      description: 'Fetch top contributors for a repo',
      inputs: [
        { key: 'username', label: 'GitHub Username', type: 'string', required: true, placeholder: 'torvalds' },
        { key: 'repo', label: 'Repo Name', type: 'string', required: true, placeholder: 'linux' },
        { key: 'limit', label: 'Max contributors', type: 'string', required: false, placeholder: '10' },
      ],
      outputs: [
        { key: 'contributors', label: 'Contributor Summaries', type: 'string[]' },
        { key: 'contributor_names', label: 'Contributor Usernames', type: 'string[]' },
      ],
    },
  ],

  async execute(action, inputs, _ctx: ExecutionContext): Promise<PluginResult> {
    switch (action) {
      case 'get_user': {
        const username = (inputs.username as string)?.trim()
        if (!username) return { status: 'error', error: 'Username required' }

        type GHUser = {
          login: string; name?: string; bio?: string; followers: number
          following: number; public_repos: number; public_gists: number
          html_url: string; company?: string; location?: string; blog?: string
          created_at: string
        }

        let user: GHUser
        try {
          user = await githubGet(`/users/${encodeURIComponent(username)}`) as GHUser
        } catch (e) {
          return { status: 'error', error: e instanceof Error ? e.message : String(e) }
        }

        const joinYear = new Date(user.created_at).getFullYear()
        const parts = [
          `@${user.login}`,
          user.name ? `(${user.name})` : '',
          `| ${user.followers.toLocaleString()} followers`,
          `| ${user.public_repos} public repos`,
          user.bio ? `| Bio: ${user.bio.slice(0, 120)}` : '',
          user.company ? `| Company: ${user.company}` : '',
          user.location ? `| Location: ${user.location}` : '',
          `| Joined: ${joinYear}`,
        ].filter(Boolean).join(' ')

        return {
          status: 'done',
          outputs: {
            profile: parts,
            username: user.login,
            name: user.name ?? user.login,
            followers: String(user.followers),
            public_repos: String(user.public_repos),
            bio: user.bio ?? '',
          },
          display: `@${user.login} — ${user.followers.toLocaleString()} followers, ${user.public_repos} repos`,
          link: user.html_url,
        }
      }

      case 'get_repos': {
        const username = (inputs.username as string)?.trim()
        if (!username) return { status: 'error', error: 'Username required' }
        const sort = (inputs.sort as string) || 'stars'
        const limit = Math.min(parseInt((inputs.limit as string) || '10', 10), 100)

        const validSorts = ['stars', 'updated', 'pushed', 'full_name', 'created']
        const sortParam = validSorts.includes(sort) ? sort : 'stars'

        type GHRepo = {
          name: string; description?: string; stargazers_count: number
          forks_count: number; language?: string; html_url: string
          updated_at: string; topics?: string[]
        }

        let repos: GHRepo[]
        try {
          repos = await githubGet(
            `/users/${encodeURIComponent(username)}/repos?sort=${sortParam}&per_page=${limit}&type=owner`
          ) as GHRepo[]
        } catch (e) {
          return { status: 'error', error: e instanceof Error ? e.message : String(e) }
        }

        if (!Array.isArray(repos) || repos.length === 0) {
          return { status: 'done', outputs: { repos: [], repo_names: [], total_stars: '0' }, display: 'No repos found' }
        }

        const sorted = sortParam === 'stars'
          ? repos.sort((a, b) => b.stargazers_count - a.stargazers_count)
          : repos

        const repoSummaries = sorted.map((r) => {
          const lang = r.language ? ` [${r.language}]` : ''
          const desc = r.description ? ` — ${r.description.slice(0, 80)}` : ''
          return `${r.name}: ${r.stargazers_count.toLocaleString()} ★, ${r.forks_count} forks${lang}${desc}`
        })

        const totalStars = sorted.reduce((sum, r) => sum + r.stargazers_count, 0)

        return {
          status: 'done',
          outputs: {
            repos: repoSummaries,
            repo_names: sorted.map((r) => r.name),
            total_stars: String(totalStars),
          },
          display: `${repos.length} repos, ${totalStars.toLocaleString()} total stars`,
        }
      }

      case 'get_repo_stats': {
        const username = (inputs.username as string)?.trim()
        const repo = (inputs.repo as string)?.trim()
        if (!username) return { status: 'error', error: 'Username required' }
        if (!repo) return { status: 'error', error: 'Repo name required' }

        type GHRepoDetail = {
          stargazers_count: number; forks_count: number; watchers_count: number
          open_issues_count: number; language?: string; description?: string
          html_url: string; name: string
        }

        let r: GHRepoDetail
        try {
          r = await githubGet(`/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}`) as GHRepoDetail
        } catch (e) {
          return { status: 'error', error: e instanceof Error ? e.message : String(e) }
        }

        return {
          status: 'done',
          outputs: {
            stars: String(r.stargazers_count),
            forks: String(r.forks_count),
            watchers: String(r.watchers_count),
            open_issues: String(r.open_issues_count),
            language: r.language ?? 'Unknown',
            description: r.description ?? '',
          },
          display: `${r.name}: ${r.stargazers_count.toLocaleString()} ★ · ${r.forks_count} forks · ${r.open_issues_count} issues`,
          link: r.html_url,
        }
      }

      case 'get_contributors': {
        const username = (inputs.username as string)?.trim()
        const repo = (inputs.repo as string)?.trim()
        if (!username) return { status: 'error', error: 'Username required' }
        if (!repo) return { status: 'error', error: 'Repo name required' }
        const limit = Math.min(parseInt((inputs.limit as string) || '10', 10), 100)

        type GHContributor = { login: string; contributions: number; html_url: string; avatar_url: string }

        let contributors: GHContributor[]
        try {
          contributors = await githubGet(
            `/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/contributors?per_page=${limit}`
          ) as GHContributor[]
        } catch (e) {
          return { status: 'error', error: e instanceof Error ? e.message : String(e) }
        }

        if (!Array.isArray(contributors) || contributors.length === 0) {
          return { status: 'done', outputs: { contributors: [], contributor_names: [] }, display: 'No contributors found' }
        }

        const summaries = contributors.map((c) => `@${c.login}: ${c.contributions.toLocaleString()} commits`)

        return {
          status: 'done',
          outputs: {
            contributors: summaries,
            contributor_names: contributors.map((c) => c.login),
          },
          display: `${contributors.length} contributors — top: @${contributors[0]!.login} (${contributors[0]!.contributions} commits)`,
        }
      }

      default:
        return { status: 'error', error: `Unknown action: ${action}` }
    }
  },
}
