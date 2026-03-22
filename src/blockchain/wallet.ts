declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on: (event: string, handler: (...args: unknown[]) => void) => void
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void
      isMetaMask?: boolean
    }
  }
}

export function isWalletAvailable(): boolean {
  return typeof window.ethereum !== 'undefined'
}

export async function connectWallet(): Promise<string> {
  if (!window.ethereum) throw new Error('No wallet found. Please install MetaMask.')
  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[]
  if (!accounts[0]) throw new Error('No accounts returned from wallet.')
  return accounts[0]
}

export async function getConnectedAccount(): Promise<string | null> {
  if (!window.ethereum) return null
  try {
    const accounts = (await window.ethereum.request({
      method: 'eth_accounts',
    })) as string[]
    return accounts[0] ?? null
  } catch {
    return null
  }
}

export async function getChainId(): Promise<number> {
  if (!window.ethereum) throw new Error('No wallet found.')
  const chainId = (await window.ethereum.request({ method: 'eth_chainId' })) as string
  return parseInt(chainId, 16)
}

const SEPOLIA_CHAIN_ID = '0xaa36a7' // 11155111

/** Switch MetaMask to Sepolia testnet, adding it if needed. */
async function switchToSepolia(): Promise<void> {
  try {
    await window.ethereum?.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    })
  } catch (e) {
    // Chain not added yet — add it
    if ((e as { code?: number }).code === 4902) {
      await window.ethereum?.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: SEPOLIA_CHAIN_ID,
          chainName: 'Sepolia Testnet',
          rpcUrls: ['https://rpc.sepolia.org'],
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
        }],
      })
    }
  }
}

/** Send ETH. amount is in ETH (e.g. "0.5"). Returns tx hash. */
export async function sendETH(from: string, to: string, amountEth: string): Promise<string> {
  if (!window.ethereum) throw new Error('No wallet found.')

  await switchToSepolia()

  // Parse ETH to wei (BigInt)
  const amountWei = BigInt(Math.round(parseFloat(amountEth) * 1e18))
  const valueHex = '0x' + amountWei.toString(16)

  const txHash = (await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{ from, to, value: valueHex }],
  })) as string

  return txHash
}

export function shortenAddress(addr: string): string {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

export function onAccountsChanged(cb: (accounts: string[]) => void) {
  window.ethereum?.on('accountsChanged', cb as (...args: unknown[]) => void)
  return () =>
    window.ethereum?.removeListener('accountsChanged', cb as (...args: unknown[]) => void)
}
