import type { Plugin, ExecutionContext, PluginResult } from './types.ts'
import { connectWallet, sendETH, getConnectedAccount } from '../blockchain/wallet.ts'

export const MetaMaskPlugin: Plugin = {
  id: 'metamask',
  name: 'MetaMask',
  description: 'Wallet connection, ETH transfers, and ERC-7715 delegations',
  aiDescription:
    'MetaMask wallet integration. Actions: connect_wallet (connect and get address), send_eth (transfer ETH to an address), create_delegation (ERC-7715 intent-based delegation — allow an agent or contract to act on behalf of the wallet with constraints like max amount), approve (pause for user confirmation before fund movement).',
  icon: '🦊',
  color: 'orange',
  prizeTrack: 'MetaMask Best Use of Delegations ($3,000)',
  capabilities: [
    {
      action: 'connect_wallet',
      label: 'Connect Wallet',
      description: "Connect MetaMask and get the user's wallet address",
      params: [],
      outputs: ['wallet_address'],
    },
    {
      action: 'send_eth',
      label: 'Send ETH',
      description: 'Transfer ETH from the connected wallet to a recipient',
      params: [
        { key: 'to', label: 'Recipient', placeholder: 'vitalik.eth or 0x...', inputType: 'address', required: true },
        { key: 'amount', label: 'Amount (ETH)', placeholder: '0.1', inputType: 'eth_amount', required: true },
      ],
      outputs: ['tx_hash'],
      requiresApproval: true,
    },
    {
      action: 'create_delegation',
      label: 'Create Delegation',
      description: 'ERC-7715 — delegate authority to an agent with constraints',
      params: [
        { key: 'delegate', label: 'Delegate Address', placeholder: '0x...', inputType: 'address', required: true },
        { key: 'max_amount', label: 'Max ETH per tx', placeholder: '0.01', inputType: 'eth_amount', required: true },
        { key: 'caveat', label: 'Caveat / Constraint', placeholder: 'e.g. only to whitelisted addresses', inputType: 'text', required: false },
      ],
      outputs: ['delegation_hash'],
      requiresApproval: true,
    },
    {
      action: 'approve',
      label: 'User Approval',
      description: 'Pause the flow and require explicit user confirmation',
      params: [],
      outputs: [],
      requiresApproval: true,
    },
  ],

  async execute(action, params, ctx: ExecutionContext): Promise<PluginResult> {
    switch (action) {
      case 'connect_wallet': {
        try {
          const existing = await getConnectedAccount()
          const address = existing ?? (await connectWallet())
          ctx.resolved.wallet_address = address
          ctx.walletAddress = address
          return { status: 'done', outputs: { wallet_address: address }, display: address.slice(0, 6) + '…' + address.slice(-4) }
        } catch (e) {
          return { status: 'error', error: String(e) }
        }
      }

      case 'send_eth': {
        const to =
          ctx.resolved.resolved_address ?? ctx.resolved.to ?? ctx.resolved.ens_resolved ??
          params.to ?? params.recipient ?? params.address ??
          ctx.inputs.to ?? ctx.inputs.recipient
        const amount =
          params.amount ?? params.value ?? params.eth ??
          ctx.inputs.amount ?? ctx.inputs.value
        const from = ctx.walletAddress ?? ctx.resolved.wallet_address

        if (!to) return { status: 'error', error: 'Recipient address required' }
        if (!amount) return { status: 'error', error: 'Amount required' }
        if (!from) return { status: 'error', error: 'Wallet not connected' }

        try {
          const txHash = await sendETH(from, to, amount)
          ctx.resolved.tx_hash = txHash
          return {
            status: 'done',
            outputs: { tx_hash: txHash },
            display: txHash.slice(0, 10) + '…',
            txHash,
            link: `https://etherscan.io/tx/${txHash}`,
          }
        } catch (e) {
          return { status: 'error', error: String(e) }
        }
      }

      case 'create_delegation': {
        // ERC-7715 delegation — placeholder until MetaMask Delegation SDK is integrated
        const delegate = params.delegate ?? ctx.inputs.delegate
        const maxAmount = params.max_amount ?? ctx.inputs.max_amount
        return {
          status: 'done',
          display: `Delegation to ${delegate?.slice(0, 6)}…, max ${maxAmount} ETH`,
          outputs: { delegation_hash: 'demo_delegation_' + Date.now() },
        }
      }

      case 'approve':
        return { status: 'waiting', display: 'Waiting for approval…' }

      default:
        return { status: 'error', error: `Unknown action: ${action}` }
    }
  },
}
