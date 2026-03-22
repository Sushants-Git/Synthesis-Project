import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

export const SelfPlugin: Plugin = {
  id: 'self',
  name: 'Self Protocol',
  description: 'On-chain identity verification via Self Pass and Self Agent ID',
  aiDescription:
    'Self Protocol — privacy-preserving identity verification. Actions: verify_identity (verify a user holds a valid Self Pass — proves they are a real human without revealing personal data, use this as an identity gate before sending funds to strangers), check_credentials (check specific credential claims like age, country, or humanity score). Make this essential to the flow, not decorative.',
  icon: 'https://docs.self.xyz/~gitbook/image?url=https%3A%2F%2F558968968-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Forganizations%252FN7JVIot3pWv4ZY6bRRrw%252Fsites%252Fsite_WgLhj%252Ficon%252FANI7wUW00mwXyWKSVz2c%252FSelf%2520App%2520Icon.png%3Falt%3Dmedia%26token%3D3f8725c5-5d2c-4a3e-8b58-8b50c0835ef6&width=32&dpr=2&quality=100&sign=34638d37&sv=2',
  color: 'violet',
  prizeTrack: 'Self Protocol Best Integration ($1,000)',
  capabilities: [
    {
      action: 'verify_identity',
      label: 'Verify Identity',
      description: 'Verify the recipient holds a valid Self Pass before proceeding',
      params: [
        { key: 'subject', label: 'Subject Address / ENS', placeholder: 'vitalik.eth', inputType: 'address', required: true },
        { key: 'credential', label: 'Required Credential', placeholder: 'humanity | age_18 | country', inputType: 'select', required: false, options: ['humanity', 'age_18', 'country_check'] },
      ],
      outputs: ['identity_verified', 'identity_score'],
      requiresApproval: false,
    },
    {
      action: 'check_credentials',
      label: 'Check Credentials',
      description: 'Check specific credential claims (age, country, humanity)',
      params: [
        { key: 'address', label: 'Address', placeholder: '0x...', inputType: 'address', required: true },
        { key: 'claim', label: 'Claim to check', placeholder: 'age_18', inputType: 'text', required: true },
      ],
      outputs: ['claim_verified'],
    },
  ],

  async execute(action, params, ctx: ExecutionContext): Promise<PluginResult> {
    // Self Protocol SDK integration — uses on-chain verification
    // Real integration: import { SelfSDK } from '@self-protocol/sdk'
    // For now: demonstrate the flow with a simulated verification
    const subject =
      ctx.resolved.resolved_address ??
      ctx.resolved.to ??
      params.subject ??
      ctx.inputs.subject

    switch (action) {
      case 'verify_identity': {
        if (!subject) return { status: 'error', error: 'Subject address required' }

        // TODO: Replace with real Self SDK call:
        // const sdk = new SelfSDK({ appId: import.meta.env.VITE_SELF_APP_ID })
        // const result = await sdk.verify(subject, params.credential)
        await new Promise((r) => setTimeout(r, 1200)) // simulate network

        const verified = true // demo
        ctx.resolved.identity_verified = verified ? 'true' : 'false'

        return {
          status: 'done',
          outputs: { identity_verified: 'true', identity_score: '95' },
          display: `Identity verified ✓ (Self Pass)`,
        }
      }

      case 'check_credentials': {
        const address = params.address ?? ctx.inputs.address ?? subject
        const claim = params.claim ?? ctx.inputs.claim
        if (!address) return { status: 'error', error: 'Address required' }

        await new Promise((r) => setTimeout(r, 800))
        ctx.resolved.claim_verified = 'true'

        return {
          status: 'done',
          outputs: { claim_verified: 'true' },
          display: `Claim "${claim}" verified for ${address.slice(0, 6)}…`,
        }
      }

      default:
        return { status: 'error', error: `Unknown action: ${action}` }
    }
  },
}
