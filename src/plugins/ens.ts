import type { Plugin, ExecutionContext, PluginResult } from './types.ts'
import { resolveENS, lookupAddress } from '../blockchain/ens.ts'

export const ENSPlugin: Plugin = {
  id: 'ens',
  name: 'ENS',
  description: 'Resolve ENS names to addresses and replace hex addresses in the UX',
  aiDescription:
    'ENS (Ethereum Name Service) integration. Actions: resolve_name (convert an ENS name like "vitalik.eth" to a hex address — always use this before sending to an ENS name), lookup_address (reverse lookup: get the ENS name for a hex address, useful for displaying human-readable identities). Use ENS names wherever possible — never show raw hex addresses to users.',
  icon: '🔷',
  color: 'blue',
  prizeTrack: 'ENS Identity + Communication + Open Integration (up to $1,100)',
  capabilities: [
    {
      action: 'resolve_name',
      label: 'Resolve ENS Name',
      description: 'Convert an ENS name to a wallet address',
      params: [
        { key: 'ens_name', label: 'ENS Name', placeholder: 'vitalik.eth', inputType: 'ens_name', required: true },
      ],
      outputs: ['resolved_address', 'address', 'ens_name'],
    },
    {
      action: 'lookup_address',
      label: 'Lookup Address',
      description: 'Find the ENS name for a wallet address',
      params: [
        { key: 'address', label: 'Address', placeholder: '0x...', inputType: 'address', required: true },
      ],
      outputs: ['ens_name'],
    },
  ],

  async execute(action, params, ctx: ExecutionContext): Promise<PluginResult> {
    switch (action) {
      case 'resolve_name': {
        const name =
          params.ens_name ?? params.name ?? params.input ??
          ctx.inputs.ens_name ?? ctx.inputs.name ??
          ctx.resolved.ens_name ?? ctx.resolved.name
        if (!name) return { status: 'error', error: 'ENS name required' }

        const address = await resolveENS(name)
        if (!address) return { status: 'error', error: `Could not resolve ${name}` }

        // Store under multiple keys so any downstream plugin can find it
        ctx.resolved.resolved_address = address
        ctx.resolved.address = address
        ctx.resolved.ens_resolved = address
        ctx.resolved.to = address
        ctx.resolved.ens_name = name
        return {
          status: 'done',
          outputs: { resolved_address: address, address, ens_name: name, to: address },
          display: `${name} → ${address.slice(0, 6)}…${address.slice(-4)}`,
        }
      }

      case 'lookup_address': {
        const address = params.address ?? params.wallet ?? ctx.inputs.address ?? ctx.resolved.wallet_address ?? ctx.resolved.resolved_address
        if (!address) return { status: 'error', error: 'Address required' }

        const name = await lookupAddress(address)
        const display = name ?? 'No ENS name found'
        if (name) ctx.resolved.ens_name = name
        return { status: 'done', outputs: name ? { ens_name: name } : {}, display }
      }

      default:
        return { status: 'error', error: `Unknown action: ${action}` }
    }
  },
}
