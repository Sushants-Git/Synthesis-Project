import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

// Status Network Sepolia Testnet
const STATUS_NETWORK_RPC = 'https://public.sepolia.rpc.status.network'
const STATUS_NETWORK_CHAIN_ID = '0x39B6F' // 236527

export const StatusNetworkPlugin: Plugin = {
  id: 'status',
  name: 'Status Network',
  description: 'Gasless transactions and smart contract deployment on Status Network Sepolia',
  aiDescription:
    'Status Network plugin — a Layer 2 where gas is free (gasPrice=0). Actions: send_gasless_tx (send a transaction on Status Network Sepolia with no gas cost — great for micropayments and agent-triggered actions), deploy_contract (deploy a smart contract to Status Network Sepolia testnet with gasless execution). Use this for any action that should be gas-free.',
  icon: '🟢',
  color: 'green',
  prizeTrack: 'Status Network Go Gasless ($50 qualifying)',
  capabilities: [
    {
      action: 'send_gasless_tx',
      label: 'Send Gasless Tx',
      description: 'Send a transaction on Status Network with zero gas cost',
      params: [
        { key: 'to', label: 'Recipient', placeholder: '0x... or ENS', inputType: 'address', required: true },
        { key: 'data', label: 'Calldata (optional)', placeholder: '0x', inputType: 'text', required: false },
        { key: 'value', label: 'Value (ETH, optional)', placeholder: '0', inputType: 'eth_amount', required: false },
      ],
      outputs: ['tx_hash'],
      requiresApproval: true,
    },
    {
      action: 'deploy_contract',
      label: 'Deploy Contract',
      description: 'Deploy a smart contract to Status Network Sepolia gaslessly',
      params: [
        { key: 'bytecode', label: 'Contract Bytecode', placeholder: '0x608060...', inputType: 'text', required: true },
      ],
      outputs: ['contract_address', 'tx_hash'],
      requiresApproval: true,
    },
  ],

  async execute(action, params, ctx: ExecutionContext): Promise<PluginResult> {
    const from = ctx.walletAddress ?? ctx.resolved.wallet_address
    if (!from) return { status: 'error', error: 'Wallet not connected' }

    // Switch MetaMask to Status Network
    try {
      await window.ethereum?.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: STATUS_NETWORK_CHAIN_ID,
          chainName: 'Status Network Sepolia',
          rpcUrls: [STATUS_NETWORK_RPC],
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          blockExplorerUrls: ['https://sepoliascan.status.network'],
        }],
      })
      await window.ethereum?.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: STATUS_NETWORK_CHAIN_ID }],
      })
    } catch {
      // May already be on Status Network, or user denied — continue
    }

    switch (action) {
      case 'send_gasless_tx': {
        const to = ctx.resolved.resolved_address ?? ctx.resolved.to ?? params.to ?? ctx.inputs.to
        if (!to) return { status: 'error', error: 'Recipient required' }

        const valueEth = params.value ?? ctx.inputs.value ?? '0'
        const valueWei = BigInt(Math.round(parseFloat(valueEth) * 1e18))

        try {
          const txHash = (await window.ethereum?.request({
            method: 'eth_sendTransaction',
            params: [{
              from,
              to,
              value: '0x' + valueWei.toString(16),
              data: params.data ?? '0x',
              gasPrice: '0x0',  // Gasless!
              gas: '0x0',
            }],
          })) as string

          ctx.resolved.tx_hash = txHash
          return {
            status: 'done',
            outputs: { tx_hash: txHash },
            display: txHash.slice(0, 10) + '… (gasless)',
            txHash,
            link: `https://sepoliascan.status.network/tx/${txHash}`,
          }
        } catch (e) {
          return { status: 'error', error: String(e) }
        }
      }

      case 'deploy_contract': {
        const bytecode = params.bytecode ?? ctx.inputs.bytecode
        if (!bytecode) return { status: 'error', error: 'Bytecode required' }

        try {
          const txHash = (await window.ethereum?.request({
            method: 'eth_sendTransaction',
            params: [{
              from,
              data: bytecode,
              gasPrice: '0x0',
              gas: '0x0',
            }],
          })) as string

          ctx.resolved.deploy_tx = txHash
          return {
            status: 'done',
            outputs: { tx_hash: txHash },
            display: 'Deployed (gasless) — ' + txHash.slice(0, 10) + '…',
            txHash,
            link: `https://sepoliascan.status.network/tx/${txHash}`,
          }
        } catch (e) {
          return { status: 'error', error: String(e) }
        }
      }

      default:
        return { status: 'error', error: `Unknown action: ${action}` }
    }
  },
}
