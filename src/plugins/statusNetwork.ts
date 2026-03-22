import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

const STATUS_NETWORK_RPC = 'https://public.sepolia.rpc.status.network'
const STATUS_NETWORK_CHAIN_ID = '0x39B6F' // 236527

export const StatusNetworkPlugin: Plugin = {
  id: 'status',
  name: 'Status Network',
  description: 'Gasless transactions and smart contract deployment on Status Network Sepolia',
  aiDescription:
    'Status Network — a Layer 2 where gas is free (gasPrice=0). ' +
    'send_gasless_tx(to*, value?, data?) → tx_hash — send with zero gas. ' +
    'deploy_contract(bytecode*) → tx_hash, contract_address — deploy gaslessly. ' +
    'Wire: ens:resolve_name→send_gasless_tx needs wire {"address":"to"}.',
  icon: 'https://status.network/logo.svg',
  color: 'green',
  prizeTrack: 'Status Network Go Gasless ($50 qualifying)',
  capabilities: [
    {
      action: 'send_gasless_tx',
      label: 'Send Gasless Tx',
      description: 'Send a transaction on Status Network with zero gas cost',
      inputs: [
        { key: 'to', label: 'Recipient', type: 'string', required: true, placeholder: '0x...' },
        { key: 'value', label: 'Value (ETH)', type: 'string', required: false, placeholder: '0' },
        { key: 'data', label: 'Calldata', type: 'string', required: false, placeholder: '0x' },
      ],
      outputs: [
        { key: 'tx_hash', label: 'Transaction Hash', type: 'string' },
      ],
      requiresApproval: true,
    },
    {
      action: 'deploy_contract',
      label: 'Deploy Contract',
      description: 'Deploy a smart contract to Status Network Sepolia gaslessly',
      inputs: [
        { key: 'bytecode', label: 'Contract Bytecode', type: 'string', required: true, placeholder: '0x608060...' },
      ],
      outputs: [
        { key: 'tx_hash', label: 'Transaction Hash', type: 'string' },
        { key: 'contract_address', label: 'Contract Address', type: 'string' },
      ],
      requiresApproval: true,
    },
  ],

  async execute(action, inputs, ctx: ExecutionContext): Promise<PluginResult> {
    const from = ctx.walletAddress
    if (!from) return { status: 'error', error: 'Wallet not connected' }

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
        const to = inputs.to as string
        if (!to) return { status: 'error', error: 'Recipient required' }

        const valueEth = (inputs.value as string) ?? '0'
        const valueWei = BigInt(Math.round(parseFloat(valueEth) * 1e18))

        try {
          const txHash = (await window.ethereum?.request({
            method: 'eth_sendTransaction',
            params: [{
              from,
              to,
              value: '0x' + valueWei.toString(16),
              data: (inputs.data as string) ?? '0x',
              gasPrice: '0x0',
            }],
          })) as string

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
        const bytecode = inputs.bytecode as string
        if (!bytecode) return { status: 'error', error: 'Bytecode required' }

        try {
          const txHash = (await window.ethereum?.request({
            method: 'eth_sendTransaction',
            params: [{ from, data: bytecode, gasPrice: '0x0' }],
          })) as string

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
