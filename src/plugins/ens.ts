import type { Plugin, ExecutionContext, PluginResult } from './types.ts'
import { resolveENS, lookupAddress } from '../blockchain/ens.ts'

export const ENSPlugin: Plugin = {
  id: 'ens',
  name: 'ENS',
  description: 'Resolve ENS names to addresses and replace hex addresses in the UX',
  aiDescription:
    'ENS (Ethereum Name Service) integration. ' +
    'Actions: ' +
    'resolve_name (single ENS name → address, e.g. "vitalik.eth" → "0x…"), ' +
    'resolve_batch (array of ENS names → array of addresses — use this when upstream rows/wallets is a list of ENS names, e.g. from sheets:fetch_rows), ' +
    'lookup_address (reverse: hex address → ENS name). ' +
    'Use resolve_batch when piping a list from Google Sheets. ' +
    'Use resolve_name for a single known name.',
  icon: '🔷',
  color: 'blue',
  prizeTrack: 'ENS Identity + Communication + Open Integration (up to $1,100)',
  capabilities: [
    {
      action: 'resolve_name',
      label: 'Resolve ENS Name',
      description: 'Convert a single ENS name to a wallet address',
      params: [
        { key: 'ens_name', label: 'ENS Name', placeholder: 'vitalik.eth', inputType: 'ens_name', required: true },
      ],
      outputs: ['resolved_address', 'address', 'ens_name', 'to'],
    },
    {
      action: 'resolve_batch',
      label: 'Resolve ENS Names (batch)',
      description: 'Convert a list of ENS names to wallet addresses',
      params: [
        { key: 'names', label: 'ENS Names (JSON array)', placeholder: '["vitalik.eth","nick.eth"]', inputType: 'text', required: true },
      ],
      outputs: ['addresses', 'mapping', 'count'],
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

        return {
          status: 'done',
          outputs: { resolved_address: address, address, ens_name: name, to: address },
          display: `${name} → ${address.slice(0, 6)}…${address.slice(-4)}`,
        }
      }

      case 'resolve_batch': {
        // Accept names from params, or fall back to rows/wallets from upstream
        const raw =
          params.names ?? params.rows ?? params.wallets ??
          ctx.inputs.names ?? ctx.resolved.rows ?? ctx.resolved.wallets

        if (!raw) return { status: 'error', error: 'Names list required — connect a sheets:fetch_rows node upstream' }

        let names: string[]
        try {
          names = JSON.parse(raw) as string[]
          if (!Array.isArray(names)) throw new Error()
        } catch {
          return { status: 'error', error: 'Names must be a JSON array' }
        }

        const resolved: Array<{ name: string; address: string | null }> = []
        for (const name of names) {
          const address = await resolveENS(name.trim())
          resolved.push({ name: name.trim(), address })
        }

        const succeeded = resolved.filter((r) => r.address !== null)
        const failed = resolved.filter((r) => r.address === null)

        const addresses = succeeded.map((r) => r.address as string)
        const mapping = Object.fromEntries(succeeded.map((r) => [r.name, r.address as string]))

        return {
          status: 'done',
          outputs: {
            addresses: JSON.stringify(addresses),
            mapping: JSON.stringify(mapping),
            count: String(succeeded.length),
          },
          display: `Resolved ${succeeded.length}/${names.length} ENS names${failed.length ? ` (${failed.length} failed)` : ''}`,
        }
      }

      case 'lookup_address': {
        const address =
          params.address ?? params.resolved_address ?? params.wallet ??
          ctx.inputs.address ?? ctx.resolved.address ?? ctx.resolved.resolved_address
        if (!address) return { status: 'error', error: 'Address required' }

        const name = await lookupAddress(address)
        const display = name ?? 'No ENS name found'
        return { status: 'done', outputs: name ? { ens_name: name } : {}, display }
      }

      default:
        return { status: 'error', error: `Unknown action: ${action}` }
    }
  },
}
