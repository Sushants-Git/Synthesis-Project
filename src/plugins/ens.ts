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
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" d="M0 0h24v24H0z"/><path fill="url(#ens-grad)" d="M6.9 10.526c.154.33.527.973.527.973l4.329-7.213L7.534 7.26a1.86 1.86 0 0 0-.6.664a3.1 3.1 0 0 0-.03 2.602zM5.19 12.9a4.9 4.9 0 0 0 1.886 3.531l4.676 3.283s-2.919-4.243-5.383-8.473a4.3 4.3 0 0 1-.497-1.44a2.3 2.3 0 0 1 0-.69l-.189.365a5.6 5.6 0 0 0-.501 1.628c-.052.6-.043 1.2.012 1.8zm11.91.574q-.247-.495-.527-.973l-4.324 7.213l4.221-2.97c.249-.171.454-.398.6-.668a3.1 3.1 0 0 0 .026-2.602zm1.71-2.374a4.88 4.88 0 0 0-1.886-3.531L12.25 4.286s2.918 4.243 5.383 8.473c.248.445.415.934.492 1.44a2.3 2.3 0 0 1 0 .69l.189-.365c.253-.514.42-1.063.506-1.628c.051-.6.043-1.2-.013-1.8z"/><defs><linearGradient id="ens-grad" x1="7.962" x2="18.572" y1="5.939" y2="18.505" gradientUnits="userSpaceOnUse"><stop stop-color="#7C97FA"/><stop offset="1" stop-color="#53B1EF"/></linearGradient></defs></svg>',
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

        const addressesJson = JSON.stringify(addresses)
        return {
          status: 'done',
          outputs: {
            addresses: addressesJson,
            // Override wallets/rows so downstream batch_send gets hex addresses, not ENS names
            wallets: addressesJson,
            rows: addressesJson,
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
