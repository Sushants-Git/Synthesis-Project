import type { Plugin, ExecutionContext, PluginResult } from './types.ts'
import { connectWallet, sendETH, getConnectedAccount } from '../blockchain/wallet.ts'

export const MetaMaskPlugin: Plugin = {
  id: 'metamask',
  name: 'MetaMask',
  description: 'Wallet connection, ETH transfers, and ERC-7715 delegations',
  aiDescription:
    'MetaMask — wallet connection and ETH transfers on Ethereum Sepolia testnet. ' +
    'approve() is a pure gate node (no inputs, no outputs) — always place it FIRST in any flow that sends ETH. ' +
    'connect_wallet() auto-connects if not already connected — only add it explicitly when the flow is just about connecting. ' +
    'send_eth: single recipient, requires "to" (0x address) and "amount" (ETH). ' +
    'batch_send: multiple recipients array. Use EITHER "amount" (per-recipient) OR "total_amount" (split equally) — never both. ' +
    'create_delegation: ERC-7715 delegation with spending limits. ' +
    'For gasless transactions use status:send_gasless_tx instead.',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 240"><path fill="#E17726" d="M250.066 0L140.219 81.279l20.427-47.9z"/><path fill="#E27625" d="m6.191.096l89.181 33.289l19.396 48.528zM205.86 172.858l48.551.924l-16.968 57.642l-59.243-16.311zm-155.721 0l27.557 42.255l-59.143 16.312l-16.865-57.643z"/><path fill="#E27625" d="m112.131 69.552l1.984 64.083l-59.371-2.701l16.888-25.478l.214-.245zm31.123-.715l40.9 36.376l.212.244l16.888 25.478l-59.358 2.7zM79.435 173.044l32.418 25.259l-37.658 18.181zm97.136-.004l5.131 43.445l-37.553-18.184z"/><path fill="#D5BFB2" d="m144.978 195.922l38.107 18.452l-35.447 16.846l.368-11.134zm-33.967.008l-2.909 23.974l.239 11.303l-35.53-16.833z"/><path fill="#233447" d="m100.007 141.999l9.958 20.928l-33.903-9.932zm55.985.002l24.058 10.994l-34.014 9.929z"/><path fill="#CC6228" d="m82.026 172.83l-5.48 45.04l-29.373-44.055zm91.95.001l34.854.984l-29.483 44.057zm28.136-44.444l-25.365 25.851l-19.557-8.937l-9.363 19.684l-6.138-33.849zm-148.237 0l60.435 2.749l-6.139 33.849l-9.365-19.681l-19.453 8.935z"/><path fill="#E27525" d="m52.166 123.082l28.698 29.121l.994 28.749zm151.697-.052l-29.746 57.973l1.12-28.8zm-90.956 1.826l1.155 7.27l2.854 18.111l-1.835 55.625l-8.675-44.685l-.003-.462zm30.171-.101l6.521 35.96l-.003.462l-8.697 44.797l-.344-11.205l-1.357-44.862z"/><path fill="#F5841F" d="m177.788 151.046l-.971 24.978l-30.274 23.587l-6.12-4.324l6.86-35.335zm-99.471 0l30.399 8.906l6.86 35.335l-6.12 4.324l-30.275-23.589z"/><path fill="#C0AC9D" d="m67.018 208.858l38.732 18.352l-.164-7.837l3.241-2.845h38.334l3.358 2.835l-.248 7.831l38.487-18.29l-18.728 15.476l-22.645 15.553h-38.869l-22.63-15.617z"/><path fill="#161616" d="m142.204 193.479l5.476 3.869l3.209 25.604l-4.644-3.921h-36.476l-4.556 4l3.104-25.681l5.478-3.871z"/><path fill="#763E1A" d="M242.814 2.25L256 41.807l-8.235 39.997l5.864 4.523l-7.935 6.054l5.964 4.606l-7.897 7.191l4.848 3.511l-12.866 15.026l-52.77-15.365l-.457-.245l-38.027-32.078zm-229.628 0l98.326 72.777l-38.028 32.078l-.457.245l-52.77 15.365l-12.866-15.026l4.844-3.508l-7.892-7.194l5.952-4.601l-8.054-6.071l6.085-4.526L0 41.809z"/><path fill="#F5841F" d="m180.392 103.99l55.913 16.279l18.165 55.986h-47.924l-33.02.416l24.014-46.808zm-104.784 0l-17.151 25.873l24.017 46.808l-33.005-.416H1.631l18.063-55.985zm87.776-70.878l-15.639 42.239l-3.319 57.06l-1.27 17.885l-.101 45.688h-30.111l-.098-45.602l-1.274-17.986l-3.32-57.045l-15.637-42.239z"/></svg>',
  color: 'orange',
  prizeTrack: 'MetaMask Best Use of Delegations ($3,000)',
  capabilities: [
    {
      action: 'connect_wallet',
      label: 'Connect Wallet',
      description: "Connect MetaMask and get the user's wallet address",
      inputs: [],
      outputs: [
        { key: 'wallet_address', label: 'Wallet Address', type: 'string' },
      ],
    },
    {
      action: 'send_eth',
      label: 'Send ETH',
      description: 'Transfer ETH from the connected wallet to a recipient',
      inputs: [
        { key: 'to', label: 'Recipient', type: 'string', required: true, placeholder: '0x...' },
        { key: 'amount', label: 'Amount (ETH)', type: 'string', required: true, placeholder: '0.1' },
      ],
      outputs: [
        { key: 'tx_hash', label: 'Transaction Hash', type: 'string' },
      ],
    },
    {
      action: 'batch_send',
      label: 'Batch Send ETH',
      description: 'Send ETH to a list of addresses',
      inputs: [
        { key: 'recipients', label: 'Recipient Addresses', type: 'string[]', required: true },
        { key: 'amount', label: 'Amount per recipient (ETH)', type: 'string', required: false, placeholder: '0.01' },
        { key: 'total_amount', label: 'Total ETH to split equally', type: 'string', required: false, placeholder: '0.5' },
      ],
      outputs: [
        { key: 'tx_hashes', label: 'Transaction Hashes', type: 'string[]' },
        { key: 'sent_count', label: 'Sent Count', type: 'string' },
      ],
    },
    {
      action: 'create_delegation',
      label: 'Create Delegation',
      description: 'ERC-7715 — delegate authority to an agent with constraints',
      inputs: [
        { key: 'delegate', label: 'Delegate Address', type: 'string', required: true, placeholder: '0x...' },
        { key: 'max_amount', label: 'Max ETH per tx', type: 'string', required: true, placeholder: '0.01' },
        { key: 'caveat', label: 'Caveat / Constraint', type: 'string', required: false, placeholder: 'only to whitelisted addresses' },
      ],
      outputs: [
        { key: 'delegation_hash', label: 'Delegation Hash', type: 'string' },
      ],
      requiresApproval: true,
    },
    {
      action: 'approve',
      label: 'User Approval',
      description: 'Pause the flow and require explicit user confirmation',
      inputs: [],
      outputs: [],
      requiresApproval: true,
    },
  ],

  async execute(action, inputs, ctx: ExecutionContext): Promise<PluginResult> {
    switch (action) {
      case 'connect_wallet': {
        try {
          const existing = await getConnectedAccount()
          const address = existing ?? (await connectWallet())
          ctx.walletAddress = address
          return {
            status: 'done',
            outputs: { wallet_address: address },
            display: address.slice(0, 6) + '…' + address.slice(-4),
          }
        } catch (e) {
          return { status: 'error', error: String(e) }
        }
      }

      case 'send_eth': {
        const to = inputs.to as string
        const amount = inputs.amount as string

        let from = ctx.walletAddress
        if (!from) {
          try {
            from = (await getConnectedAccount()) ?? (await connectWallet())
            ctx.walletAddress = from
          } catch (e) {
            return { status: 'error', error: 'Could not connect wallet: ' + String(e) }
          }
        }

        if (!to) return { status: 'error', error: 'Recipient address required' }
        if (!amount) return { status: 'error', error: 'Amount required' }

        try {
          const txHash = await sendETH(from, to, amount)
          return {
            status: 'done',
            outputs: { tx_hash: txHash },
            display: txHash.slice(0, 10) + '…',
            txHash,
            link: `https://sepolia.etherscan.io/tx/${txHash}`,
          }
        } catch (e) {
          return { status: 'error', error: String(e) }
        }
      }

      case 'batch_send': {
        const recipients = inputs.recipients as string[]
        if (!recipients?.length) {
          return { status: 'error', error: 'No recipient list found — connect an upstream node that outputs addresses' }
        }

        let amount: string
        if (inputs.total_amount) {
          const total = parseFloat(inputs.total_amount as string)
          amount = (total / recipients.length).toFixed(6)
        } else {
          amount = inputs.amount as string
        }
        if (!amount) return { status: 'error', error: 'amount or total_amount required' }

        let from = ctx.walletAddress
        if (!from) {
          try {
            from = (await getConnectedAccount()) ?? (await connectWallet())
            ctx.walletAddress = from
          } catch (e) {
            return { status: 'error', error: 'Could not connect wallet: ' + String(e) }
          }
        }

        const validWallets = recipients.filter((a) => a.startsWith('0x') && a.length >= 40)
        if (validWallets.length === 0) {
          return {
            status: 'error',
            error: `No valid 0x addresses found. Got: ${recipients.slice(0, 3).join(', ')}`,
          }
        }

        if (inputs.total_amount) {
          const total = parseFloat(inputs.total_amount as string)
          amount = (total / validWallets.length).toFixed(6)
        }

        const txHashes: string[] = []
        for (const to of validWallets) {
          try {
            const hash = await sendETH(from, to, amount)
            txHashes.push(hash)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return { status: 'error', error: `Failed sending to ${to.slice(0, 10)}…: ${msg}` }
          }
        }

        return {
          status: 'done',
          outputs: { tx_hashes: txHashes, sent_count: String(txHashes.length) },
          display: `Sent ${amount} ETH × ${txHashes.length} addresses`,
        }
      }

      case 'create_delegation': {
        const delegate = inputs.delegate as string
        const maxAmount = inputs.max_amount as string
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
