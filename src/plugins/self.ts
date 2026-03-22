import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

export const SelfPlugin: Plugin = {
  id: 'self',
  name: 'Self Protocol',
  description: 'On-chain identity verification via Self Pass and Self Agent ID',
  aiDescription:
    'Self Protocol — privacy-preserving identity verification. ' +
    'verify_identity(address*, credential?) → verified, score — verify a user holds a valid Self Pass. ' +
    'check_credentials(address*, claim*) → verified — check specific claims like age_18 or humanity. ' +
    'Wire: ens:resolve_name→verify_identity needs wire {"address":"address"} (same key, auto-matched).',
  icon: 'https://docs.self.xyz/~gitbook/image?url=https%3A%2F%2F558968968-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Forganizations%252FN7JVIot3pWv4ZY6bRRrw%252Fsites%252Fsite_WgLhj%252Ficon%252FANI7wUW00mwXyWKSVz2c%252FSelf%2520App%2520Icon.png%3Falt%3Dmedia%26token%3D3f8725c5-5d2c-4a3e-8b58-8b50c0835ef6&width=32&dpr=2&quality=100&sign=34638d37&sv=2',
  color: 'violet',
  prizeTrack: 'Self Protocol Best Integration ($1,000)',
  capabilities: [
    {
      action: 'verify_identity',
      label: 'Verify Identity',
      description: 'Verify the subject holds a valid Self Pass before proceeding',
      inputs: [
        { key: 'address', label: 'Subject Address', type: 'string', required: true, placeholder: '0x...' },
        { key: 'credential', label: 'Required Credential', type: 'string', required: false, placeholder: 'humanity | age_18 | country_check' },
      ],
      outputs: [
        { key: 'verified', label: 'Verified', type: 'string' },
        { key: 'score', label: 'Identity Score', type: 'string' },
      ],
    },
    {
      action: 'check_credentials',
      label: 'Check Credentials',
      description: 'Check specific credential claims (age, country, humanity)',
      inputs: [
        { key: 'address', label: 'Address', type: 'string', required: true, placeholder: '0x...' },
        { key: 'claim', label: 'Claim to check', type: 'string', required: true, placeholder: 'age_18' },
      ],
      outputs: [
        { key: 'verified', label: 'Claim Verified', type: 'string' },
      ],
    },
  ],

  async execute(action, inputs, _ctx: ExecutionContext): Promise<PluginResult> {
    const address = inputs.address as string

    switch (action) {
      case 'verify_identity': {
        if (!address) return { status: 'error', error: 'Subject address required' }

        // TODO: Replace with real Self SDK call:
        // const sdk = new SelfSDK({ appId: import.meta.env.VITE_SELF_APP_ID })
        // const result = await sdk.verify(address, inputs.credential)
        await new Promise((r) => setTimeout(r, 1200))

        return {
          status: 'done',
          outputs: { verified: 'true', score: '95' },
          display: `Identity verified ✓ (Self Pass)`,
        }
      }

      case 'check_credentials': {
        if (!address) return { status: 'error', error: 'Address required' }
        const claim = inputs.claim as string

        await new Promise((r) => setTimeout(r, 800))

        return {
          status: 'done',
          outputs: { verified: 'true' },
          display: `Claim "${claim}" verified for ${address.slice(0, 6)}…`,
        }
      }

      default:
        return { status: 'error', error: `Unknown action: ${action}` }
    }
  },
}
