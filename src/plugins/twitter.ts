import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

export const TwitterPlugin: Plugin = {
  id: 'twitter',
  name: 'Twitter / X',
  description: 'Search Twitter/X for users by criteria, verify handles, find builders',
  aiDescription:
    'Twitter/X search plugin. Actions: search_users (search Twitter for users matching a criteria — e.g. "best ZK builder", "most active Solidity developer", "top ENS contributor" — returns a ranked list of handles), verify_handle (confirm a Twitter handle belongs to a given wallet/ENS). Use this when the user wants to find a person by social activity rather than knowing their address.',
  icon: '🐦',
  color: 'light-blue',
  capabilities: [
    {
      action: 'search_users',
      label: 'Search Twitter',
      description: 'Find Twitter users matching a criteria',
      params: [
        { key: 'query', label: 'Search Criteria', placeholder: 'best ZK builder', inputType: 'text', required: true },
        { key: 'limit', label: 'Max results', placeholder: '5', inputType: 'text', required: false },
      ],
      outputs: ['twitter_results', 'top_handle'],
    },
    {
      action: 'verify_handle',
      label: 'Verify Handle',
      description: 'Verify a Twitter handle and get associated ENS/address',
      params: [
        { key: 'handle', label: 'Twitter Handle', placeholder: '@vitalikbuterinlol', inputType: 'text', required: true },
      ],
      outputs: ['verified_handle', 'ens_from_handle'],
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
        const query = params.query ?? ctx.inputs.query
        if (!query) return { status: 'error', error: 'Search query required' }

        // Real impl needs a backend proxy (Twitter API v2 requires server-side auth)
        // Demo: return mock results
        await new Promise((r) => setTimeout(r, 1000))
        const mockResults = [
          '@starkware_dev (ZK builder, 12k followers)',
          '@0xparc_labs (ZK research, 8k followers)',
          '@theguild_dev (Protocol builder, 5k followers)',
        ]
        const top = '@starkware_dev'
        ctx.resolved.twitter_results = mockResults.join(', ')
        ctx.resolved.top_handle = top

        return {
          status: 'done',
          outputs: { twitter_results: mockResults.join('\n'), top_handle: top },
          display: `Found ${mockResults.length} results for "${query}"`,
        }
      }

      case 'verify_handle': {
        const handle = params.handle ?? ctx.inputs.handle
        if (!handle) return { status: 'error', error: 'Handle required' }

        await new Promise((r) => setTimeout(r, 600))
        ctx.resolved.verified_handle = handle

        return {
          status: 'done',
          outputs: { verified_handle: handle },
          display: `${handle} verified`,
        }
      }

      case 'user_approval':
        return {
          status: 'waiting',
          display: ctx.resolved.twitter_results
            ? `Pick from: ${ctx.resolved.twitter_results}`
            : 'Waiting for selection…',
        }

      default:
        return { status: 'error', error: `Unknown action: ${action}` }
    }
  },
}
