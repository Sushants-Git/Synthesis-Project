import type { Plugin, ExecutionContext, PluginResult } from './types.ts'
import { resolveENS, lookupAddress } from '../blockchain/ens.ts'

export const ENSPlugin: Plugin = {
  id: 'ens',
  name: 'ENS',
  description: 'Resolve ENS names to addresses and reverse-lookup addresses to names',
  aiDescription:
    'ENS — Ethereum Name Service. Converts human-readable .eth names to 0x addresses (and reverse). ' +
    'resolve_name: one name → one address. Use before send_eth. Wire: {"address":"to"}. ' +
    'resolve_batch: list of names → list of addresses. Use before batch_send. Wire: {"addresses":"recipients"}. ' +
    'ALWAYS use resolve_batch for 2+ names — never multiple resolve_name nodes. ' +
    'Hardcode names in params as JSON array string: {"names":"[\\"a.eth\\",\\"b.eth\\"]"}. ' +
    'lookup_address: reverse lookup — 0x address → .eth name. ' +
    'Only use ENS nodes when the user explicitly provides .eth names. Twitter handles are NOT ENS names.',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" d="M0 0h24v24H0z"/><path fill="url(#ens-grad)" d="M6.9 10.526c.154.33.527.973.527.973l4.329-7.213L7.534 7.26a1.86 1.86 0 0 0-.6.664a3.1 3.1 0 0 0-.03 2.602zM5.19 12.9a4.9 4.9 0 0 0 1.886 3.531l4.676 3.283s-2.919-4.243-5.383-8.473a4.3 4.3 0 0 1-.497-1.44a2.3 2.3 0 0 1 0-.69l-.189.365a5.6 5.6 0 0 0-.501 1.628c-.052.6-.043 1.2.012 1.8zm11.91.574q-.247-.495-.527-.973l-4.324 7.213l4.221-2.97c.249-.171.454-.398.6-.668a3.1 3.1 0 0 0 .026-2.602zm1.71-2.374a4.88 4.88 0 0 0-1.886-3.531L12.25 4.286s2.918 4.243 5.383 8.473c.248.445.415.934.492 1.44a2.3 2.3 0 0 1 0 .69l.189-.365c.253-.514.42-1.063.506-1.628c.051-.6.043-1.2-.013-1.8z"/><defs><linearGradient id="ens-grad" x1="7.962" x2="18.572" y1="5.939" y2="18.505" gradientUnits="userSpaceOnUse"><stop stop-color="#7C97FA"/><stop offset="1" stop-color="#53B1EF"/></linearGradient></defs></svg>',
  color: 'blue',
  prizeTrack: 'ENS Identity + Communication + Open Integration (up to $1,100)',
  capabilities: [
    {
      action: 'resolve_name',
      label: 'Resolve ENS Name',
      description: 'Convert a single ENS name to a wallet address',
      inputs: [
        { key: 'name', label: 'ENS Name', type: 'string', required: true, placeholder: 'vitalik.eth' },
      ],
      outputs: [
        { key: 'address', label: 'Wallet Address', type: 'string' },
      ],
    },
    {
      action: 'resolve_batch',
      label: 'Resolve ENS Names (batch)',
      description: 'Convert a list of ENS names to wallet addresses',
      inputs: [
        { key: 'names', label: 'ENS Names', type: 'string[]', required: true },
      ],
      outputs: [
        { key: 'addresses', label: 'Resolved Addresses', type: 'string[]' },
      ],
    },
    {
      action: 'lookup_address',
      label: 'Reverse Lookup',
      description: 'Find the ENS name for a wallet address',
      inputs: [
        { key: 'address', label: 'Wallet Address', type: 'string', required: true, placeholder: '0x...' },
      ],
      outputs: [
        { key: 'name', label: 'ENS Name', type: 'string' },
      ],
    },
  ],

  async execute(action, inputs, _ctx: ExecutionContext): Promise<PluginResult> {
    switch (action) {
      case 'resolve_name': {
        const name = inputs.name as string
        if (!name) return { status: 'error', error: 'ENS name required' }

        const address = await resolveENS(name)
        if (!address) return { status: 'error', error: `Could not resolve ${name}` }

        return {
          status: 'done',
          outputs: { address },
          display: `${name} → ${address.slice(0, 6)}…${address.slice(-4)}`,
        }
      }

      case 'resolve_batch': {
        const raw = inputs.names
        let names: string[]
        if (Array.isArray(raw)) {
          names = raw
        } else if (typeof raw === 'string' && raw.trim()) {
          try {
            const parsed = JSON.parse(raw)
            names = Array.isArray(parsed) ? parsed.map(String) : [raw]
          } catch {
            names = raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)
          }
        } else {
          names = []
        }
        if (!names.length) return { status: 'error', error: 'Names list required' }

        const results: Array<{ name: string; address: string | null }> = []
        for (const name of names) {
          const address = await resolveENS(name.trim())
          results.push({ name: name.trim(), address })
        }

        const succeeded = results.filter((r) => r.address !== null)
        const failed = results.filter((r) => r.address === null)
        const addresses = succeeded.map((r) => r.address as string)

        return {
          status: 'done',
          outputs: { addresses },
          display: `Resolved ${succeeded.length}/${names.length} ENS names${failed.length ? ` (${failed.length} failed)` : ''}`,
        }
      }

      case 'lookup_address': {
        const address = inputs.address as string
        if (!address) return { status: 'error', error: 'Address required' }

        const name = await lookupAddress(address)
        return {
          status: 'done',
          outputs: name ? { name } : {},
          display: name ?? 'No ENS name found',
        }
      }

      default:
        return { status: 'error', error: `Unknown action: ${action}` }
    }
  },
}
